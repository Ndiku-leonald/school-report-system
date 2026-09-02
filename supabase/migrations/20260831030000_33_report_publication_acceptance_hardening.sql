-- Stage 14 acceptance hardening.
-- Migration 32 remains unchanged. This migration closes the direct Storage
-- trust boundary, fixes live role timing, and makes Stage 12 supersession
-- statuses publication-aware without changing academic snapshot data.

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
  auth_session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'REPORT_AUTH_REQUIRED' using errcode = '28000';
  end if;

  auth_session_id := internal.current_auth_session_id();
  if auth_session_id is null then
    raise exception 'REPORT_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select selection.* into selected
  from internal.staff_session_active_memberships selection
  where selection.session_id = auth_session_id
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
      and assignment.granted_at <= now()
      and assignment.revoked_at is null
      and mapping.permission = any(requested_permissions)
  ) then
    raise exception 'REPORT_FORBIDDEN' using errcode = '42501';
  end if;

  return query select membership.profile_id, membership.id, membership.school_id;
end;
$$;

-- Stage 12 links the previous report through superseded_by. Convert only
-- generated/reviewed predecessors to SUPERSEDED; published and withdrawn
-- history retains its committed publication state.
create or replace function internal.apply_report_generation_supersession_status()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_setting('app.report_snapshot_generation', true) = 'on'
     and old.calculation_run_id is not null
     and old.superseded_by is null
     and new.superseded_by is not null then
    if old.status in ('GENERATED', 'REVIEWED') then
      new.status := 'SUPERSEDED';
    elsif old.status in ('PUBLISHED', 'WITHDRAWN') then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a_reports_generation_supersession_status on public.reports;
create trigger a_reports_generation_supersession_status
before update on public.reports
for each row execute function internal.apply_report_generation_supersession_status();

-- No authenticated client can write or read report-artifact objects directly.
-- The product server uses the narrow server-only Storage transport instead.
drop policy if exists report_artifacts_select_authorized on storage.objects;
drop policy if exists report_artifacts_insert_managed on storage.objects;
drop policy if exists report_artifacts_delete_orphan on storage.objects;

revoke all on function internal.report_artifact_access(text, boolean)
  from public, anon, authenticated;
revoke all on function internal.report_artifact_upload_access(text)
  from public, anon, authenticated;
revoke all on function internal.report_artifact_cleanup_access(text)
  from public, anon, authenticated;

-- The authoritative Storage metadata fields are Supabase's system metadata:
-- metadata.size and metadata.mimetype. The server-created canonical object is
-- the only object eligible for registration after direct policies are removed.
drop function if exists public.register_report_pdf_artifact(
  uuid, bigint, text, text, bigint, text
);

