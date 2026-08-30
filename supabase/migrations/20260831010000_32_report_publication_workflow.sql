-- Stage 14: private report artifacts and staff publication workflow.
-- This migration is deliberately additive. Stage 12 snapshot rows and the
-- Stage 13 renderer remain the academic and rendering sources of truth.

alter table public.reports
  add column pdf_size_bytes bigint,
  add column pdf_stored_at timestamptz,
  add column pdf_renderer_version text,
  add column workflow_version bigint not null default 0,
  add column withdrawal_reason text;

alter table public.reports
  add constraint reports_workflow_version_valid
    check (workflow_version >= 0),
  add constraint reports_withdrawal_reason_valid
    check (withdrawal_reason is null or length(btrim(withdrawal_reason)) between 1 and 1000),
  add constraint reports_artifact_metadata_complete
    check (
      calculation_run_id is null
      or (
        (
          pdf_storage_path is null
          and file_checksum is null
          and pdf_size_bytes is null
          and pdf_stored_at is null
          and pdf_renderer_version is null
        )
        or (
          pdf_storage_path is not null
          and file_checksum ~ '^[0-9a-f]{64}$'
          and pdf_size_bytes is not null
          and pdf_size_bytes > 0
          and pdf_stored_at is not null
          and pdf_renderer_version is not null
          and pdf_storage_path = id::text || '/' || file_checksum || '.pdf'
        )
      )
    );

create unique index reports_current_published_unique
  on public.reports (term_id, enrollment_id)
  where status = 'PUBLISHED';

create index reports_workflow_status_idx
  on public.reports (term_id, enrollment_id, status, workflow_version);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-artifacts',
  'report-artifacts',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function internal.lock_and_require_report_authority(
  target_school_id uuid,
  requested_permissions public.app_permission[]
)
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  selected internal.staff_session_active_memberships%rowtype;
  membership public.school_staff_memberships%rowtype;
  school public.schools%rowtype;
  session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'REPORT_AUTH_REQUIRED' using errcode = '28000';
  end if;

  session_id := internal.current_auth_session_id();
  if session_id is null then
    raise exception 'REPORT_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select selection.* into selected
  from internal.staff_session_active_memberships selection
  where selection.session_id = session_id
    and selection.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'REPORT_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select staff_membership.* into membership
  from public.school_staff_memberships staff_membership
  where staff_membership.id = selected.membership_id
    and staff_membership.profile_id = selected.profile_id
    and staff_membership.school_id = target_school_id
  for update;
  if not found or membership.status <> 'ACTIVE' then
    raise exception 'REPORT_FORBIDDEN' using errcode = '42501';
  end if;

  select selected_school.* into school
  from public.schools selected_school
  where selected_school.id = membership.school_id
  for update;
  if not found or not school.is_active then
    raise exception 'REPORT_FORBIDDEN' using errcode = '42501';
  end if;

  -- Lock live assignments and mappings in stable primary-key order. A
  -- concurrent revocation or role-mapping change therefore wins or waits and
  -- is re-evaluated below instead of being hidden by a stale page decision.
  perform 1
  from public.staff_role_assignments assignment
  where assignment.membership_id = membership.id
  order by assignment.id
  for update;

  perform 1
  from public.role_permissions mapping
  where mapping.role in (
    select assignment.role
    from public.staff_role_assignments assignment
    where assignment.membership_id = membership.id
  )
  order by mapping.id
  for update;

  if not exists (
    select 1
    from public.staff_role_assignments assignment
    join public.role_permissions mapping on mapping.role = assignment.role
    where assignment.membership_id = membership.id
      and assignment.revoked_at is null
      and mapping.permission = any(requested_permissions)
  ) then
    raise exception 'REPORT_FORBIDDEN' using errcode = '42501';
  end if;

  return query select membership.profile_id, membership.id, membership.school_id;
end;
$$;

