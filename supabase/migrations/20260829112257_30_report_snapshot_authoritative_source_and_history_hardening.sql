-- Stage 12 final correction: only the current, finalized Stage 11 source may
-- create a new report snapshot. Historical report content remains readable.

-- Migration 29's checksum uniqueness treated content identity as history
-- identity. A later A -> B -> A report is valid, so report history is
-- serialized by term/enrollment and the existing term/enrollment/version
-- constraint remains the uniqueness boundary.
drop index if exists public.report_calculation_enrollment_context_unique;

comment on index public.report_term_enrollment_version_unique is
  'Report history identity is term + enrollment + report version; content checksums may repeat historically.';

-- This helper follows the Stage 11 lock order and validates the source while
-- the authority, academic rows, and report transaction are stable.
create or replace function internal.lock_and_require_current_report_calculation_source(
  target_calculation_run_id uuid,
  target_school_id uuid
)
returns public.result_calculation_runs
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  target_run public.result_calculation_runs%rowtype;
  locked_run public.result_calculation_runs%rowtype;
  latest_run public.result_calculation_runs%rowtype;
  term_row public.terms%rowtype;
  year_row public.academic_years%rowtype;
  grade_row public.grade_levels%rowtype;
  missing_scopes bigint;
  unlocked_scopes bigint;
  current_checksum text;
begin
  select run.* into target_run
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where run.id = target_calculation_run_id
    and year.school_id = target_school_id;
  if not found then
    raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Stage 11 calculate_grade_results uses this same term/grade lock.
  perform pg_advisory_xact_lock(
    hashtextextended(
      target_run.term_id::text || ':' || target_run.grade_level_id::text,
      11011
    )
  );

  perform assignment.id
  from public.teaching_assignments assignment
  where assignment.term_id = target_run.term_id
  order by assignment.id
  for update;

  select term.* into term_row
  from public.terms term
  where term.id = target_run.term_id
  for update;
  if not found then
    raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select year.* into year_row
  from public.academic_years year
  where year.id = term_row.academic_year_id
    and year.school_id = target_school_id
  for update;
  if not found then
    raise exception 'REPORT_GENERATION_FORBIDDEN' using errcode = '42501';
  end if;

  select grade.* into grade_row
  from public.grade_levels grade
  where grade.id = target_run.grade_level_id
    and grade.school_id = target_school_id
  for update;
  if not found then
    raise exception 'REPORT_SOURCE_INVALID' using errcode = '23514';
  end if;

  perform mapping.id
  from public.grade_level_subjects mapping
  where mapping.grade_level_id = grade_row.id
  order by mapping.id
  for update;

  perform section.id
  from public.class_sections section
  where section.academic_year_id = year_row.id
    and section.grade_level_id = grade_row.id
    and section.is_active
  order by section.id
  for update;

  perform sheet.id
  from public.mark_sheets sheet
  join public.class_sections section on section.id = sheet.class_section_id
  where sheet.term_id = term_row.id
    and section.academic_year_id = year_row.id
    and section.grade_level_id = grade_row.id
  order by sheet.id
  for update;

  select run.* into locked_run
  from public.result_calculation_runs run
  where run.id = target_run.id
  for update;
  if not found then
    raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if term_row.status <> 'LOCKED' then
    raise exception 'REPORT_SOURCE_NOT_FINALIZED' using errcode = '55000';
  end if;

  with expected as (
    select section.id as class_section_id, mapping.subject_id
    from public.class_sections section
    cross join public.grade_level_subjects mapping
    where section.academic_year_id = year_row.id
      and section.grade_level_id = grade_row.id
      and section.is_active
      and mapping.grade_level_id = grade_row.id
  ), latest as (
    select expected.class_section_id, expected.subject_id,
      latest_sheet.id as mark_sheet_id,
      latest_sheet.workflow_status
    from expected
    left join lateral (
      select sheet.id, sheet.workflow_status
      from public.mark_sheets sheet
      where sheet.term_id = term_row.id
        and sheet.class_section_id = expected.class_section_id
        and sheet.subject_id = expected.subject_id
      order by sheet.version desc, sheet.id desc
      limit 1
    ) latest_sheet on true
  )
  select count(*) filter (where mark_sheet_id is null),
    count(*) filter (where mark_sheet_id is not null and workflow_status <> 'LOCKED')
  into missing_scopes, unlocked_scopes
  from latest;

  if missing_scopes > 0 or unlocked_scopes > 0 then
    raise exception 'REPORT_SOURCE_NOT_FINALIZED' using errcode = '55000';
  end if;

  select run.* into latest_run
  from public.result_calculation_runs run
  where run.term_id = locked_run.term_id
    and run.grade_level_id = locked_run.grade_level_id
  order by run.version desc, run.id desc
  limit 1
  for update;
  if latest_run.id is distinct from locked_run.id then
    raise exception 'REPORT_SOURCE_STALE' using errcode = '55000';
  end if;

  -- Reuse the exact rule ids stored on the target run. This deliberately does
  -- not select newer active rule versions.
  current_checksum := internal.results_input_checksum(
    locked_run.term_id,
    locked_run.grade_level_id,
    locked_run.grading_scale_id,
    locked_run.ranking_rule_id,
    locked_run.aggregate_classification_scale_id
  );
  if current_checksum is distinct from locked_run.input_checksum then
    raise exception 'REPORT_SOURCE_STALE' using errcode = '55000';
  end if;

  return locked_run;
