-- Stage 15 acceptance hardening.
-- Migration 35 remains immutable; this migration closes the login eligibility
-- race and makes parent-visible subject identity use the frozen snapshot rows.

create or replace function public.verify_parent_access(
  access_code_lookup_hash text,
  pin_text text,
  client_key_hash text
)
returns table(ok boolean, session_token text, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal, extensions
as $$
declare
  limit_row public.parent_access_rate_limits%rowtype;
  credential public.student_access_credentials%rowtype;
  generated_token text;
  normalized_hash text := lower(btrim(access_code_lookup_hash));
  client_hash text := lower(btrim(client_key_hash));
  pin_ok boolean := false;
  request_limit integer := 60;
begin
  if normalized_hash !~ '^[0-9a-f]{64}$' or pin_text is null or length(pin_text) <> 8
    or pin_text !~ '^[0-9]{8}$' or client_key_hash is null
    or length(client_hash) <> 64 then
    return query select false, null::text, 0;
    return;
  end if;

  insert into public.parent_access_rate_limits(client_key_hash)
    values (client_hash)
    on conflict on constraint parent_access_rate_limits_client_key_hash_key do nothing;
  select * into limit_row from public.parent_access_rate_limits
    where parent_access_rate_limits.client_key_hash = client_hash for update;
  if limit_row.window_started_at + interval '15 minutes' <= now() then
    update public.parent_access_rate_limits
      set window_started_at = now(), request_count = 0, last_failed_at = null
      where id = limit_row.id;
    select * into limit_row from public.parent_access_rate_limits where id = limit_row.id;
  end if;
  if limit_row.request_count >= request_limit then
    perform internal.record_parent_security_event(
      'PARENT_LOGIN_RATE_LIMITED', null, null, null, client_hash,
      jsonb_build_object('window_seconds', 900, 'request_limit', request_limit)
    );
    return query select false, null::text,
      greatest(1, ceil(extract(epoch from (limit_row.window_started_at + interval '15 minutes' - now())))::integer);
    return;
  end if;
  update public.parent_access_rate_limits set request_count = request_count + 1,
    updated_at = now() where id = limit_row.id;

  select * into credential from public.student_access_credentials access_credential
    where access_credential.access_code_lookup_hash = normalized_hash for update;
  if not found then
    perform extensions.crypt(pin_text, extensions.gen_salt('bf', 12));
    perform internal.record_parent_security_event(
      'PARENT_LOGIN_FAILED_UNKNOWN_CODE', null, null, null, client_hash, '{}'
    );
    update public.parent_access_rate_limits set last_failed_at = now(), updated_at = now()
      where id = limit_row.id;
    return query select false, null::text, 0;
    return;
  end if;

  if credential.is_active and (credential.expires_at is null or credential.expires_at > now())
    and (credential.locked_until is null or credential.locked_until <= now()) then
    pin_ok := extensions.crypt(pin_text, credential.pin_hash) = credential.pin_hash;
  else
    perform extensions.crypt(pin_text, extensions.gen_salt('bf', 12));
  end if;

  if not pin_ok then
    if credential.is_active and (credential.locked_until is null or credential.locked_until <= now()) then
      update public.student_access_credentials
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
          updated_at = now()
      where id = credential.id;
      select * into credential from public.student_access_credentials where id = credential.id;
    end if;
    perform internal.record_parent_security_event(
      'PARENT_LOGIN_FAILED', credential.id, credential.student_id, null,
      client_hash, '{}'
    );
    update public.parent_access_rate_limits set last_failed_at = now(), updated_at = now()
      where id = limit_row.id;
    return query select false, null::text, 0;
    return;
  end if;

  -- Stage 7 guardian mutations lock relationship rows. Take the same rows
  -- before the final eligibility decision so removal-first and login-first
  -- outcomes are deterministic under READ COMMITTED.
  perform 1
  from public.student_guardians link
  where link.student_id = credential.student_id
  for update;
  if not internal.parent_has_report_eligibility(credential.student_id) then
    perform internal.record_parent_security_event(
      'PARENT_LOGIN_FAILED', credential.id, credential.student_id, null,
      client_hash, jsonb_build_object('reason', 'eligibility_required')
    );
    update public.parent_access_rate_limits set last_failed_at = now(), updated_at = now()
      where id = limit_row.id;
    return query select false, null::text, 0;
    return;
  end if;

  generated_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.parent_access_sessions(
    student_access_credential_id, session_token_hash, expires_at, last_seen_at
  ) values (
    credential.id, internal.parent_session_token_hash(generated_token),
    now() + interval '2 hours', now()
  );
  update public.student_access_credentials set failed_attempts = 0,
    locked_until = null, last_used_at = now(), updated_at = now()
    where id = credential.id;
  perform internal.record_parent_security_event(
    'PARENT_LOGIN_SUCCEEDED', credential.id, credential.student_id, null,
    client_hash, '{}'
  );
  return query select true, generated_token, 0;
end;
$$;

create or replace function public.get_parent_report_detail(
  session_token_hash text,
  target_report_id uuid
)
returns table(report_id uuid, status public.report_status, report_version integer,
  published_at timestamptz, is_current boolean, parent_data jsonb)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  session_row record;
  report public.reports%rowtype;
  snapshot jsonb;
  safe_data jsonb;
begin
  select * into session_row from internal.parent_validate_session(session_token_hash);
  if not found then return; end if;
  select reports.* into report from public.reports reports
  join public.enrollments enrollment on enrollment.id = reports.enrollment_id
  where reports.id = target_report_id and enrollment.student_id = session_row.student_id
    and (reports.status = 'PUBLISHED' or (reports.status = 'SUPERSEDED' and reports.published_at is not null))
    and reports.pdf_storage_path is not null and reports.file_checksum is not null;
  if not found then return; end if;
  select report_snapshot.snapshot_data into snapshot
  from public.report_snapshots report_snapshot
  where report_snapshot.report_id = report.id
  order by report_snapshot.snapshot_version desc limit 1;
  safe_data := jsonb_build_object(
    'school', jsonb_build_object(
      'name', snapshot #> '{school,name}',
      'school_code', snapshot #> '{school,school_code}',
      'timezone', snapshot #> '{school,timezone}',
      'motto', snapshot #> '{school,motto}'
    ),
    'student', jsonb_build_object(
      'admission_number', snapshot #> '{student,admission_number}',
      'display_name', snapshot #> '{student,display_name}'
    ),
    'academic_period', jsonb_build_object(
      'academic_year_name', snapshot #> '{academic_period,academic_year_name}',
      'term_name', snapshot #> '{academic_period,term_name}',
      'term_number', snapshot #> '{academic_period,term_number}'
    ),
    'placement', jsonb_build_object(
      'enrollment_status', snapshot #> '{placement,enrollment_status}',
      'class_name', snapshot #> '{placement,class_name}',
      'class_code', snapshot #> '{placement,class_code}',
      'grade_code', snapshot #> '{placement,grade_code}',
      'grade_name', snapshot #> '{placement,grade_name}'
    ),
    'academic_summary', snapshot->'academic_summary',
    'attendance', snapshot->'attendance',
    'comments', snapshot->'comments',
    'signatories', snapshot->'signatories',
    'next_term', case when snapshot->'next_term' is null then null else jsonb_build_object(
      'term_name', snapshot #> '{next_term,term_name}',
      'term_number', snapshot #> '{next_term,term_number}',
      'starts_on', snapshot #> '{next_term,starts_on}'
    ) end,
    'subjects', coalesce((select jsonb_agg(jsonb_build_object(
      'subject_name', result.subject_name, 'subject_code', result.subject_code,
      'subject_score', result.subject_score, 'grade', result.grade,
      'aggregate_points', result.aggregate_points, 'subject_position', result.subject_position,
      'teacher_comment', result.teacher_comment
    ) order by result.sort_order, result.subject_code)
    from public.report_subject_results result
    where result.report_id = report.id), '[]'::jsonb)
  );
  perform internal.record_parent_security_event('PARENT_REPORT_VIEWED', null, session_row.student_id, session_row.session_id, null,
    jsonb_build_object('report_id', report.id));
  insert into public.audit_logs(school_id, entity_type, entity_id, action, new_values)
    values(session_row.school_id, 'report', report.id, 'PARENT_REPORT_VIEWED',
      jsonb_build_object('student_id', session_row.student_id, 'parent_session_id', session_row.session_id));
  return query select report.id, report.status, report.version, report.published_at,
    report.status = 'PUBLISHED', safe_data;
end;
$$;

comment on function public.verify_parent_access(text,text,text) is
  'Service-role-only parent credential verification with generic outcomes, transactional throttling, and login-time guardian eligibility.';
comment on function public.get_parent_report_detail(text,uuid) is
  'Service-role-only parent report detail using frozen report_subject_results identity, never live subjects identity.';