create or replace function internal.current_user_can_read_report(
  target_report_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select exists (
    select 1
    from public.reports report
    join public.terms term on term.id = report.term_id
    join public.academic_years year on year.id = term.academic_year_id
    join public.enrollments enrollment on enrollment.id = report.enrollment_id
    where report.id = target_report_id
      and (
        internal.current_user_has_permission(year.school_id, 'REPORTS_VIEW_ALL')
        or internal.current_user_has_permission(year.school_id, 'REPORTS_GENERATE')
        or (
          internal.current_user_has_permission(year.school_id, 'REPORTS_VIEW_ASSIGNED')
          and internal.current_user_is_class_teacher_assigned(
            report.term_id, enrollment.class_section_id
          )
        )
      )
  );
$$;

create or replace function internal.report_artifact_access(
  object_name text,
  require_manage boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  report_id uuid;
begin
  if object_name is null
     or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.pdf$' then
    return false;
  end if;

  begin
    report_id := split_part(object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if require_manage then
    return exists (
      select 1
      from public.reports report
      join public.terms term on term.id = report.term_id
      join public.academic_years year on year.id = term.academic_year_id
      where report.id = report_id
        and report.calculation_run_id is not null
        and report.status = 'GENERATED'
        and report.superseded_by is null
        and report.pdf_storage_path is null
        and internal.current_user_has_permission(year.school_id, 'REPORTS_GENERATE')
        and split_part(object_name, '/', 1) = report.id::text
    );
  end if;

  return exists (
    select 1
    from public.reports report
    where report.id = report_id
      and report.pdf_storage_path = object_name
      and report.file_checksum = split_part(split_part(object_name, '/', 2), '.', 1)
      and internal.current_user_can_read_report(report.id)
  );
end;
$$;

create or replace function internal.report_artifact_upload_access(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return internal.report_artifact_access(object_name, true);
end;
$$;

create or replace function internal.report_artifact_cleanup_access(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  report_id uuid;
begin
  if object_name is null
     or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.pdf$' then
    return false;
  end if;
  begin
    report_id := split_part(object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return exists (
    select 1
    from public.reports report
    join public.terms term on term.id = report.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where report.id = report_id
      and report.calculation_run_id is not null
      and report.status = 'GENERATED'
      and report.superseded_by is null
      and report.pdf_storage_path is null
      and internal.current_user_has_permission(year.school_id, 'REPORTS_GENERATE')
  );
end;
$$;

-- Storage policies are intentionally limited to authenticated selected staff.
-- There is no anon policy, no update policy, and registered objects cannot be
-- deleted. INSERT accepts only a canonical, unregistered report path; the
-- checksum is verified again by the registration RPC against the bytes.
create policy report_artifacts_select_authorized on storage.objects
for select to authenticated using (
  bucket_id = 'report-artifacts'
  and internal.report_artifact_access(name, false)
);

create policy report_artifacts_insert_managed on storage.objects
for insert to authenticated with check (
  bucket_id = 'report-artifacts'
  and metadata->>'mimetype' = 'application/pdf'
  and internal.report_artifact_upload_access(name)
);

create policy report_artifacts_delete_orphan on storage.objects
for delete to authenticated using (
  bucket_id = 'report-artifacts'
  and internal.report_artifact_cleanup_access(name)
);

-- Replace the broad Stage 12 generated-row guard with a context-aware guard.
-- Direct table UPDATE/DELETE remains unavailable to authenticated users; only
-- the RPCs below can enter the publication workflow context.
create or replace function internal.prevent_generated_report_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and old.calculation_run_id is not null
     and current_setting('app.report_snapshot_generation', true) = 'on'
     and old.superseded_by is null
     and new.superseded_by is not null
     and (
       new.status = old.status
       or (old.status in ('GENERATED', 'REVIEWED') and new.status = 'SUPERSEDED')
     )
     and (to_jsonb(new) - array['superseded_by', 'status', 'updated_at']::text[])
         = (to_jsonb(old) - array['superseded_by', 'status', 'updated_at']::text[]) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.calculation_run_id is not null
     and current_setting('app.report_publication_workflow', true) = 'on'
     and (to_jsonb(new) - array[
       'status', 'pdf_storage_path', 'file_checksum', 'pdf_size_bytes',
       'pdf_stored_at', 'pdf_renderer_version', 'workflow_version',
       'reviewed_at', 'reviewed_by', 'published_at', 'published_by',
       'withdrawn_at', 'withdrawn_by', 'withdrawal_reason', 'superseded_by',
       'updated_at'
     ]::text[])
       = (to_jsonb(old) - array[
       'status', 'pdf_storage_path', 'file_checksum', 'pdf_size_bytes',
       'pdf_stored_at', 'pdf_renderer_version', 'workflow_version',
       'reviewed_at', 'reviewed_by', 'published_at', 'published_by',
       'withdrawn_at', 'withdrawn_by', 'withdrawal_reason', 'superseded_by',
       'updated_at'
     ]::text[]) then
    return new;
  end if;

  if old.calculation_run_id is not null then
    raise exception 'Generated reports are immutable and cannot be %.'
      , lower(tg_op) using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function internal.record_report_auto_supersession_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
begin
  if current_setting('app.report_snapshot_generation', true) = 'on'
     and old.superseded_by is null
     and new.status = 'SUPERSEDED' then
    select membership.profile_id, membership.id, membership.school_id
      into actor
    from internal.staff_session_active_memberships selection
    join public.school_staff_memberships membership
      on membership.id = selection.membership_id
     and membership.profile_id = selection.profile_id
    where selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid();
    if actor.id is not null then
      perform internal.record_configuration_audit(
        actor.profile_id, actor.id, actor.school_id,
        'REPORT_SUPERSEDED', 'report', new.id,
        jsonb_build_object('status', old.status, 'workflow_version', old.workflow_version),
        jsonb_build_object('status', new.status, 'successor_report_id', new.superseded_by,
          'workflow_version', new.workflow_version)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reports_record_auto_supersession_audit on public.reports;
create trigger reports_record_auto_supersession_audit
after update on public.reports
for each row execute function internal.record_report_auto_supersession_audit();

create or replace function internal.validate_report_publication_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.calculation_run_id is null then
    return new;
  end if;

  if new.status = 'GENERATED' then
    if new.reviewed_at is not null or new.reviewed_by is not null
       or new.published_at is not null or new.published_by is not null
       or new.withdrawn_at is not null or new.withdrawn_by is not null
       or new.withdrawal_reason is not null then
      raise exception 'Generated report has workflow actor or timestamp fields.' using errcode = '23514';
    end if;
  elsif new.status = 'REVIEWED' then
    if new.pdf_storage_path is null or new.file_checksum is null
       or new.pdf_size_bytes is null or new.pdf_stored_at is null
       or new.pdf_renderer_version is null
       or new.reviewed_at is null or new.reviewed_by is null
       or new.published_at is not null or new.published_by is not null
       or new.withdrawn_at is not null or new.withdrawn_by is not null
       or new.withdrawal_reason is not null then
      raise exception 'Reviewed report requires a stored artifact and reviewer.' using errcode = '23514';
    end if;
  elsif new.status = 'PUBLISHED' then
    if new.pdf_storage_path is null or new.file_checksum is null
       or new.pdf_size_bytes is null or new.pdf_stored_at is null
       or new.pdf_renderer_version is null
       or new.reviewed_at is null or new.reviewed_by is null
       or new.published_at is null or new.published_by is null
       or new.withdrawn_at is not null or new.withdrawn_by is not null
       or new.withdrawal_reason is not null then
      raise exception 'Published report requires reviewed publication metadata.' using errcode = '23514';
    end if;
  elsif new.status = 'WITHDRAWN' then
    if new.pdf_storage_path is null or new.file_checksum is null
       or new.pdf_size_bytes is null or new.pdf_stored_at is null
       or new.pdf_renderer_version is null
       or new.reviewed_at is null or new.reviewed_by is null
       or new.published_at is null or new.published_by is null
       or new.withdrawn_at is null or new.withdrawn_by is null
       or length(btrim(coalesce(new.withdrawal_reason, ''))) = 0 then
      raise exception 'Withdrawn report requires complete publication history and a reason.' using errcode = '23514';
    end if;
  elsif new.status = 'SUPERSEDED' then
    if new.superseded_by is null then
      raise exception 'Superseded report requires a successor.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reports_validate_publication_state on public.reports;
create trigger reports_validate_publication_state
before insert or update on public.reports
for each row execute function internal.validate_report_publication_state();

create or replace function public.register_report_pdf_artifact(
  target_report_id uuid,
  expected_workflow_version bigint,
  artifact_storage_path text,
  artifact_checksum text,
  artifact_size_bytes bigint,
  renderer_version text
)
returns table (
  report_id uuid,
  status public.report_status,
  workflow_version bigint,
  file_checksum text,
  file_size_bytes bigint,
  pdf_storage_path text,
  reused boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  report public.reports%rowtype;
  report_school_id uuid;
  source_run public.result_calculation_runs%rowtype;
  object_exists boolean;
  changed public.reports%rowtype;
begin
  select year.school_id into report_school_id
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where report.id = target_report_id;
  if not found then raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into actor from internal.lock_and_require_report_authority(
    report_school_id, array['REPORTS_GENERATE']::public.app_permission[]
  );
  select * into source_run
  from internal.lock_and_require_current_report_calculation_source(
    (select calculation_run_id from public.reports where id = target_report_id),
    report_school_id
  );

  select report.* into report
  from public.reports report
  where report.id = target_report_id
  for update;
  if not found or report.calculation_run_id is null
     or report.status <> 'GENERATED' or report.superseded_by is not null then
    raise exception 'REPORT_NOT_CURRENT' using errcode = '55000';
  end if;
  if report.workflow_version <> expected_workflow_version then
    raise exception 'REPORT_WORKFLOW_CONFLICT' using errcode = '40001';
  end if;

  if artifact_checksum !~ '^[0-9a-f]{64}$'
     or artifact_size_bytes is null or artifact_size_bytes <= 0
     or artifact_size_bytes > 10485760
     or renderer_version is null or length(btrim(renderer_version)) not between 1 and 100
     or artifact_storage_path is distinct from target_report_id::text || '/' || artifact_checksum || '.pdf' then
    raise exception 'REPORT_ARTIFACT_INVALID' using errcode = '22023';
  end if;

  if report.pdf_storage_path is not null then
    if report.pdf_storage_path = artifact_storage_path
       and report.file_checksum = artifact_checksum
       and report.pdf_size_bytes = artifact_size_bytes
       and report.pdf_renderer_version = renderer_version then
      return query select report.id, report.status, report.workflow_version,
        report.file_checksum, report.pdf_size_bytes, report.pdf_storage_path, true;
      return;
    end if;
    raise exception 'REPORT_ARTIFACT_ALREADY_REGISTERED' using errcode = '55000';
  end if;

  select exists (
    select 1 from storage.objects object
    where object.bucket_id = 'report-artifacts'
      and object.name = artifact_storage_path
      and object.metadata->>'mimetype' = 'application/pdf'
  ) into object_exists;
  if not object_exists then
    raise exception 'REPORT_ARTIFACT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform set_config('app.report_publication_workflow', 'on', true);
  update public.reports
  set pdf_storage_path = artifact_storage_path,
      file_checksum = artifact_checksum,
      pdf_size_bytes = artifact_size_bytes,
      pdf_stored_at = now(),
      pdf_renderer_version = btrim(renderer_version),
      workflow_version = workflow_version + 1
  where id = report.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'REPORT_ARTIFACT_STORED', 'report', changed.id,
    null,
    jsonb_build_object('file_checksum', changed.file_checksum, 'file_size_bytes', changed.pdf_size_bytes,
      'renderer_version', changed.pdf_renderer_version, 'workflow_version', changed.workflow_version)
  );
  return query select changed.id, changed.status, changed.workflow_version,
    changed.file_checksum, changed.pdf_size_bytes, changed.pdf_storage_path, false;
end;
$$;

create or replace function public.review_generated_report(
  target_report_id uuid,
  expected_workflow_version bigint
)
returns table (report_id uuid, status public.report_status, workflow_version bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  report public.reports%rowtype;
  report_school_id uuid;
  changed public.reports%rowtype;
begin
  select year.school_id into report_school_id
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where report.id = target_report_id;
  if not found then raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into actor from internal.lock_and_require_report_authority(
    report_school_id, array['REPORTS_REVIEW']::public.app_permission[]
  );
  perform internal.lock_and_require_current_report_calculation_source(
    (select calculation_run_id from public.reports where id = target_report_id), report_school_id
  );
  select report.* into report from public.reports report where report.id = target_report_id for update;
  if not found or report.status <> 'GENERATED' or report.superseded_by is not null
     or report.pdf_storage_path is null then
    raise exception 'REPORT_NOT_REVIEWABLE' using errcode = '55000';
  end if;
  if report.workflow_version <> expected_workflow_version then
    raise exception 'REPORT_WORKFLOW_CONFLICT' using errcode = '40001';
  end if;
  perform set_config('app.report_publication_workflow', 'on', true);
  update public.reports
  set status = 'REVIEWED', reviewed_at = now(), reviewed_by = actor.membership_id,
      workflow_version = workflow_version + 1
  where id = report.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'REPORT_REVIEWED', 'report', changed.id,
    jsonb_build_object('status', report.status, 'workflow_version', report.workflow_version),
    jsonb_build_object('status', changed.status, 'workflow_version', changed.workflow_version));
  return query select changed.id, changed.status, changed.workflow_version;
end;
$$;

create or replace function public.publish_reviewed_report(
  target_report_id uuid,
  expected_workflow_version bigint
)
returns table (report_id uuid, status public.report_status, workflow_version bigint, superseded_report_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  report public.reports%rowtype;
  previous public.reports%rowtype;
  changed public.reports%rowtype;
  previous_changed public.reports%rowtype;
  report_school_id uuid;
begin
  select year.school_id into report_school_id
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where report.id = target_report_id;
  if not found then raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into actor from internal.lock_and_require_report_authority(
    report_school_id, array['REPORTS_PUBLISH']::public.app_permission[]
  );
  perform internal.lock_and_require_current_report_calculation_source(
    (select calculation_run_id from public.reports where id = target_report_id), report_school_id
  );

  -- Serialize all versions for the enrollment before changing either side of
  -- the partial unique publication index.
  perform 1 from public.reports candidate
  where candidate.term_id = (select term_id from public.reports where id = target_report_id)
    and candidate.enrollment_id = (select enrollment_id from public.reports where id = target_report_id)
  order by candidate.id for update;
  select report.* into report from public.reports report where report.id = target_report_id for update;
  if not found or report.status <> 'REVIEWED' or report.superseded_by is not null
     or report.pdf_storage_path is null or report.reviewed_at is null then
    raise exception 'REPORT_NOT_PUBLISHABLE' using errcode = '55000';
  end if;
  if report.workflow_version <> expected_workflow_version then
    raise exception 'REPORT_WORKFLOW_CONFLICT' using errcode = '40001';
  end if;

  select candidate.* into previous
  from public.reports candidate
  where candidate.term_id = report.term_id
    and candidate.enrollment_id = report.enrollment_id
    and candidate.status = 'PUBLISHED'
    and candidate.id <> report.id
  order by candidate.version desc, candidate.id desc
  limit 1;

  perform set_config('app.report_publication_workflow', 'on', true);
  if previous.id is not null then
    if previous.superseded_by is distinct from report.id then
      raise exception 'REPORT_SUCCESSOR_LINK_INVALID' using errcode = '55000';
    end if;
    update public.reports
    set status = 'SUPERSEDED', workflow_version = workflow_version + 1
    where id = previous.id returning * into previous_changed;
  end if;

  update public.reports
  set status = 'PUBLISHED', published_at = now(), published_by = actor.membership_id,
      workflow_version = workflow_version + 1
  where id = report.id returning * into changed;

  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'REPORT_PUBLISHED', 'report', changed.id,
    jsonb_build_object('status', report.status, 'workflow_version', report.workflow_version),
    jsonb_build_object('status', changed.status, 'workflow_version', changed.workflow_version));
  if previous_changed.id is not null then
    perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
      'REPORT_SUPERSEDED', 'report', previous_changed.id,
      jsonb_build_object('status', previous.status, 'workflow_version', previous.workflow_version),
      jsonb_build_object('status', previous_changed.status, 'successor_report_id', changed.id,
        'workflow_version', previous_changed.workflow_version));
  end if;
  return query select changed.id, changed.status, changed.workflow_version, previous_changed.id;
end;
$$;

create or replace function public.withdraw_published_report(
  target_report_id uuid,
  expected_workflow_version bigint,
  withdrawal_reason text
)
returns table (report_id uuid, status public.report_status, workflow_version bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  report public.reports%rowtype;
  changed public.reports%rowtype;
  report_school_id uuid;
  normalized_reason text := btrim(coalesce(withdrawal_reason, ''));
begin
  if length(normalized_reason) not between 1 and 1000 then
    raise exception 'REPORT_WITHDRAWAL_REASON_REQUIRED' using errcode = '22023';
  end if;
  select year.school_id into report_school_id
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where report.id = target_report_id;
  if not found then raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into actor from internal.lock_and_require_report_authority(
    report_school_id, array['REPORTS_WITHDRAW']::public.app_permission[]
  );
  select report.* into report from public.reports report where report.id = target_report_id for update;
  if not found or report.status <> 'PUBLISHED' then
    raise exception 'REPORT_NOT_WITHDRAWABLE' using errcode = '55000';
  end if;
  if report.workflow_version <> expected_workflow_version then
    raise exception 'REPORT_WORKFLOW_CONFLICT' using errcode = '40001';
  end if;
  perform set_config('app.report_publication_workflow', 'on', true);
  update public.reports
  set status = 'WITHDRAWN', withdrawn_at = now(), withdrawn_by = actor.membership_id,
      withdrawal_reason = normalized_reason, workflow_version = workflow_version + 1
  where id = report.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'REPORT_WITHDRAWN', 'report', changed.id,
    jsonb_build_object('status', report.status, 'workflow_version', report.workflow_version),
    jsonb_build_object('status', changed.status, 'withdrawal_reason', normalized_reason,
      'workflow_version', changed.workflow_version), normalized_reason);
  return query select changed.id, changed.status, changed.workflow_version;
end;
$$;

create or replace function public.get_report_artifact_descriptor(target_report_id uuid)
returns table (
  report_id uuid,
  status public.report_status,
  report_version integer,
  workflow_version bigint,
  has_artifact boolean,
  file_checksum text,
  file_size bigint,
  renderer_version text,
  stored_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  withdrawn_at timestamptz,
  storage_path text
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  report_school_id uuid;
begin
  select year.school_id into report_school_id
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where report.id = target_report_id;
  if not found or not internal.current_user_can_read_report(target_report_id) then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
  select report.id, report.status, report.version, report.workflow_version,
    report.pdf_storage_path is not null, report.file_checksum, report.pdf_size_bytes,
    report.pdf_renderer_version, report.pdf_stored_at, report.reviewed_at,
    report.published_at, report.withdrawn_at, report.pdf_storage_path
  from public.reports report
  where report.id = target_report_id;
end;
$$;

create or replace function public.record_report_artifact_access(
  target_report_id uuid,
  verified_checksum text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  report public.reports%rowtype;
  report_school_id uuid;
begin
  select year.school_id into report_school_id
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where report.id = target_report_id;
  if not found then raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into actor from internal.lock_and_require_report_authority(
    report_school_id,
    array['REPORTS_VIEW_ALL','REPORTS_GENERATE','REPORTS_VIEW_ASSIGNED']::public.app_permission[]
  );
  select report.* into report from public.reports report where report.id = target_report_id for update;
  if not found or not internal.current_user_can_read_report(target_report_id)
     or report.file_checksum is distinct from verified_checksum then
    raise exception 'REPORT_ARTIFACT_ACCESS_DENIED' using errcode = '42501';
  end if;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'REPORT_ARTIFACT_ACCESSED', 'report', report.id, null,
    jsonb_build_object('artifact_checksum', report.file_checksum));
  return true;
end;
$$;

revoke all on function internal.lock_and_require_report_authority(uuid, public.app_permission[]) from public, anon, authenticated;
revoke all on function internal.current_user_can_read_report(uuid) from public, anon, authenticated;
revoke all on function internal.report_artifact_access(text, boolean) from public, anon, authenticated;
revoke all on function internal.report_artifact_upload_access(text) from public, anon, authenticated;
revoke all on function internal.report_artifact_cleanup_access(text) from public, anon, authenticated;

revoke all on function public.register_report_pdf_artifact(uuid, bigint, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.review_generated_report(uuid, bigint) from public, anon, authenticated;
revoke all on function public.publish_reviewed_report(uuid, bigint) from public, anon, authenticated;
revoke all on function public.withdraw_published_report(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.get_report_artifact_descriptor(uuid) from public, anon, authenticated;
revoke all on function public.record_report_artifact_access(uuid, text) from public, anon, authenticated;

grant execute on function public.register_report_pdf_artifact(uuid, bigint, text, text, bigint, text) to authenticated;
grant execute on function public.review_generated_report(uuid, bigint) to authenticated;
grant execute on function public.publish_reviewed_report(uuid, bigint) to authenticated;
grant execute on function public.withdraw_published_report(uuid, bigint, text) to authenticated;
grant execute on function public.get_report_artifact_descriptor(uuid) to authenticated;
grant execute on function public.record_report_artifact_access(uuid, text) to authenticated;

revoke insert, update, delete on table public.reports from anon, authenticated;
revoke insert, update, delete on table public.report_snapshots from anon, authenticated;
revoke insert, update, delete on table public.report_subject_results from anon, authenticated;
revoke insert, update, delete on table public.report_snapshot_sources from anon, authenticated;

comment on column public.reports.workflow_version is
  'Optimistic concurrency version for guarded Stage 14 artifact/publication mutations.';
comment on column public.reports.pdf_renderer_version is
  'Stable renderer contract identifier, distinct from report and calculation versions.';
