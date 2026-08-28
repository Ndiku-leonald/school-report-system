-- Stage 12 correction: repair migration-28 inference, readiness semantics,
-- immutable payloads, context-aware versions, and source lineage.

-- PostgreSQL can infer ON CONFLICT (calculation_run_id) only from a normal
-- unique index/constraint here. Multiple NULLs remain allowed by ordinary
-- PostgreSQL uniqueness, so legacy batches without Stage 11 linkage survive.
drop index if exists public.report_batch_calculation_run_unique;
create unique index report_batch_calculation_run_unique
  on public.report_batches (calculation_run_id);

-- A report context is the complete frozen payload plus ordered subject rows.
-- Store its checksum on the report row so exact duplicate contexts are
-- prevented without incorrectly making run + student unique.
alter table public.reports
  add column snapshot_context_checksum text
    check (
      snapshot_context_checksum is null
      or length(btrim(snapshot_context_checksum)) = 64
    );

-- Migration 28 made generated reports immutable. Temporarily remove that
-- trigger only while backfilling the new context identity, then restore it at
-- the end of this migration.
drop trigger if exists reports_generated_prevent_mutation on public.reports;

update public.reports report
set snapshot_context_checksum = encode(
  extensions.digest(
    concat_ws(
      ':',
      'report-snapshot-context-v1',
      report.calculation_run_id,
      run.input_checksum,
      run.output_checksum,
      snapshot.snapshot_data::text,
      coalesce((
        select string_agg(
          concat_ws(
            '|',
            result.subject_id,
            result.subject_code,
            result.subject_name,
            result.sort_order,
            result.subject_status::text,
            coalesce(result.subject_score::text, ''),
            coalesce(result.grade, ''),
            coalesce(result.aggregate_points::text, ''),
            coalesce(result.is_pass::text, ''),
            result.assessed_weight,
            result.has_absence,
            result.has_exemption,
            coalesce(result.subject_position::text, ''),
            result.subject_tie_size,
            result.subject_is_tied
          ),
          ';' order by result.sort_order, result.subject_id
        )
        from public.report_subject_results result
        where result.report_id = report.id
      ), '')
    ),
    'sha256'
  ),
  'hex'
)
from public.report_snapshots snapshot,
     public.result_calculation_runs run
where snapshot.report_id = report.id
  and run.id = report.calculation_run_id
  and report.calculation_run_id is not null;

drop index if exists public.report_calculation_run_enrollment_unique;
alter table public.report_snapshot_sources
  drop constraint if exists report_snapshot_source_run_student_unique;

create unique index report_calculation_enrollment_context_unique
  on public.reports (
    calculation_run_id,
    enrollment_id,
    snapshot_context_checksum
  );

-- Make the explicit generated-snapshot trigger visible independently of the
-- legacy report_snapshots_prevent_mutation trigger from migration 5.
drop trigger if exists report_snapshots_generated_prevent_mutation
  on public.report_snapshots;
create trigger report_snapshots_generated_prevent_mutation
before update or delete on public.report_snapshots
for each row execute function internal.prevent_mutation();

-- These child policies intentionally delegate visibility to the report row.
-- The reports policy already encodes school, role, class, and assignment
-- scope; duplicating only REPORTS_VIEW_ALL/REPORTS_GENERATE here would hide
-- snapshots from otherwise authorized class-teacher readers.
drop policy if exists report_snapshots_select_authorized on public.report_snapshots;
create policy report_snapshots_select_authorized
on public.report_snapshots for select to authenticated
using (
  exists (
    select 1
    from public.reports report
    where report.id = report_snapshots.report_id
  )
);

drop policy if exists report_subject_results_select_authorized
  on public.report_subject_results;
create policy report_subject_results_select_authorized
on public.report_subject_results for select to authenticated
using (
  exists (
    select 1
    from public.reports report
    where report.id = report_subject_results.report_id
  )
);

drop policy if exists report_snapshot_sources_select_authorized
  on public.report_snapshot_sources;
