-- Stage 15: student-scoped parent report access.
-- Parent access is custom credential/session authorization, not Supabase Auth.

create table public.parent_access_rate_limits (
  id uuid primary key default gen_random_uuid(),
  client_key_hash text not null unique
    check (length(btrim(client_key_hash)) between 64 and 128),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  last_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.parent_security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(btrim(event_type)) between 1 and 100),
  credential_id uuid references public.student_access_credentials(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  session_id uuid references public.parent_access_sessions(id) on delete set null,
  client_key_hash text check (
    client_key_hash is null or length(btrim(client_key_hash)) between 64 and 128
  ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index parent_access_rate_limits_updated_idx
  on public.parent_access_rate_limits (updated_at);
create index parent_security_events_created_idx
  on public.parent_security_events (created_at desc);
create index parent_security_events_credential_idx
  on public.parent_security_events (credential_id, created_at desc)
  where credential_id is not null;

alter table public.parent_access_rate_limits enable row level security;
alter table public.parent_access_rate_limits force row level security;
alter table public.parent_security_events enable row level security;
alter table public.parent_security_events force row level security;
revoke all privileges on table public.parent_access_rate_limits from public, anon, authenticated;
revoke all privileges on table public.parent_security_events from public, anon, authenticated;

create trigger parent_access_rate_limits_set_updated_at
before update on public.parent_access_rate_limits
for each row execute function internal.set_updated_at();

create trigger parent_security_events_prevent_mutation
before update or delete on public.parent_security_events
for each row execute function internal.prevent_mutation();

create or replace function internal.parent_normalize_access_code(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select upper(regexp_replace(btrim(value), '[-[:space:]]', '', 'g'));
$$;

create or replace function internal.parent_access_lookup_hash(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $$
  select encode(extensions.digest(internal.parent_normalize_access_code(value), 'sha256'), 'hex');
$$;

create or replace function internal.parent_session_token_hash(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $$
  select encode(extensions.digest(value, 'sha256'), 'hex');
$$;

create or replace function internal.parent_generate_access_code()
returns text
language plpgsql
volatile
set search_path = pg_catalog, extensions
as $$
declare raw_code text;
begin
  raw_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  return substr(raw_code, 1, 8) || '-' || substr(raw_code, 9, 8) || '-' ||
    substr(raw_code, 17, 8) || '-' || substr(raw_code, 25, 8);
end;
$$;

create or replace function internal.parent_generate_pin()
returns text
language plpgsql
volatile
set search_path = pg_catalog, extensions
as $$
declare
  bytes bytea := extensions.gen_random_bytes(4);
  value numeric;
begin
  value := mod(
    get_byte(bytes, 0)::numeric * 16777216 +
    get_byte(bytes, 1)::numeric * 65536 +
    get_byte(bytes, 2)::numeric * 256 +
    get_byte(bytes, 3)::numeric,
    100000000
  );
  return lpad(value::bigint::text, 8, '0');
end;
$$;

create or replace function internal.parent_has_report_eligibility(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select exists (
    select 1
    from public.student_guardians link
    join public.guardians guardian on guardian.id = link.guardian_id
    where link.student_id = target_student_id
      and link.can_access_reports
      and guardian.is_active
  );
$$;

create or replace function internal.record_parent_security_event(
  event_name text,
  target_credential_id uuid default null,
  target_student_id uuid default null,
  target_session_id uuid default null,
  target_client_key_hash text default null,
  event_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
  insert into public.parent_security_events(
    event_type, credential_id, student_id, session_id, client_key_hash, metadata
  ) values (
    event_name, target_credential_id, target_student_id, target_session_id,
    target_client_key_hash, coalesce(event_metadata, '{}'::jsonb)
  );
$$;

create or replace function internal.parent_current_student_manager(target_student_id uuid)
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select actor.profile_id, actor.membership_id, actor.school_id
  from internal.current_student_manager() actor
  join public.students student on student.id = target_student_id
  where actor.school_id = student.school_id;
$$;

create or replace function public.get_student_parent_access_status(target_student_id uuid)
returns table(
  student_id uuid,
  school_id uuid,
  guardian_access_eligible boolean,
  credential_id uuid,
  credential_active boolean,
  credential_created_at timestamptz,
  last_used_at timestamptz,
  locked_until timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
declare student public.students%rowtype;
declare credential public.student_access_credentials%rowtype;
begin
  select * into actor from internal.parent_current_student_manager(target_student_id);
  if not found or actor.membership_id is null then
    raise exception 'STUDENT_PARENT_ACCESS_FORBIDDEN' using errcode = '42501';
  end if;
  select * into student from public.students where id = target_student_id;
  select * into credential from public.student_access_credentials access_credential
    where access_credential.student_id = target_student_id and access_credential.is_active
    order by access_credential.created_at desc limit 1;
  return query select student.id, student.school_id,
    internal.parent_has_report_eligibility(student.id), credential.id,
    credential.is_active, credential.created_at, credential.last_used_at,
    credential.locked_until, credential.expires_at;
end;
$$;

create or replace function public.issue_student_parent_access_credential(
  target_student_id uuid,
  credential_expires_at timestamptz default null
)
returns table(
  credential_id uuid,
  student_id uuid,
  access_code text,
  pin text,
  operation text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal, extensions
as $$
declare actor record;
declare student public.students%rowtype;
declare old_credential public.student_access_credentials%rowtype;
declare new_credential public.student_access_credentials%rowtype;
declare generated_code text;
declare generated_pin text;
declare operation_name text := 'ISSUED';
begin
  select * into actor from internal.parent_current_student_manager(target_student_id);
  if not found then
    raise exception 'STUDENT_PARENT_ACCESS_FORBIDDEN' using errcode = '42501';
  end if;
  select * into student from public.students where id = target_student_id for update;
  if not found or student.id is null or not internal.parent_has_report_eligibility(target_student_id) then
    raise exception 'PARENT_GUARDIAN_ACCESS_NOT_ELIGIBLE' using errcode = '23514';
  end if;

  select * into old_credential from public.student_access_credentials credential
    where credential.student_id = target_student_id and credential.is_active for update;
  if found then
    operation_name := 'ROTATED';
    update public.student_access_credentials
      set is_active = false, updated_at = now()
      where id = old_credential.id;
    update public.parent_access_sessions
      set revoked_at = coalesce(revoked_at, now())
      where student_access_credential_id = old_credential.id
        and revoked_at is null;
  end if;

  generated_code := internal.parent_generate_access_code();
  generated_pin := internal.parent_generate_pin();
  insert into public.student_access_credentials(
    student_id, access_code_lookup_hash, pin_hash, is_active,
    expires_at, created_by
  ) values (
    target_student_id,
    internal.parent_access_lookup_hash(generated_code),
    extensions.crypt(generated_pin, extensions.gen_salt('bf', 12)),
    true,
    credential_expires_at,
    actor.membership_id
  ) returning * into new_credential;

  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    case when operation_name = 'ROTATED'
      then 'PARENT_ACCESS_CREDENTIAL_ROTATED'
      else 'PARENT_ACCESS_CREDENTIAL_ISSUED' end,
    'student_access_credential', new_credential.id, null,
    jsonb_build_object('student_id', target_student_id, 'credential_id', new_credential.id),
    null
  );
  return query select new_credential.id, target_student_id, generated_code,
    generated_pin, operation_name, new_credential.expires_at;
end;
$$;

create or replace function public.revoke_student_parent_access_credential(
  target_student_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
declare credential public.student_access_credentials%rowtype;
begin
  select * into actor from internal.parent_current_student_manager(target_student_id);
  if not found then
    raise exception 'STUDENT_PARENT_ACCESS_FORBIDDEN' using errcode = '42501';
  end if;
  select * into credential from public.student_access_credentials
    where student_id = target_student_id and is_active for update;
  if not found then return false; end if;
  update public.student_access_credentials set is_active = false, updated_at = now()
    where id = credential.id;
  update public.parent_access_sessions set revoked_at = coalesce(revoked_at, now())
    where student_access_credential_id = credential.id and revoked_at is null;
  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'PARENT_ACCESS_CREDENTIAL_REVOKED', 'student_access_credential', credential.id,
    jsonb_build_object('student_id', target_student_id, 'credential_id', credential.id),
    null
  );
  return true;
end;
$$;

create or replace function internal.parent_validate_session(session_hash text)
returns table(session_id uuid, credential_id uuid, student_id uuid, school_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare session_row public.parent_access_sessions%rowtype;
declare credential_row public.student_access_credentials%rowtype;
declare student_school_id uuid;
begin
  if session_hash is null or length(btrim(session_hash)) <> 64 then return; end if;
  select session.* into session_row
  from public.parent_access_sessions session
  where session.session_token_hash = session_hash
  for update;
  if not found then return; end if;
  select credential.* into credential_row
  from public.student_access_credentials credential
  where credential.id = session_row.student_access_credential_id;
  select student.school_id into student_school_id
  from public.students student where student.id = credential_row.student_id;
  if not found or session_row.revoked_at is not null
    or session_row.expires_at <= now()
    or now() >= coalesce(session_row.last_seen_at, session_row.created_at) + interval '30 minutes'
    or not credential_row.is_active
    or (credential_row.expires_at is not null and credential_row.expires_at <= now())
    or not internal.parent_has_report_eligibility(credential_row.student_id) then
    return;
  end if;
  update public.parent_access_sessions set last_seen_at = now() where id = session_row.id;
  return query select session_row.id, credential_row.id, credential_row.student_id,
    student_school_id;
end;
$$;

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
declare limit_row public.parent_access_rate_limits%rowtype;
declare credential public.student_access_credentials%rowtype;
declare generated_token text;
declare normalized_hash text := lower(btrim(access_code_lookup_hash));
declare client_hash text := lower(btrim(client_key_hash));
declare pin_ok boolean := false;
declare request_limit integer := 60;
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

create or replace function public.validate_parent_access_session(session_token_hash text)
returns table(session_id uuid, credential_id uuid, student_id uuid, school_id uuid)
language sql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
  select * from internal.parent_validate_session(session_token_hash);
$$;

create or replace function public.revoke_parent_access_session(session_token_hash text)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare changed_id uuid;
begin
  update public.parent_access_sessions set revoked_at = coalesce(revoked_at, now())
  where parent_access_sessions.session_token_hash = lower(btrim($1))
    and parent_access_sessions.revoked_at is null
  returning id into changed_id;
  if changed_id is null then return false; end if;
  perform internal.record_parent_security_event('PARENT_LOGOUT', null, null, changed_id, null, '{}');
  return true;
end;
$$;

create or replace function public.get_parent_published_reports(session_token_hash text)
returns table(
  report_id uuid,
  report_version integer,
  student_name text,
  admission_number text,
  academic_year_label text,
  term_label text,
  grade_label text,
  class_label text,
  published_at timestamptz,
  is_current boolean,
  status public.report_status
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare session_row record;
begin
  select * into session_row from internal.parent_validate_session(session_token_hash);
  if not found then return; end if;
  return query
  select report.id, report.version,
    snapshot.snapshot_data #>> '{student,display_name}',
    snapshot.snapshot_data #>> '{student,admission_number}',
    snapshot.snapshot_data #>> '{academic_period,academic_year_name}',
    snapshot.snapshot_data #>> '{academic_period,term_name}',
    snapshot.snapshot_data #>> '{placement,grade_name}',
    snapshot.snapshot_data #>> '{placement,class_name}', report.published_at,
    report.status = 'PUBLISHED', report.status
  from public.reports report
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.enrollment_id in (
      select enrollment.id from public.enrollments enrollment
      where enrollment.student_id = session_row.student_id
    )
    and (report.status = 'PUBLISHED' or (report.status = 'SUPERSEDED' and report.published_at is not null))
    and report.pdf_storage_path is not null
    and report.file_checksum is not null
  order by report.published_at desc nulls last, report.version desc;
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
      'subject_name', subject.name, 'subject_code', subject.code,
      'subject_score', result.subject_score, 'grade', result.grade,
      'aggregate_points', result.aggregate_points, 'subject_position', result.subject_position,
      'teacher_comment', result.teacher_comment
    ) order by result.sort_order, subject.id)
    from public.report_subject_results result
    join public.subjects subject on subject.id = result.subject_id
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

create or replace function public.get_parent_report_artifact_descriptor(
  session_token_hash text,
  target_report_id uuid
)
returns table(
  report_id uuid,
  student_id uuid,
  session_id uuid,
  credential_id uuid,
  school_id uuid,
  report_version integer,
  status public.report_status,
  published_at timestamptz,
  storage_path text,
  file_checksum text,
  file_size bigint,
  student_name text,
  academic_year_label text,
  term_label text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare session_row record;
begin
  select * into session_row from internal.parent_validate_session(session_token_hash);
  if not found then return; end if;
  return query
  select report.id, session_row.student_id, session_row.session_id, session_row.credential_id,
    session_row.school_id, report.version, report.status, report.published_at,
    report.pdf_storage_path, report.file_checksum, report.pdf_size_bytes,
    snapshot.snapshot_data #>> '{student,display_name}',
    snapshot.snapshot_data #>> '{academic_period,academic_year_name}',
    snapshot.snapshot_data #>> '{academic_period,term_name}'
  from public.reports report
  join public.enrollments enrollment on enrollment.id = report.enrollment_id
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.id = target_report_id and enrollment.student_id = session_row.student_id
    and (report.status = 'PUBLISHED' or (report.status = 'SUPERSEDED' and report.published_at is not null))
    and report.pdf_storage_path is not null and report.file_checksum is not null
    and report.pdf_size_bytes is not null;
end;
$$;

create or replace function public.record_parent_report_artifact_access(
  session_token_hash text,
  target_report_id uuid,
  verified_checksum text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  session_row record;
  report public.reports%rowtype;
begin
  select * into session_row from internal.parent_validate_session(session_token_hash);
  if not found then return false; end if;
  select reports.* into report from public.reports reports
  join public.enrollments enrollment on enrollment.id = reports.enrollment_id
  where reports.id = target_report_id and enrollment.student_id = session_row.student_id
    and (reports.status = 'PUBLISHED' or (reports.status = 'SUPERSEDED' and reports.published_at is not null))
    and reports.file_checksum = verified_checksum and reports.pdf_storage_path is not null
  for update;
  if not found then return false; end if;
  insert into public.audit_logs(school_id, entity_type, entity_id, action, new_values)
    values(session_row.school_id, 'report', report.id, 'PARENT_REPORT_ARTIFACT_ACCESSED',
      jsonb_build_object('student_id', session_row.student_id,
        'credential_id', session_row.credential_id,
        'parent_session_id', session_row.session_id,
        'artifact_checksum', report.file_checksum));
  return true;
end;
$$;

create or replace function public.record_parent_report_access(
  session_token_hash text,
  target_report_id uuid,
  verified_checksum text
)
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
  select public.record_parent_report_artifact_access(session_token_hash, target_report_id, verified_checksum);
$$;

revoke all on function internal.parent_normalize_access_code(text),
  internal.parent_access_lookup_hash(text), internal.parent_session_token_hash(text),
  internal.parent_generate_access_code(), internal.parent_generate_pin(),
  internal.parent_has_report_eligibility(uuid), internal.record_parent_security_event(text,uuid,uuid,uuid,text,jsonb),
  internal.parent_current_student_manager(uuid), internal.parent_validate_session(text)
from public, anon, authenticated;

revoke all on function public.get_student_parent_access_status(uuid),
  public.issue_student_parent_access_credential(uuid,timestamptz),
  public.revoke_student_parent_access_credential(uuid),
  public.verify_parent_access(text,text,text),
  public.validate_parent_access_session(text), public.revoke_parent_access_session(text),
  public.get_parent_published_reports(text), public.get_parent_report_detail(text,uuid),
  public.get_parent_report_artifact_descriptor(text,uuid),
  public.record_parent_report_artifact_access(text,uuid,text),
  public.record_parent_report_access(text,uuid,text)
from public, anon, authenticated;

grant execute on function public.get_student_parent_access_status(uuid),
  public.issue_student_parent_access_credential(uuid,timestamptz),
  public.revoke_student_parent_access_credential(uuid)
to authenticated;

grant execute on function public.verify_parent_access(text,text,text),
  public.validate_parent_access_session(text), public.revoke_parent_access_session(text),
  public.get_parent_published_reports(text), public.get_parent_report_detail(text,uuid),
  public.get_parent_report_artifact_descriptor(text,uuid),
  public.record_parent_report_artifact_access(text,uuid,text),
  public.record_parent_report_access(text,uuid,text)
to service_role;

comment on table public.parent_access_rate_limits is
  'Keyed persistent parent-login throttles. Raw IP addresses and credentials are never stored.';
comment on table public.parent_security_events is
  'Protected parent security events containing no plaintext credential or session secrets.';
comment on function public.verify_parent_access(text,text,text) is
  'Service-role-only parent credential verification with generic outcomes and transactional throttling.';
comment on function public.get_parent_published_reports(text) is
  'Service-role-only student-scoped report listing for a validated custom parent session.';
