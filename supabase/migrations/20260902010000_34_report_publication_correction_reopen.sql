-- A controlled marks correction may follow a completed publication. Pending
-- downstream work still blocks reopen; finalized report history is retained
-- and superseded atomically when the corrected report is published.
create or replace function public.reopen_locked_term_for_mark_correction(
  target_term_id uuid,
  expected_updated_at timestamptz,
  correction_reason text
)
returns table (
  term_id uuid,
  term_status public.term_status,
  term_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_term public.terms%rowtype;
  normalized_reason text;
  changed public.terms%rowtype;
begin
  normalized_reason := internal.normalize_marks_workflow_reason(correction_reason);
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_LOCK');
  selected_term := internal.lock_term_marks_workflow_context(
    target_term_id, actor.school_id, expected_updated_at
  );
  if selected_term.status <> 'LOCKED' then
    raise exception 'TERM_MARKS_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;

  if exists (
       select 1 from public.report_batches batch
       where batch.term_id = selected_term.id
         and batch.status <> 'COMPLETED'
     )
     or exists (
       select 1 from public.reports report
       where report.term_id = selected_term.id
         and report.status not in ('PUBLISHED', 'WITHDRAWN', 'SUPERSEDED')
     )
     or exists (select 1 from public.promotion_decisions decision where decision.term_id = selected_term.id) then
    raise exception 'TERM_MARKS_CORRECTION_DOWNSTREAM_DEPENDENCY'
      using errcode = '55000';
  end if;

  perform set_config('app.term_marks_workflow_transition', 'allowed', true);
  update public.terms set status = 'REVIEW'
  where id = selected_term.id returning * into changed;
  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'TERM_MARKS_REOPENED_FOR_CORRECTION', 'term', changed.id,
    jsonb_build_object('status', selected_term.status),
    jsonb_build_object('status', changed.status, 'correction_reason', normalized_reason)
  );
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

-- Same-report registrations must serialize before entering the broad source
-- lock path. Without this early per-report lock, two fresh registrations can
-- acquire overlapping authority/source locks in different transactions while
-- both wait on the report row, leaving the registration race unresolved.
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
  -- Take the target-row lock before any shared authority/source locks. This
  -- makes the same-report registration order unambiguous under concurrency.
  select report_row.* into report
  from public.reports report_row
  where report_row.id = target_report_id
  for update;
  if not found then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Serialize only competing registrations for this report before taking the
  -- authority and academic source locks below.
  perform pg_advisory_xact_lock(
    hashtextextended(target_report_id::text, 14014)
  );

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

revoke all on function public.register_report_pdf_artifact(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.register_report_pdf_artifact(uuid, bigint, text)
  to authenticated;