end;
$$;

-- Keep the migration-28/29 helper signature compatible while making every
-- existing Stage 12 caller pass the authoritative-source guard.
create or replace function internal.lock_report_source_scope(
  target_calculation_run_id uuid,
  target_school_id uuid
)
returns public.result_calculation_runs
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  result_row public.result_calculation_runs%rowtype;
begin
  select * into result_row
  from internal.lock_and_require_current_report_calculation_source(
    target_calculation_run_id, target_school_id
  );
  return result_row;
end;
$$;

-- Readiness is a read API, so it mirrors the same Stage 11 semantics without
-- taking the generation lock. Generation itself always revalidates through
-- the locked helper above.
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
  latest_run public.result_calculation_runs%rowtype;
  term_row public.terms%rowtype;
  year_row public.academic_years%rowtype;
  grade_row public.grade_levels%rowtype;
  population bigint;
  existing bigint;
  missing_reports bigint;
  missing_scopes bigint;
  unlocked_scopes bigint;
  invalid_lineage boolean := false;
  current_checksum text;
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

  select term.* into term_row from public.terms term where term.id = run_row.term_id;
  select year.* into year_row from public.academic_years year where year.id = term_row.academic_year_id;
  select grade.* into grade_row
  from public.grade_levels grade
  where grade.id = run_row.grade_level_id and grade.school_id = actor.school_id;

  select count(*)::bigint into population
  from public.calculated_student_results calculated
  where calculated.calculation_run_id = run_row.id;

  select count(distinct report.enrollment_id)::bigint into existing
  from public.reports report
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.calculation_run_id = run_row.id;
  missing_reports := greatest(population - existing, 0);

  with expected as (
    select section.id as class_section_id, mapping.subject_id
    from public.class_sections section
    cross join public.grade_level_subjects mapping
    where section.academic_year_id = year_row.id
      and section.grade_level_id = grade_row.id
      and section.is_active
      and mapping.grade_level_id = grade_row.id
  ), latest as (
    select expected.class_section_id, expected.subject_id,
      latest_sheet.id as mark_sheet_id,
      latest_sheet.workflow_status
    from expected
    left join lateral (
      select sheet.id, sheet.workflow_status
      from public.mark_sheets sheet
      where sheet.term_id = term_row.id
        and sheet.class_section_id = expected.class_section_id
        and sheet.subject_id = expected.subject_id
      order by sheet.version desc, sheet.id desc
      limit 1
    ) latest_sheet on true
  )
  select count(*) filter (where mark_sheet_id is null),
    count(*) filter (where mark_sheet_id is not null and workflow_status <> 'LOCKED')
  into missing_scopes, unlocked_scopes
  from latest;

  select run.* into latest_run
  from public.result_calculation_runs run
  where run.term_id = run_row.term_id and run.grade_level_id = run_row.grade_level_id
  order by run.version desc, run.id desc limit 1;

  current_checksum := internal.results_input_checksum(
    run_row.term_id, run_row.grade_level_id, run_row.grading_scale_id,
    run_row.ranking_rule_id, run_row.aggregate_classification_scale_id
  );

  select exists (
    select 1
    from public.calculated_student_results calculated
    where calculated.calculation_run_id = run_row.id
      and (
        not exists (
          select 1
          from public.enrollments enrollment
          join public.class_sections section on section.id = calculated.class_section_id
          join public.academic_years year on year.id = enrollment.academic_year_id
          where enrollment.id = calculated.enrollment_id
            and section.academic_year_id = enrollment.academic_year_id
            and section.grade_level_id = run_row.grade_level_id
            and year.school_id = actor.school_id
        )
        or (select count(*) from public.calculated_subject_results subject_result
            where subject_result.calculation_run_id = calculated.calculation_run_id
              and subject_result.enrollment_id = calculated.enrollment_id)
           <> coalesce(calculated.subject_count, -1)
      )
  ) or exists (
    select 1
    from public.calculated_subject_results subject_result
    left join public.result_calculation_sources source
      on source.calculation_run_id = subject_result.calculation_run_id
     and source.class_section_id = subject_result.class_section_id
     and source.subject_id = subject_result.subject_id
    where subject_result.calculation_run_id = run_row.id and source.id is null
  ) into invalid_lineage;

  return query
  select run_row.id, run_row.version, term_row.id, term_row.name, year_row.name,
    grade_row.id, grade_row.name, population,
    case when invalid_lineage then 0 else population end,
    existing, missing_reports,
    coalesce((
      select jsonb_object_agg(history.enrollment_id::text, history.version)
      from (
        select report.enrollment_id, max(report.version) as version
        from public.reports report
        join public.calculated_student_results calculated
          on calculated.enrollment_id = report.enrollment_id
         and calculated.calculation_run_id = run_row.id
        where report.term_id = run_row.term_id
        group by report.enrollment_id
      ) history
    ), '{}'::jsonb),
    run_row.input_checksum, run_row.output_checksum,
    population > 0
      and not invalid_lineage
      and term_row.status = 'LOCKED'
      and missing_scopes = 0
      and unlocked_scopes = 0
      and latest_run.id = run_row.id
      and current_checksum = run_row.input_checksum
  ;