create policy report_snapshot_sources_select_authorized
on public.report_snapshot_sources for select to authenticated
using (
  exists (
    select 1
    from public.reports report
    where report.id = report_snapshot_sources.report_id
  )
);

-- Rebind the existing report scope guard after the migration-28 function
-- replacement so legacy rows retain actor and academic-scope validation.
drop trigger if exists reports_validate_scope on public.reports;
create trigger reports_validate_scope
before insert or update on public.reports
for each row execute function internal.validate_report_scope();

create or replace function internal.validate_report_snapshot_source_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  snapshot_report_id uuid;
  snapshot_checksum text;
  report_run_id uuid;
  report_enrollment_id uuid;
  report_context_checksum text;
  result_run_id uuid;
  result_enrollment_id uuid;
  run_input_checksum text;
  run_output_checksum text;
begin
  select snapshot.report_id, snapshot.snapshot_checksum
    into snapshot_report_id, snapshot_checksum
  from public.report_snapshots snapshot
  where snapshot.id = new.snapshot_id;

  select report.calculation_run_id, report.enrollment_id,
         report.snapshot_context_checksum
    into report_run_id, report_enrollment_id, report_context_checksum
  from public.reports report
  where report.id = new.report_id;

  select result.calculation_run_id, result.enrollment_id
    into result_run_id, result_enrollment_id
  from public.calculated_student_results result
  where result.id = new.calculated_student_result_id;

  select run.input_checksum, run.output_checksum
    into run_input_checksum, run_output_checksum
  from public.result_calculation_runs run
  where run.id = new.calculation_run_id;

  if snapshot_report_id is distinct from new.report_id
     or report_run_id is distinct from new.calculation_run_id
     or report_enrollment_id is distinct from result_enrollment_id
     or result_run_id is distinct from new.calculation_run_id
     or report_context_checksum is distinct from snapshot_checksum
     or snapshot_checksum is distinct from new.input_checksum
     or new.input_checksum is distinct from run_input_checksum
     or new.output_checksum is distinct from run_output_checksum then
    raise exception 'Report snapshot lineage references do not match the immutable source.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.get_report_generation_readiness(
  target_calculation_run_id uuid
)
returns table(
  calculation_run_id uuid,
  calculation_version integer,
  term_id uuid,
  term_name text,
  academic_year_name text,
  grade_level_id uuid,
  grade_name text,
  student_population bigint,
  eligible_student_count bigint,
  existing_report_snapshots bigint,
  missing_report_snapshots bigint,
  latest_report_versions jsonb,
  result_input_checksum text,
  result_output_checksum text,
  ready boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  run_row public.result_calculation_runs%rowtype;
  population bigint;
  existing bigint;
  missing bigint;
  invalid_lineage boolean;
begin
  select * into actor from internal.require_results_reader();

  select run.* into run_row
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where run.id = target_calculation_run_id
    and year.school_id = actor.school_id;
  if not found then
    raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*)::bigint into population
  from public.calculated_student_results calculated
  where calculated.calculation_run_id = run_row.id;

  select count(distinct report.enrollment_id)::bigint into existing
  from public.reports report
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.calculation_run_id = run_row.id;
  missing := greatest(population - existing, 0);

  select exists (
    select 1
    from public.calculated_student_results calculated
    where calculated.calculation_run_id = run_row.id
      and (
        not exists (
          select 1
          from public.enrollments enrollment
          join public.class_sections section
            on section.id = calculated.class_section_id
          join public.academic_years year
            on year.id = enrollment.academic_year_id
          where enrollment.id = calculated.enrollment_id
            and section.academic_year_id = enrollment.academic_year_id
            and section.grade_level_id = run_row.grade_level_id
            and year.school_id = actor.school_id
        )
        or (
          select count(*)
          from public.calculated_subject_results subject_result
          where subject_result.calculation_run_id = calculated.calculation_run_id
            and subject_result.enrollment_id = calculated.enrollment_id
        ) <> coalesce(calculated.subject_count, -1)
      )
  ) or exists (
    select 1
    from public.calculated_subject_results subject_result
    left join public.result_calculation_sources source
      on source.calculation_run_id = subject_result.calculation_run_id
     and source.class_section_id = subject_result.class_section_id
     and source.subject_id = subject_result.subject_id
    where subject_result.calculation_run_id = run_row.id
      and source.id is null
  ) into invalid_lineage;

  return query
  select run_row.id, run_row.version, term.id, term.name, year.name,
    grade.id, grade.name, population,
    case when invalid_lineage then 0 else population end,
    existing, missing,
    coalesce((
      select jsonb_object_agg(history.enrollment_id::text, history.version)
      from (
        select report.enrollment_id, max(report.version) as version
        from public.reports report
        where report.term_id = run_row.term_id
        group by report.enrollment_id
      ) history
    ), '{}'::jsonb),
    run_row.input_checksum, run_row.output_checksum,
    population > 0 and not invalid_lineage
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  join public.grade_levels grade on grade.id = run_row.grade_level_id
  where term.id = run_row.term_id
    and year.school_id = actor.school_id;