create or replace function public.authorize_report_artifact_generation(
  target_report_id uuid
)
returns table (report_id uuid, workflow_version bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  report public.reports%rowtype;
  report_school_id uuid;
begin
  select year.school_id into report_school_id
  from public.reports report_row
  join public.terms term on term.id = report_row.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where report_row.id = target_report_id;
  if not found then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform internal.lock_and_require_report_authority(
    report_school_id, array['REPORTS_GENERATE']::public.app_permission[]
  );
  perform internal.lock_and_require_current_report_calculation_source(
    (select calculation_run_id from public.reports where id = target_report_id),
    report_school_id
  );

  select report_row.* into report
  from public.reports report_row
  where report_row.id = target_report_id
  for update;
  if not found or report.calculation_run_id is null
     or report.status <> 'GENERATED'
     or report.superseded_by is not null
     or report.pdf_storage_path is not null then
    raise exception 'REPORT_NOT_CURRENT' using errcode = '55000';
  end if;
  return query select report.id, report.workflow_version;
end;
$$;

create or replace function public.register_report_pdf_artifact(
  target_report_id uuid,
  expected_workflow_version bigint,
  canonical_storage_path text
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
  object_metadata jsonb;
  parsed_checksum text;
  authoritative_size bigint;
  changed public.reports%rowtype;
begin
  select year.school_id into report_school_id
  from public.reports report_row
  join public.terms term on term.id = report_row.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where report_row.id = target_report_id;
  if not found then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into actor from internal.lock_and_require_report_authority(
    report_school_id, array['REPORTS_GENERATE']::public.app_permission[]
  );
  perform internal.lock_and_require_current_report_calculation_source(
    (select calculation_run_id from public.reports where id = target_report_id),
    report_school_id
  );

  select report_row.* into report
  from public.reports report_row
  where report_row.id = target_report_id
  for update;
  if not found or report.calculation_run_id is null
     or report.status <> 'GENERATED' or report.superseded_by is not null then
    raise exception 'REPORT_NOT_CURRENT' using errcode = '55000';
  end if;
  if report.workflow_version <> expected_workflow_version then
    raise exception 'REPORT_WORKFLOW_CONFLICT' using errcode = '40001';
  end if;

  if canonical_storage_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.pdf$'
     or canonical_storage_path is distinct from target_report_id::text || '/' ||
       split_part(split_part(canonical_storage_path, '/', 2), '.', 1) || '.pdf' then
    raise exception 'REPORT_ARTIFACT_INVALID' using errcode = '22023';
  end if;
  parsed_checksum := split_part(split_part(canonical_storage_path, '/', 2), '.', 1);

  select object.metadata into object_metadata
  from storage.objects object
  where object.bucket_id = 'report-artifacts'
    and object.name = canonical_storage_path
    and object.metadata->>'mimetype' = 'application/pdf';
  if not found then
    raise exception 'REPORT_ARTIFACT_NOT_FOUND' using errcode = 'P0001';
  end if;

  begin
    authoritative_size := (object_metadata->>'size')::bigint;
  exception when invalid_text_representation then
    raise exception 'REPORT_ARTIFACT_INVALID' using errcode = '22023';
  end;
  if authoritative_size is null or authoritative_size <= 0
     or authoritative_size > 10485760 then
    raise exception 'REPORT_ARTIFACT_INVALID' using errcode = '22023';
  end if;

  if report.pdf_storage_path is not null then
    if report.pdf_storage_path = canonical_storage_path
       and report.file_checksum = parsed_checksum
       and report.pdf_size_bytes = authoritative_size then
      return query select report.id, report.status, report.workflow_version,
        report.file_checksum, report.pdf_size_bytes, report.pdf_storage_path, true;
      return;
    end if;
    raise exception 'REPORT_ARTIFACT_ALREADY_REGISTERED' using errcode = '55000';
  end if;

  perform set_config('app.report_publication_workflow', 'on', true);
  update public.reports as target
  set pdf_storage_path = canonical_storage_path,
      file_checksum = parsed_checksum,
      pdf_size_bytes = authoritative_size,
      pdf_stored_at = now(),
      pdf_renderer_version = 'report-card-v1',
      workflow_version = target.workflow_version + 1
  where target.id = report.id
  returning target.* into changed;

  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'REPORT_ARTIFACT_STORED', 'report', changed.id, null,
    jsonb_build_object('file_checksum', changed.file_checksum,
      'file_size_bytes', changed.pdf_size_bytes,
      'renderer_version', changed.pdf_renderer_version,
      'workflow_version', changed.workflow_version)
  );
  return query select changed.id, changed.status, changed.workflow_version,
    changed.file_checksum, changed.pdf_size_bytes, changed.pdf_storage_path, false;
end;
$$;

revoke all on function public.authorize_report_artifact_generation(uuid)
  from public, anon, authenticated;
grant execute on function public.authorize_report_artifact_generation(uuid)
  to authenticated;
revoke all on function public.register_report_pdf_artifact(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.register_report_pdf_artifact(uuid, bigint, text)
  to authenticated;

comment on function public.register_report_pdf_artifact(uuid, bigint, text) is
  'Registers only a server-created canonical report artifact; checksum, size, MIME, and renderer metadata are database-derived.';