end;
$$;

-- Replace the report writer so idempotence is current-report-only. The
-- snapshot payload and lineage fields remain the accepted Stage 12 format.
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
  current_report public.reports%rowtype;
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
  history_count integer;
  current_count integer;
  history_max_version integer;
  class_teacher_name text;
  school_motto text;
  school_website text;
begin
  select run.* into run_row
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where run.id = target_calculation_run_id and year.school_id = actor_school_id
  for update;
  if not found then raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001'; end if;

  -- Report history is serialized before enrollment/student/context rows are
  -- locked, so single, batch, and cross-calculation requests share one order.
  perform pg_advisory_xact_lock(hashtextextended(
    run_row.term_id::text || ':' || target_enrollment_id::text, 11013));

  select result.* into result_row
  from public.calculated_student_results result
  where result.calculation_run_id = run_row.id and result.enrollment_id = target_enrollment_id
  for update;
  if not found then raise exception 'REPORT_CALCULATION_MISMATCH' using errcode = '23514'; end if;

  select enrollment.* into enrollment_row from public.enrollments enrollment
  where enrollment.id = target_enrollment_id for update;
  if not found then raise exception 'REPORT_CALCULATION_MISMATCH' using errcode = '23514'; end if;

  select student.* into student_row from public.students student
  where student.id = enrollment_row.student_id and student.school_id = actor_school_id
  for update;
  if not found then raise exception 'REPORT_CALCULATION_MISMATCH' using errcode = '23514'; end if;

  select section.* into section_row from public.class_sections section
  where section.id = result_row.class_section_id for update;
  if not found then raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514'; end if;

  select grade.* into grade_row from public.grade_levels grade
  where grade.id = run_row.grade_level_id and grade.school_id = actor_school_id for update;
  if not found or section_row.grade_level_id is distinct from grade_row.id then
    raise exception 'REPORT_CALCULATION_MISMATCH' using errcode = '23514';
  end if;

  select term.* into current_term from public.terms term where term.id = run_row.term_id for update;
  if not found then raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001'; end if;
  select year.* into current_year from public.academic_years year
  where year.id = current_term.academic_year_id and year.school_id = actor_school_id for update;
  if not found then raise exception 'REPORT_GENERATION_FORBIDDEN' using errcode = '42501'; end if;

  select school.* into school_row from public.schools school
  where school.id = actor_school_id for update;
  if not found or not school_row.is_active then raise exception 'REPORT_GENERATION_FORBIDDEN' using errcode = '42501'; end if;

  select attendance.* into attendance_row from public.term_attendance attendance
  where attendance.term_id = run_row.term_id and attendance.enrollment_id = target_enrollment_id for update;
  select comment_record.* into comment_row from public.student_term_comments comment_record
  where comment_record.term_id = run_row.term_id and comment_record.enrollment_id = target_enrollment_id for update;

  select profile.first_name || ' ' || coalesce(profile.middle_name || ' ', '') || profile.last_name
  into class_teacher_name
  from public.class_teacher_assignments assignment
  join public.school_staff_memberships membership on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  where assignment.term_id = run_row.term_id and assignment.class_section_id = result_row.class_section_id
    and assignment.is_active and assignment.starts_on <= current_term.ends_on
    and (assignment.ends_on is null or assignment.ends_on >= current_term.starts_on)
    and membership.school_id = actor_school_id and membership.status = 'ACTIVE'
  order by assignment.is_primary desc, assignment.id limit 1 for update;

  select setting.setting_value ->> 'value' into school_motto from public.school_settings setting
  where setting.school_id = actor_school_id and setting.setting_key = 'motto' for update;
  select setting.setting_value ->> 'value' into school_website from public.school_settings setting
  where setting.school_id = actor_school_id and setting.setting_key = 'website' for update;

  select term.* into next_term
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  where year.school_id = actor_school_id and term.starts_on > current_term.ends_on
  order by term.starts_on, term.id limit 1 for update;

  if exists (
    select 1 from public.calculated_subject_results calculated
    left join public.result_calculation_sources source
      on source.calculation_run_id = calculated.calculation_run_id
     and source.class_section_id = calculated.class_section_id and source.subject_id = calculated.subject_id
    where calculated.calculation_run_id = run_row.id and calculated.enrollment_id = target_enrollment_id and source.id is null
  ) then raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514'; end if;
  if (select count(*) from public.calculated_subject_results calculated
      where calculated.calculation_run_id = run_row.id and calculated.enrollment_id = target_enrollment_id)
     <> coalesce(result_row.subject_count, -1) then
    raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514';
  end if;

  perform subject.id
  from public.subjects subject
  join public.calculated_subject_results calculated on calculated.subject_id = subject.id
    and calculated.calculation_run_id = run_row.id and calculated.enrollment_id = target_enrollment_id
  order by subject.id for update;

  select string_agg(concat_ws('|', subject.id, subject.code, subject.name, source.curriculum_sort_order,
    calculated.subject_status::text, coalesce(calculated.subject_score::text, ''), coalesce(calculated.grade, ''),
    coalesce(calculated.aggregate_points::text, ''), coalesce(calculated.is_pass::text, ''), calculated.assessed_weight,
    calculated.has_absence, calculated.has_exemption, coalesce(calculated.subject_position::text, ''),
    calculated.subject_tie_size, calculated.subject_is_tied), ';' order by source.curriculum_sort_order, subject.id)
  into subject_canonical
  from public.calculated_subject_results calculated
  join public.subjects subject on subject.id = calculated.subject_id
  join public.result_calculation_sources source on source.calculation_run_id = calculated.calculation_run_id
    and source.class_section_id = calculated.class_section_id and source.subject_id = calculated.subject_id
  where calculated.calculation_run_id = run_row.id and calculated.enrollment_id = target_enrollment_id;

  snapshot_payload := jsonb_build_object(
    'snapshot_schema_version', 1,
    'source', jsonb_build_object('calculation_run_id', run_row.id, 'calculation_version', run_row.version,
      'input_checksum', run_row.input_checksum, 'output_checksum', run_row.output_checksum),
    'school', jsonb_build_object('id', school_row.id, 'name', school_row.name, 'school_code', school_row.school_code,
      'address', school_row.address, 'phone', school_row.phone, 'email', school_row.email,
      'timezone', school_row.timezone, 'logo_storage_path', school_row.logo_storage_path,
      'motto', school_motto, 'website', school_website),
    'student', jsonb_build_object('id', student_row.id, 'admission_number', student_row.admission_number,
      'display_name', concat_ws(' ', student_row.first_name, student_row.middle_name, student_row.last_name),
      'gender', student_row.gender, 'date_of_birth', student_row.date_of_birth, 'photo_storage_path', student_row.photo_storage_path),
    'academic_period', jsonb_build_object('academic_year_id', current_year.id, 'academic_year_name', current_year.name,
      'term_id', current_term.id, 'term_name', current_term.name, 'term_number', current_term.term_number),
    'placement', jsonb_build_object('enrollment_id', enrollment_row.id, 'enrollment_status', enrollment_row.status,
      'class_section_id', section_row.id, 'class_name', section_row.name, 'class_code', section_row.class_code,
      'grade_level_id', grade_row.id, 'grade_code', grade_row.code, 'grade_name', grade_row.name),
    'academic_summary', jsonb_build_object('overall_total', result_row.overall_total, 'overall_average', result_row.overall_average,
      'overall_grade', result_row.overall_grade, 'aggregate_total', result_row.aggregate_total,
      'aggregate_classification', result_row.aggregate_classification, 'subject_count', result_row.subject_count,
      'complete_subject_count', result_row.complete_subject_count, 'subjects_passed', result_row.subjects_passed,
      'is_complete', result_row.is_complete, 'ranking_eligible', result_row.ranking_eligible,
      'class_position', result_row.class_position, 'grade_level_position', result_row.grade_level_position,
      'class_tie_size', result_row.class_tie_size, 'grade_level_tie_size', result_row.grade_level_tie_size,
      'class_is_tied', result_row.class_is_tied, 'grade_level_is_tied', result_row.grade_level_is_tied),
    'attendance', case when attendance_row.id is null then null else jsonb_build_object('days_open', attendance_row.days_open,
      'days_present', attendance_row.days_present, 'days_absent', attendance_row.days_absent, 'times_late', attendance_row.times_late) end,
    'comments', case when comment_row.id is null then null else jsonb_build_object('class_teacher_comment', comment_row.class_teacher_comment,
      'head_teacher_comment', comment_row.head_teacher_comment, 'conduct_grade', comment_row.conduct_grade) end,
    'signatories', jsonb_build_object('class_teacher', case when class_teacher_name is null then null else
      jsonb_build_object('display_name', class_teacher_name, 'role_context', 'Class teacher') end, 'head_teacher', null),
    'next_term', case when next_term.id is null then null else jsonb_build_object('term_id', next_term.id,
      'term_name', next_term.name, 'term_number', next_term.term_number, 'starts_on', next_term.starts_on) end
  );

  snapshot_context_hash := encode(extensions.digest(concat_ws(':', 'report-snapshot-context-v1', run_row.id,
    run_row.input_checksum, run_row.output_checksum, snapshot_payload::text, coalesce(subject_canonical, '')), 'sha256'), 'hex');

  select count(*)::integer, count(*) filter (where report.superseded_by is null)::integer,
    max(report.version)::integer
  into history_count, current_count, history_max_version
  from public.reports report
  where report.term_id = run_row.term_id and report.enrollment_id = target_enrollment_id;
  if history_count > 0 and current_count <> 1 then
    raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514';
  end if;

  if current_count = 1 then
    select report.* into current_report from public.reports report
    where report.term_id = run_row.term_id and report.enrollment_id = target_enrollment_id
      and report.superseded_by is null
    order by report.version desc for update;
    if current_report.version <> history_max_version then
      raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514';
    end if;
  end if;

  if current_report.id is not null
     and current_report.calculation_run_id = run_row.id
     and current_report.snapshot_context_checksum = snapshot_context_hash then
    select snapshot.* into existing_snapshot from public.report_snapshots snapshot
    where snapshot.report_id = current_report.id order by snapshot.snapshot_version desc limit 1 for update;
    if not found then raise exception 'REPORT_SNAPSHOT_SCHEMA_ERROR' using errcode = '23514'; end if;
    return query select current_report.id, current_report.version, existing_snapshot.id, true, current_report.superseded_by;
    return;
  end if;

  previous_report := current_report;
  perform internal.validate_report_calculation_lineage(previous_report, run_row);
  next_version := coalesce(history_max_version, 0) + 1;

  insert into public.reports(batch_id, term_id, enrollment_id, template_id, calculation_run_id,
    snapshot_context_checksum, version, status, generated_at, created_by)
  values(target_batch_id, run_row.term_id, target_enrollment_id, null, run_row.id,
    snapshot_context_hash, next_version, 'GENERATED', now(), actor_membership_id)
  returning id into new_report_id;

  insert into public.report_snapshots(report_id, snapshot_version, snapshot_data, source_checksum,
    snapshot_schema_version, snapshot_checksum)
  values(new_report_id, 1, snapshot_payload, run_row.input_checksum, 1, snapshot_context_hash)
  returning id into new_snapshot_id;

  insert into public.report_snapshot_sources(snapshot_id, report_id, calculation_run_id,
    calculated_student_result_id, input_checksum, output_checksum)
  values(new_snapshot_id, new_report_id, run_row.id, result_row.id, run_row.input_checksum, run_row.output_checksum);

  insert into public.report_subject_results(report_id, subject_id, subject_code, subject_name, subject_score, grade,
    aggregate_points, subject_position, subject_status, is_pass, assessed_weight, has_absence, has_exemption,
    subject_tie_size, subject_is_tied, teacher_comment, sort_order)
  select new_report_id, subject.id, subject.code, subject.name, calculated.subject_score, calculated.grade,
    calculated.aggregate_points, calculated.subject_position, calculated.subject_status, calculated.is_pass,
    calculated.assessed_weight, calculated.has_absence, calculated.has_exemption, calculated.subject_tie_size,
    calculated.subject_is_tied, null, source.curriculum_sort_order
  from public.calculated_subject_results calculated
  join public.subjects subject on subject.id = calculated.subject_id
  join public.result_calculation_sources source on source.calculation_run_id = calculated.calculation_run_id
    and source.class_section_id = calculated.class_section_id and source.subject_id = calculated.subject_id
  where calculated.calculation_run_id = run_row.id and calculated.enrollment_id = target_enrollment_id
  order by source.curriculum_sort_order, subject.id;

  if previous_report.id is not null then
    perform set_config('app.report_snapshot_generation', 'on', true);
    update public.reports set superseded_by = new_report_id where id = previous_report.id;
  end if;

  perform internal.record_configuration_audit(actor_profile_id, actor_membership_id, actor_school_id,
    'REPORT_SNAPSHOT_CREATED', 'report', new_report_id, null,
    jsonb_build_object('report_version', next_version, 'calculation_run_id', run_row.id,
      'calculation_version', run_row.version, 'enrollment_id', target_enrollment_id,
      'snapshot_checksum', snapshot_context_hash, 'supersedes_report_id', previous_report.id));

  return query select new_report_id, next_version, new_snapshot_id, false, previous_report.id;
end;
$$;

revoke all on function internal.lock_and_require_current_report_calculation_source(uuid, uuid),
  internal.lock_report_source_scope(uuid, uuid),
  internal.generate_student_report_snapshot(uuid, uuid, uuid, uuid, uuid, uuid)
from public, anon, authenticated;

comment on function internal.lock_and_require_current_report_calculation_source(uuid, uuid) is
  'Stage 12 generation guard: locks Stage 11-compatible academic state and requires the current finalized input.';