end;
$$;

create or replace function public.generate_student_report_snapshot(
  target_calculation_run_id uuid,
  target_enrollment_id uuid
)
returns table(
  report_id uuid,
  report_version integer,
  snapshot_id uuid,
  reused boolean,
  supersedes_report_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  run_row public.result_calculation_runs%rowtype;
  batch_id uuid;
  student_count integer;
  result record;
  inserted_batch boolean := false;
begin
  select * into actor from internal.lock_and_require_results_authority();
  perform pg_advisory_xact_lock(
    hashtextextended(target_calculation_run_id::text, 11012)
  );

  select * into run_row
  from internal.lock_report_source_scope(
    target_calculation_run_id, actor.school_id
  );

  select count(*)::integer into student_count
  from public.calculated_student_results calculated
  where calculated.calculation_run_id = run_row.id;

  insert into public.report_batches(
    term_id, calculation_run_id, requested_by, status, total_reports,
    started_at
  ) values (
    run_row.term_id, run_row.id, actor.membership_id, 'PROCESSING',
    student_count, now()
  ) on conflict (calculation_run_id) do nothing
  returning id into batch_id;
  inserted_batch := batch_id is not null;
  if batch_id is null then
    select batch.id into batch_id
    from public.report_batches batch
    where batch.calculation_run_id = run_row.id
    for update;
  end if;

  if inserted_batch then
    perform internal.record_configuration_audit(
      actor.profile_id, actor.membership_id, actor.school_id,
      'REPORT_SNAPSHOT_BATCH_CREATED', 'report_batch', batch_id, null,
      jsonb_build_object(
        'calculation_run_id', run_row.id,
        'calculation_version', run_row.version,
        'student_count', student_count
      )
    );
  end if;

  select * into result from internal.generate_student_report_snapshot(
    batch_id, run_row.id, target_enrollment_id,
    actor.profile_id, actor.membership_id, actor.school_id
  );

  update public.report_batches batch
  set completed_reports = (
        select count(distinct report.enrollment_id)::integer
        from public.reports report
        where report.batch_id = batch.id
          and report.calculation_run_id = run_row.id
      ),
      status = case when (
        select count(distinct report.enrollment_id)
        from public.reports report
        where report.batch_id = batch.id
          and report.calculation_run_id = run_row.id
      ) >= batch.total_reports then 'COMPLETED'::public.report_batch_status
      else 'PROCESSING'::public.report_batch_status end,
      completed_at = case when (
        select count(distinct report.enrollment_id)
        from public.reports report
        where report.batch_id = batch.id
          and report.calculation_run_id = run_row.id
      ) >= batch.total_reports then coalesce(batch.completed_at, now())
      else null end
  where batch.id = batch_id;

  return query select result.report_id, result.report_version,
    result.snapshot_id, result.reused, result.supersedes_report_id;
end;
$$;

create or replace function public.generate_grade_report_snapshots(
  target_calculation_run_id uuid
)
returns table(
  batch_id uuid,
  generated_count integer,
  reused_count integer,
  failed_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  run_row public.result_calculation_runs%rowtype;
  batch_row public.report_batches%rowtype;
  student_item record;
  generated_result record;
  student_count integer;
  generated integer := 0;
  reused integer := 0;
  inserted_batch boolean := false;
begin
  select * into actor from internal.lock_and_require_results_authority();
  perform pg_advisory_xact_lock(
    hashtextextended(target_calculation_run_id::text, 11012)
  );

  select * into run_row
  from internal.lock_report_source_scope(
    target_calculation_run_id, actor.school_id
  );

  select count(*)::integer into student_count
  from public.calculated_student_results calculated
  where calculated.calculation_run_id = run_row.id;
  if student_count = 0 then
    raise exception 'REPORT_SOURCE_INVALID' using errcode = '23514';
  end if;

  insert into public.report_batches(
    term_id, calculation_run_id, requested_by, status, total_reports,
    started_at
  ) values (
    run_row.term_id, run_row.id, actor.membership_id, 'PROCESSING',
    student_count, now()
  ) on conflict (calculation_run_id) do nothing
  returning * into batch_row;
  if not found then
    select batch.* into batch_row
    from public.report_batches batch
    where batch.calculation_run_id = run_row.id
    for update;
  else
    inserted_batch := true;
  end if;

  if inserted_batch then
    perform internal.record_configuration_audit(
      actor.profile_id, actor.membership_id, actor.school_id,
      'REPORT_SNAPSHOT_BATCH_CREATED', 'report_batch', batch_row.id, null,
      jsonb_build_object(
        'calculation_run_id', run_row.id,
        'calculation_version', run_row.version,
        'student_count', student_count
      )
    );
  end if;

  for student_item in
    select calculated.enrollment_id
    from public.calculated_student_results calculated
    where calculated.calculation_run_id = run_row.id
    order by calculated.enrollment_id
  loop
    select * into generated_result from internal.generate_student_report_snapshot(
      batch_row.id, run_row.id, student_item.enrollment_id,
      actor.profile_id, actor.membership_id, actor.school_id
    );
    if generated_result.reused then
      reused := reused + 1;
    else
      generated := generated + 1;
    end if;
  end loop;

  update public.report_batches batch
  set completed_reports = (
        select count(distinct report.enrollment_id)::integer
        from public.reports report
        where report.batch_id = batch.id
          and report.calculation_run_id = run_row.id
      ),
      failed_reports = 0,
      status = case when (
        select count(distinct report.enrollment_id)
        from public.reports report
        where report.batch_id = batch.id
          and report.calculation_run_id = run_row.id
      ) >= batch.total_reports then 'COMPLETED'::public.report_batch_status
      else 'PROCESSING'::public.report_batch_status end,
      completed_at = case when (
        select count(distinct report.enrollment_id)
        from public.reports report
        where report.batch_id = batch.id
          and report.calculation_run_id = run_row.id
      ) >= batch.total_reports then coalesce(batch.completed_at, now())
      else null end
  where batch.id = batch_row.id;

  return query select batch_row.id, generated, reused, 0;
end;
$$;

-- A generated report may only be superseded by a direct successor Stage 11
-- calculation run, or regenerated from the same run for a changed report
-- context. Older/stale or unrelated calculations cannot become current.
create or replace function internal.validate_report_calculation_lineage(
  previous_report public.reports,
  target_run public.result_calculation_runs
)
returns void
language plpgsql
set search_path = pg_catalog, public, internal
as $$
declare
  target_previous_run_id uuid;
begin
  if previous_report.id is null
     or previous_report.calculation_run_id is null
     or previous_report.calculation_run_id = target_run.id then
    return;
  end if;

  target_previous_run_id := target_run.supersedes_run_id;
  if target_previous_run_id is distinct from previous_report.calculation_run_id then
    raise exception 'REPORT_CALCULATION_LINEAGE_INVALID'
      using errcode = '55000';
  end if;
end;
$$;

-- The migration-28 helper is replaced below so public generation can compare
-- the candidate checksum before deciding whether to reuse an existing report.

create or replace function internal.generate_student_report_snapshot(
  target_batch_id uuid,
  target_calculation_run_id uuid,
  target_enrollment_id uuid,
  actor_profile_id uuid,
  actor_membership_id uuid,
  actor_school_id uuid
)
returns table(
  report_id uuid,
  report_version integer,
  snapshot_id uuid,
  reused boolean,
  supersedes_report_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  run_row public.result_calculation_runs%rowtype;
  result_row public.calculated_student_results%rowtype;
  enrollment_row public.enrollments%rowtype;
  student_row public.students%rowtype;
  section_row public.class_sections%rowtype;
  grade_row public.grade_levels%rowtype;
  school_row public.schools%rowtype;
  attendance_row public.term_attendance%rowtype;
  comment_row public.student_term_comments%rowtype;
  previous_report public.reports%rowtype;
  existing_report public.reports%rowtype;
  existing_snapshot public.report_snapshots%rowtype;
  current_term public.terms%rowtype;
  current_year public.academic_years%rowtype;
  next_term public.terms%rowtype;
  snapshot_payload jsonb;
  snapshot_context_hash text;
  subject_canonical text;
  new_report_id uuid;
  new_snapshot_id uuid;
  next_version integer;
  class_teacher_name text;
  school_motto text;
  school_website text;
begin
  select run.* into run_row
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where run.id = target_calculation_run_id
    and year.school_id = actor_school_id
  for update;
  if not found then
    raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select result.* into result_row
  from public.calculated_student_results result
  where result.calculation_run_id = run_row.id
    and result.enrollment_id = target_enrollment_id
  for update;
  if not found then
    raise exception 'REPORT_CALCULATION_MISMATCH' using errcode = '23514';
  end if;

  select enrollment.* into enrollment_row
  from public.enrollments enrollment
  where enrollment.id = target_enrollment_id
  for update;
  if not found then
    raise exception 'REPORT_CALCULATION_MISMATCH' using errcode = '23514';
  end if;

  select student.* into student_row
  from public.students student
  where student.id = enrollment_row.student_id
    and student.school_id = actor_school_id
  for update;
  if not found then
    raise exception 'REPORT_CALCULATION_MISMATCH' using errcode = '23514';
  end if;

  select section.* into section_row
  from public.class_sections section
  where section.id = result_row.class_section_id
  for update;
  if not found then
    raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514';
  end if;

  select grade.* into grade_row
  from public.grade_levels grade
  where grade.id = run_row.grade_level_id
    and grade.school_id = actor_school_id
  for update;
  if not found or section_row.grade_level_id is distinct from grade_row.id then
    raise exception 'REPORT_CALCULATION_MISMATCH' using errcode = '23514';
  end if;

  select term.* into current_term
  from public.terms term
  where term.id = run_row.term_id
  for update;
  if not found then
    raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select year.* into current_year
  from public.academic_years year
  where year.id = current_term.academic_year_id
    and year.school_id = actor_school_id
  for update;
  if not found then
    raise exception 'REPORT_GENERATION_FORBIDDEN' using errcode = '42501';
  end if;

  select school.* into school_row
  from public.schools school
  where school.id = actor_school_id
  for update;
  if not found or not school_row.is_active then
    raise exception 'REPORT_GENERATION_FORBIDDEN' using errcode = '42501';
  end if;

  select attendance.* into attendance_row
  from public.term_attendance attendance
  where attendance.term_id = run_row.term_id
    and attendance.enrollment_id = target_enrollment_id
  for update;

  select comment_record.* into comment_row
  from public.student_term_comments comment_record
  where comment_record.term_id = run_row.term_id
    and comment_record.enrollment_id = target_enrollment_id
  for update;

  -- A class teacher is authoritative only when the active assignment covers
  -- the report term and belongs to the selected school. Only display name and
  -- role context are frozen; contacts and generic comment updaters are not.
  select profile.first_name || ' ' ||
         coalesce(profile.middle_name || ' ', '') || profile.last_name
    into class_teacher_name
  from public.class_teacher_assignments assignment
  join public.school_staff_memberships membership
    on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  where assignment.term_id = run_row.term_id
    and assignment.class_section_id = result_row.class_section_id
    and assignment.is_active
    and assignment.starts_on <= current_term.ends_on
    and (assignment.ends_on is null or assignment.ends_on >= current_term.starts_on)
    and membership.school_id = actor_school_id
    and membership.status = 'ACTIVE'
  order by assignment.is_primary desc, assignment.id
  limit 1
  for update;

  -- Lock both configured report-context values before reading them.
  select setting.setting_value ->> 'value'
    into school_motto
  from public.school_settings setting
  where setting.school_id = actor_school_id
    and setting.setting_key = 'motto'
  for update;
  select setting.setting_value ->> 'value'
    into school_website
  from public.school_settings setting
  where setting.school_id = actor_school_id
    and setting.setting_key = 'website'
  for update;

  -- Chronological next term may cross academic-year boundaries. The selected
  -- row is locked so its identity and opening date are coherent in the hash.
  select term.* into next_term
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  where year.school_id = actor_school_id
    and term.starts_on > current_term.starts_on
  order by term.starts_on, term.id
  limit 1
  for update;

  if exists (
    select 1
    from public.calculated_subject_results calculated
    left join public.result_calculation_sources source
      on source.calculation_run_id = calculated.calculation_run_id
     and source.class_section_id = calculated.class_section_id
     and source.subject_id = calculated.subject_id
    where calculated.calculation_run_id = run_row.id
      and calculated.enrollment_id = target_enrollment_id
      and source.id is null
  ) then
    raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.calculated_subject_results calculated
    where calculated.calculation_run_id = run_row.id
      and calculated.enrollment_id = target_enrollment_id
  ) <> coalesce(result_row.subject_count, -1) then
    raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514';
  end if;

  -- Stage 11 source order and the locked current subject identity are part of
  -- the context checksum and the normalized report subject rows.
  perform subject.id
  from public.subjects subject
  join public.calculated_subject_results calculated
    on calculated.subject_id = subject.id
   and calculated.calculation_run_id = run_row.id
   and calculated.enrollment_id = target_enrollment_id
  order by subject.id
  for update;

  select string_agg(
    concat_ws(
      '|', subject.id, subject.code, subject.name, source.curriculum_sort_order,
      calculated.subject_status::text,
      coalesce(calculated.subject_score::text, ''),
      coalesce(calculated.grade, ''),
      coalesce(calculated.aggregate_points::text, ''),
      coalesce(calculated.is_pass::text, ''), calculated.assessed_weight,
      calculated.has_absence, calculated.has_exemption,
      coalesce(calculated.subject_position::text, ''),
      calculated.subject_tie_size, calculated.subject_is_tied
    ),
    ';' order by source.curriculum_sort_order, subject.id
  ) into subject_canonical
  from public.calculated_subject_results calculated
  join public.subjects subject on subject.id = calculated.subject_id
  join public.result_calculation_sources source
    on source.calculation_run_id = calculated.calculation_run_id
   and source.class_section_id = calculated.class_section_id
   and source.subject_id = calculated.subject_id
  where calculated.calculation_run_id = run_row.id
    and calculated.enrollment_id = target_enrollment_id;

  snapshot_payload := jsonb_build_object(
    'snapshot_schema_version', 1,
    'source', jsonb_build_object(
      'calculation_run_id', run_row.id,
      'calculation_version', run_row.version,
      'input_checksum', run_row.input_checksum,
      'output_checksum', run_row.output_checksum
    ),
    'school', jsonb_build_object(
      'id', school_row.id, 'name', school_row.name,
      'school_code', school_row.school_code, 'address', school_row.address,
      'phone', school_row.phone, 'email', school_row.email,
      'timezone', school_row.timezone,
      'logo_storage_path', school_row.logo_storage_path,
      'motto', school_motto, 'website', school_website
    ),
    'student', jsonb_build_object(
      'id', student_row.id,
      'admission_number', student_row.admission_number,
      'display_name', concat_ws(' ', student_row.first_name,
        student_row.middle_name, student_row.last_name),
      'gender', student_row.gender,
      'date_of_birth', student_row.date_of_birth,
      'photo_storage_path', student_row.photo_storage_path
    ),
    'academic_period', jsonb_build_object(
      'academic_year_id', current_year.id,
      'academic_year_name', current_year.name,
      'term_id', current_term.id, 'term_name', current_term.name,
      'term_number', current_term.term_number
    ),
    'placement', jsonb_build_object(
      'enrollment_id', enrollment_row.id,
      'enrollment_status', enrollment_row.status,
      'class_section_id', section_row.id, 'class_name', section_row.name,
      'class_code', section_row.class_code,
      'grade_level_id', grade_row.id, 'grade_code', grade_row.code,
      'grade_name', grade_row.name
    ),
    'academic_summary', jsonb_build_object(
      'overall_total', result_row.overall_total,
      'overall_average', result_row.overall_average,
      'overall_grade', result_row.overall_grade,
      'aggregate_total', result_row.aggregate_total,
      'aggregate_classification', result_row.aggregate_classification,
      'subject_count', result_row.subject_count,
      'complete_subject_count', result_row.complete_subject_count,
      'subjects_passed', result_row.subjects_passed,
      'is_complete', result_row.is_complete,
      'ranking_eligible', result_row.ranking_eligible,
      'class_position', result_row.class_position,
      'grade_level_position', result_row.grade_level_position,
      'class_tie_size', result_row.class_tie_size,
      'grade_level_tie_size', result_row.grade_level_tie_size,
      'class_is_tied', result_row.class_is_tied,
      'grade_level_is_tied', result_row.grade_level_is_tied
    ),
    'attendance', case when attendance_row.id is null then null else
      jsonb_build_object(
        'days_open', attendance_row.days_open,
        'days_present', attendance_row.days_present,
        'days_absent', attendance_row.days_absent,
        'times_late', attendance_row.times_late
      ) end,
    'comments', case when comment_row.id is null then null else
      jsonb_build_object(
        'class_teacher_comment', comment_row.class_teacher_comment,
        'head_teacher_comment', comment_row.head_teacher_comment,
        'conduct_grade', comment_row.conduct_grade
      ) end,
    'signatories', jsonb_build_object(
      'class_teacher', case when class_teacher_name is null then null else
        jsonb_build_object('display_name', class_teacher_name,
          'role_context', 'Class teacher') end,
      -- The current schema does not identify the signer of a head-teacher
      -- comment. updated_by is a generic editor and must not be inferred.
      'head_teacher', null
    ),
    'next_term', case when next_term.id is null then null else
      jsonb_build_object(
        'term_id', next_term.id, 'term_name', next_term.name,
        'term_number', next_term.term_number,
        'starts_on', next_term.starts_on
      ) end
  );

  snapshot_context_hash := encode(
    extensions.digest(
      concat_ws(
        ':', 'report-snapshot-context-v1', run_row.id,
        run_row.input_checksum, run_row.output_checksum,
        snapshot_payload::text, coalesce(subject_canonical, '')
      ),
      'sha256'
    ),
    'hex'
  );

  -- The exact context key is the idempotence identity. This remains true even
  -- when the matching report is historical; creating another exact immutable
  -- copy is never necessary or permitted.
  select report.* into existing_report
  from public.reports report
  where report.calculation_run_id = run_row.id
    and report.enrollment_id = target_enrollment_id
    and report.snapshot_context_checksum = snapshot_context_hash
  order by report.version desc
  limit 1
  for update;
  if found then
    select snapshot.* into existing_snapshot
    from public.report_snapshots snapshot
    where snapshot.report_id = existing_report.id
    order by snapshot.snapshot_version desc
    limit 1
    for update;
    if not found then
      raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514';
    end if;
    return query select existing_report.id, existing_report.version,
      existing_snapshot.id, true, existing_report.superseded_by;
    return;
  end if;

  select report.* into previous_report
  from public.reports report
  where report.term_id = run_row.term_id
    and report.enrollment_id = target_enrollment_id
  order by report.version desc
  limit 1
  for update;
  if found and previous_report.superseded_by is not null then
    raise exception 'REPORT_ALREADY_SUPERSEDED' using errcode = '55000';
  end if;
  perform internal.validate_report_calculation_lineage(previous_report, run_row);

  next_version := coalesce(previous_report.version, 0) + 1;

  insert into public.reports(
    batch_id, term_id, enrollment_id, template_id, calculation_run_id,
    snapshot_context_checksum, version, status, generated_at, created_by
  ) values (
    target_batch_id, run_row.term_id, target_enrollment_id, null, run_row.id,
    snapshot_context_hash, next_version, 'GENERATED', now(), actor_membership_id
  ) returning id into new_report_id;

  insert into public.report_snapshots(
    report_id, snapshot_version, snapshot_data, source_checksum,
    snapshot_schema_version, snapshot_checksum
  ) values (
    new_report_id, 1, snapshot_payload, run_row.input_checksum, 1,
    snapshot_context_hash
  ) returning id into new_snapshot_id;

  insert into public.report_snapshot_sources(
    snapshot_id, report_id, calculation_run_id, calculated_student_result_id,
    input_checksum, output_checksum
  ) values (
    new_snapshot_id, new_report_id, run_row.id, result_row.id,
    run_row.input_checksum, run_row.output_checksum
  );

  insert into public.report_subject_results(
    report_id, subject_id, subject_code, subject_name, subject_score, grade,
    aggregate_points, subject_position, subject_status, is_pass,
    assessed_weight, has_absence, has_exemption, subject_tie_size,
    subject_is_tied, teacher_comment, sort_order
  )
  select new_report_id, subject.id, subject.code, subject.name,
    calculated.subject_score, calculated.grade, calculated.aggregate_points,
    calculated.subject_position, calculated.subject_status, calculated.is_pass,
    calculated.assessed_weight, calculated.has_absence,
    calculated.has_exemption, calculated.subject_tie_size,
    calculated.subject_is_tied, null, source.curriculum_sort_order
  from public.calculated_subject_results calculated
  join public.subjects subject on subject.id = calculated.subject_id
  join public.result_calculation_sources source
    on source.calculation_run_id = calculated.calculation_run_id
   and source.class_section_id = calculated.class_section_id
   and source.subject_id = calculated.subject_id
  where calculated.calculation_run_id = run_row.id
    and calculated.enrollment_id = target_enrollment_id
  order by source.curriculum_sort_order, subject.id;

  if previous_report.id is not null then
    perform set_config('app.report_snapshot_generation', 'on', true);
    update public.reports
    set superseded_by = new_report_id
    where id = previous_report.id;
  end if;

  perform internal.record_configuration_audit(
    actor_profile_id, actor_membership_id, actor_school_id,
    'REPORT_SNAPSHOT_CREATED', 'report', new_report_id, null,
    jsonb_build_object(
      'report_version', next_version,
      'calculation_run_id', run_row.id,
      'calculation_version', run_row.version,
      'enrollment_id', target_enrollment_id,
      'snapshot_checksum', snapshot_context_hash,
      'supersedes_report_id', previous_report.id
    )
  );

  return query select new_report_id, next_version, new_snapshot_id, false,
    previous_report.id;
end;
$$;

revoke all on function internal.validate_report_calculation_lineage(
  public.reports, public.result_calculation_runs
) from public, anon, authenticated;

create trigger reports_generated_prevent_mutation
before update or delete on public.reports
for each row execute function internal.prevent_generated_report_mutation();
