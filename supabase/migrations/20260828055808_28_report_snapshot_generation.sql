-- Stage 12: immutable, student-specific report snapshots. This migration
-- reuses the Stage 3 report skeleton while keeping PDF generation,
-- publication, parent access, and promotion outside this stage.

alter table public.report_batches
  add column calculation_run_id uuid
    references public.result_calculation_runs(id) on delete restrict;

alter table public.reports
  alter column template_id drop not null,
  add column calculation_run_id uuid
    references public.result_calculation_runs(id) on delete restrict;

alter table public.report_snapshots
  add column snapshot_schema_version integer not null default 1
    check (snapshot_schema_version > 0),
  add column snapshot_checksum text
    check (snapshot_checksum is null or length(btrim(snapshot_checksum)) = 64);

alter table public.report_subject_results
  add column subject_code text,
  add column subject_name text,
  add column subject_status public.calculated_subject_status,
  add column is_pass boolean,
  add column assessed_weight numeric(7,2)
    check (assessed_weight is null or assessed_weight >= 0),
  add column has_absence boolean not null default false,
  add column has_exemption boolean not null default false,
  add column subject_tie_size integer not null default 0
    check (subject_tie_size >= 0),
  add column subject_is_tied boolean not null default false;

create table public.report_snapshot_sources (
  snapshot_id uuid primary key
    references public.report_snapshots(id) on delete restrict,
  report_id uuid not null
    references public.reports(id) on delete restrict,
  calculation_run_id uuid not null
    references public.result_calculation_runs(id) on delete restrict,
  calculated_student_result_id uuid not null
    references public.calculated_student_results(id) on delete restrict,
  input_checksum text not null
    check (length(btrim(input_checksum)) = 64),
  output_checksum text not null
    check (length(btrim(output_checksum)) = 64),
  created_at timestamptz not null default now(),
  constraint report_snapshot_source_report_unique unique (report_id),
  constraint report_snapshot_source_run_student_unique
    unique (calculation_run_id, calculated_student_result_id)
);

comment on table public.report_snapshot_sources is
  'Immutable lineage from a report snapshot to one Stage 11 calculation result.';

create unique index report_batch_calculation_run_unique
  on public.report_batches (calculation_run_id)
  where calculation_run_id is not null;

create unique index report_calculation_run_enrollment_unique
  on public.reports (calculation_run_id, enrollment_id)
  where calculation_run_id is not null;

create unique index report_one_direct_successor_unique
  on public.reports (superseded_by)
  where superseded_by is not null;

create index report_batches_calculation_run_idx
  on public.report_batches (calculation_run_id, status);

create index reports_calculation_run_idx
  on public.reports (calculation_run_id, version);

create index report_snapshot_sources_run_idx
  on public.report_snapshot_sources (calculation_run_id, calculated_student_result_id);

create index report_subject_results_report_sort_idx
  on public.report_subject_results (report_id, sort_order, subject_id);

-- A report generated from a Stage 11 run does not require a PDF template yet.
-- Preserve the earlier report model's template scope check for legacy rows,
-- while validating every new calculation-run relationship at the database edge.
create or replace function internal.validate_report_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  term_school_id uuid;
  enrollment_year_id uuid;
  enrollment_class_id uuid;
  enrollment_grade_id uuid;
  batch_term_id uuid;
  batch_class_id uuid;
  template_school_id uuid;
  actor_school_id uuid;
  superseded_term_id uuid;
  superseded_enrollment_id uuid;
  run_term_id uuid;
  run_grade_id uuid;
  run_school_id uuid;
  calculated_enrollment_id uuid;
  calculated_grade_id uuid;
begin
  select terms.academic_year_id, academic_years.school_id
    into term_year_id, term_school_id
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  select enrollment.academic_year_id, enrollment.class_section_id,
         section.grade_level_id
    into enrollment_year_id, enrollment_class_id, enrollment_grade_id
  from public.enrollments enrollment
  join public.class_sections section on section.id = enrollment.class_section_id
  where enrollment.id = new.enrollment_id;

  select term_id, class_section_id
    into batch_term_id, batch_class_id
  from public.report_batches where id = new.batch_id;

  if new.template_id is not null then
    select school_id into template_school_id
    from public.report_templates where id = new.template_id;
  end if;

  if new.created_by is not null then
    select school_id into actor_school_id
    from public.school_staff_memberships where id = new.created_by;
  end if;

  if new.superseded_by is not null then
    select term_id, enrollment_id
      into superseded_term_id, superseded_enrollment_id
    from public.reports where id = new.superseded_by;
  end if;

  if new.calculation_run_id is not null then
    select run.term_id, run.grade_level_id, academic_years.school_id
      into run_term_id, run_grade_id, run_school_id
    from public.result_calculation_runs run
    join public.terms on terms.id = run.term_id
    join public.academic_years on academic_years.id = terms.academic_year_id
    where run.id = new.calculation_run_id;

    select calculated.enrollment_id, section.grade_level_id
      into calculated_enrollment_id, calculated_grade_id
    from public.calculated_student_results calculated
    join public.class_sections section on section.id = calculated.class_section_id
    where calculated.calculation_run_id = new.calculation_run_id
      and calculated.enrollment_id = new.enrollment_id;
  end if;

  if enrollment_year_id is distinct from term_year_id
     or batch_term_id is distinct from new.term_id
     or (batch_class_id is not null and batch_class_id is distinct from enrollment_class_id)
     or (new.template_id is not null and template_school_id is distinct from term_school_id)
     or (new.created_by is not null and actor_school_id is distinct from term_school_id)
     or (
       new.superseded_by is not null
       and (
         superseded_term_id is distinct from new.term_id
         or superseded_enrollment_id is distinct from new.enrollment_id
       )
     )
     or (
       new.calculation_run_id is not null
       and (
         run_term_id is distinct from new.term_id
         or calculated_enrollment_id is distinct from new.enrollment_id
         or calculated_grade_id is distinct from run_grade_id
         or run_school_id is distinct from term_school_id
       )
     ) then
    raise exception 'Report references must share one student, school, and academic scope.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

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
     and (to_jsonb(new) - array['superseded_by', 'updated_at']::text[])
         = (to_jsonb(old) - array['superseded_by', 'updated_at']::text[]) then
    return new;
  end if;

  if old.calculation_run_id is not null then
    raise exception 'Generated reports are immutable and cannot be %.'
      , lower(tg_op) using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function internal.prevent_generated_subject_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.reports report
    where report.id = coalesce(new.report_id, old.report_id)
      and report.calculation_run_id is not null
  ) then
    raise exception 'Generated report subject rows are immutable and cannot be %.'
      , lower(tg_op) using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists reports_generated_prevent_mutation on public.reports;
create trigger reports_generated_prevent_mutation
before update or delete on public.reports
for each row execute function internal.prevent_generated_report_mutation();

drop trigger if exists report_subject_results_generated_prevent_mutation
  on public.report_subject_results;
create trigger report_subject_results_generated_prevent_mutation
before update or delete on public.report_subject_results
for each row execute function internal.prevent_generated_subject_mutation();

create trigger report_snapshot_sources_prevent_mutation
before update or delete on public.report_snapshot_sources
for each row execute function internal.prevent_mutation();

create or replace function internal.validate_report_batch_calculation_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  run_term_id uuid;
  run_school_id uuid;
  batch_school_id uuid;
begin
  if new.calculation_run_id is null then return new; end if;
  select run.term_id, academic_years.school_id into run_term_id, run_school_id
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years on academic_years.id = term.academic_year_id
  where run.id = new.calculation_run_id;
  select academic_years.school_id into batch_school_id
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;
  if run_term_id is distinct from new.term_id
     or run_school_id is distinct from batch_school_id then
    raise exception 'Report batch calculation references must share one school and term.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger report_batches_validate_calculation_scope
before insert or update on public.report_batches
for each row execute function internal.validate_report_batch_calculation_scope();

create or replace function internal.validate_report_snapshot_source_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  snapshot_report_id uuid;
  snapshot_source_checksum text;
  report_run_id uuid;
  report_enrollment_id uuid;
  result_run_id uuid;
  result_enrollment_id uuid;
  run_input_checksum text;
  run_output_checksum text;
begin
  select snapshot.report_id into snapshot_report_id
  from public.report_snapshots snapshot where snapshot.id = new.snapshot_id;
  select snapshot.source_checksum into snapshot_source_checksum
  from public.report_snapshots snapshot where snapshot.id = new.snapshot_id;
  select report.calculation_run_id, report.enrollment_id into report_run_id, report_enrollment_id
  from public.reports report where report.id = new.report_id;
  select result.calculation_run_id, result.enrollment_id into result_run_id, result_enrollment_id
  from public.calculated_student_results result where result.id = new.calculated_student_result_id;
  select run.input_checksum, run.output_checksum into run_input_checksum, run_output_checksum
  from public.result_calculation_runs run where run.id = new.calculation_run_id;
  if snapshot_report_id is distinct from new.report_id
     or report_run_id is distinct from new.calculation_run_id
     or result_run_id is distinct from new.calculation_run_id
     or result_enrollment_id is distinct from report_enrollment_id
     or snapshot_source_checksum is distinct from new.input_checksum
     or new.input_checksum is distinct from run_input_checksum
     or new.output_checksum is distinct from run_output_checksum then
    raise exception 'Report snapshot lineage references do not match the immutable source.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger report_snapshot_sources_validate_scope
before insert or update on public.report_snapshot_sources
for each row execute function internal.validate_report_snapshot_source_scope();

alter table public.report_snapshot_sources enable row level security;
alter table public.report_snapshot_sources force row level security;
revoke all privileges on table public.report_snapshot_sources from public, anon, authenticated;

-- Snapshot payloads are schoolwide staff review data. Assigned-teacher
-- report permissions do not grant direct access to every completed snapshot.
drop policy if exists report_snapshots_select_authorized on public.report_snapshots;
create policy report_snapshots_select_authorized
on public.report_snapshots for select to authenticated
using (
  exists (
    select 1
    from public.reports report
    join public.terms term on term.id = report.term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where report.id = report_snapshots.report_id
      and (
        internal.current_user_has_permission(academic_year.school_id, 'REPORTS_VIEW_ALL')
        or internal.current_user_has_permission(academic_year.school_id, 'REPORTS_GENERATE')
      )
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
    join public.terms term on term.id = report.term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where report.id = report_subject_results.report_id
      and (
        internal.current_user_has_permission(academic_year.school_id, 'REPORTS_VIEW_ALL')
        or internal.current_user_has_permission(academic_year.school_id, 'REPORTS_GENERATE')
      )
  )
);

create policy report_snapshot_sources_select_authorized
on public.report_snapshot_sources for select to authenticated
using (
  exists (
    select 1
    from public.reports report
    join public.terms term on term.id = report.term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where report.id = report_snapshot_sources.report_id
      and (
        internal.current_user_has_permission(academic_year.school_id, 'REPORTS_VIEW_ALL')
        or internal.current_user_has_permission(academic_year.school_id, 'REPORTS_GENERATE')
      )
  )
);

-- The internal helper is called only by the two guarded public RPCs below.
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
  run_row public.result_calculation_runs%rowtype;
  term_row public.terms%rowtype;
  year_row public.academic_years%rowtype;
  grade_row public.grade_levels%rowtype;
begin
  -- Match Stage 11's assignment -> term -> year -> grade -> source scope
  -- lock order before taking the calculation-run row lock. This prevents a
  -- report request from deadlocking with a newer calculation run.
  select run.term_id, run.grade_level_id
    into run_row.term_id, run_row.grade_level_id
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where run.id = target_calculation_run_id
    and year.school_id = target_school_id;
  if not found then
    raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform assignment.id
  from public.teaching_assignments assignment
  where assignment.term_id = run_row.term_id
  order by assignment.id
  for update;

  select term.* into term_row
  from public.terms term
  where term.id = run_row.term_id
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
  where grade.id = run_row.grade_level_id
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

  select run.* into run_row
  from public.result_calculation_runs run
  where run.id = target_calculation_run_id
  for update;
  if not found then
    raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001';
  end if;
  return run_row;
end;
$$;

-- The internal helper is called only by the two guarded public RPCs below.
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
  snapshot_hash text;
  subject_canonical text;
  new_report_id uuid;
  new_snapshot_id uuid;
  next_version integer;
  class_teacher_name text;
  head_teacher_name text;
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

  select term.* into current_term from public.terms term
  where term.id = run_row.term_id for update;
  select year.* into current_year from public.academic_years year
  where year.id = current_term.academic_year_id for update;
  select school.* into school_row from public.schools school
  where school.id = actor_school_id for update;
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

  select profile.first_name || ' ' || coalesce(profile.middle_name || ' ', '') || profile.last_name
    into class_teacher_name
  from public.class_teacher_assignments assignment
  join public.school_staff_memberships membership
    on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  where assignment.term_id = run_row.term_id
    and assignment.class_section_id = result_row.class_section_id
    and assignment.is_active
  order by assignment.is_primary desc, assignment.id
  limit 1;

  if comment_row.updated_by is not null then
    select profile.first_name || ' ' || coalesce(profile.middle_name || ' ', '') || profile.last_name
      into head_teacher_name
    from public.school_staff_memberships membership
    join public.profiles profile on profile.id = membership.profile_id
    where membership.id = comment_row.updated_by;
  end if;

  select setting.setting_value ->> 'value'
    into school_motto
  from public.school_settings setting
  where setting.school_id = actor_school_id and setting.setting_key = 'motto';
  select setting.setting_value ->> 'value'
    into school_website
  from public.school_settings setting
  where setting.school_id = actor_school_id and setting.setting_key = 'website';

  select term.* into next_term
  from public.terms term
  where term.academic_year_id = current_year.id
    and term.term_number > current_term.term_number
  order by term.term_number
  limit 1;

  -- The calculation's subject scope and order are immutable in Stage 11's
  -- source manifest. Live subject rows are locked before their display values
  -- are read and are copied into the report subject rows below.
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

  perform subject.id
  from public.subjects subject
  join public.calculated_subject_results calculated
    on calculated.subject_id = subject.id
   and calculated.calculation_run_id = run_row.id
   and calculated.enrollment_id = target_enrollment_id
  order by subject.id
  for update;

  select string_agg(
    concat_ws('|', subject.id, subject.code, subject.name, source.curriculum_sort_order,
      calculated.subject_status::text, coalesce(calculated.subject_score::text, ''),
      coalesce(calculated.grade, ''), coalesce(calculated.aggregate_points::text, ''),
      coalesce(calculated.is_pass::text, ''), calculated.assessed_weight,
      calculated.has_absence, calculated.has_exemption,
      coalesce(calculated.subject_position::text, ''), calculated.subject_tie_size,
      calculated.subject_is_tied),
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
      'id', school_row.id,
      'name', school_row.name,
      'school_code', school_row.school_code,
      'address', school_row.address,
      'phone', school_row.phone,
      'email', school_row.email,
      'timezone', school_row.timezone,
      'logo_storage_path', school_row.logo_storage_path,
      'motto', school_motto,
      'website', school_website
    ),
    'student', jsonb_build_object(
      'id', student_row.id,
      'admission_number', student_row.admission_number,
      'display_name', concat_ws(' ', student_row.first_name, student_row.middle_name, student_row.last_name),
      'gender', student_row.gender,
      'date_of_birth', student_row.date_of_birth,
      'photo_storage_path', student_row.photo_storage_path
    ),
    'academic_period', jsonb_build_object(
      'academic_year_id', current_year.id,
      'academic_year_name', current_year.name,
      'term_id', current_term.id,
      'term_name', current_term.name,
      'term_number', current_term.term_number
    ),
    'placement', jsonb_build_object(
      'enrollment_id', enrollment_row.id,
      'enrollment_status', enrollment_row.status,
      'class_section_id', section_row.id,
      'class_name', section_row.name,
      'class_code', section_row.class_code,
      'grade_level_id', grade_row.id,
      'grade_code', grade_row.code,
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
    'attendance', case when attendance_row.id is null then null else jsonb_build_object(
      'days_open', attendance_row.days_open,
      'days_present', attendance_row.days_present,
      'days_absent', attendance_row.days_absent,
      'times_late', attendance_row.times_late
    ) end,
    'comments', case when comment_row.id is null then null else jsonb_build_object(
      'class_teacher_comment', comment_row.class_teacher_comment,
      'head_teacher_comment', comment_row.head_teacher_comment,
      'conduct_grade', comment_row.conduct_grade
    ) end,
    'signatories', jsonb_build_object(
      'class_teacher', case when class_teacher_name is null then null else jsonb_build_object('display_name', class_teacher_name, 'role_context', 'Class teacher') end,
      'head_teacher', case when head_teacher_name is null then null else jsonb_build_object('display_name', head_teacher_name, 'role_context', 'Head teacher') end
    ),
    'next_term', case when next_term.id is null then null else jsonb_build_object(
      'term_id', next_term.id,
      'term_name', next_term.name,
      'term_number', next_term.term_number,
      'starts_on', next_term.starts_on
    ) end
  );

  select report.* into existing_report
  from public.reports report
  where report.calculation_run_id = run_row.id
    and report.enrollment_id = target_enrollment_id
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

  next_version := coalesce(previous_report.version, 0) + 1;
  snapshot_hash := encode(extensions.digest(
    concat_ws(':', 'report-snapshot-v1', next_version, run_row.id,
      run_row.input_checksum, run_row.output_checksum,
      snapshot_payload::text, coalesce(subject_canonical, '')),
    'sha256'), 'hex');

  insert into public.reports(
    batch_id, term_id, enrollment_id, template_id, calculation_run_id,
    version, status, generated_at, created_by
  ) values (
    target_batch_id, run_row.term_id, target_enrollment_id, null, run_row.id,
    next_version, 'GENERATED', now(), actor_membership_id
  ) returning id into new_report_id;

  insert into public.report_snapshots(
    report_id, snapshot_version, snapshot_data, source_checksum,
    snapshot_schema_version, snapshot_checksum
  ) values (
    new_report_id, 1, snapshot_payload, run_row.input_checksum, 1, snapshot_hash
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
    calculated.assessed_weight, calculated.has_absence, calculated.has_exemption,
    calculated.subject_tie_size, calculated.subject_is_tied, null,
    source.curriculum_sort_order
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
      'snapshot_checksum', snapshot_hash,
      'supersedes_report_id', previous_report.id
    )
  );

  return query select new_report_id, next_version, new_snapshot_id, false,
    previous_report.id;
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
  target_term_id uuid;
  run_row public.result_calculation_runs%rowtype;
  batch_id uuid;
  student_count integer;
  result record;
  inserted_batch boolean := false;
begin
  select * into actor from internal.lock_and_require_results_authority();
  perform pg_advisory_xact_lock(hashtextextended(target_calculation_run_id::text, 11012));

  select * into run_row
  from internal.lock_report_source_scope(target_calculation_run_id, actor.school_id);
  target_term_id := run_row.term_id;

  select count(*)::integer into student_count
  from public.calculated_student_results
  where calculation_run_id = target_calculation_run_id;

  insert into public.report_batches(
    term_id, calculation_run_id, requested_by, status, total_reports,
    started_at
  ) values (
    target_term_id, target_calculation_run_id, actor.membership_id,
    'PROCESSING', student_count, now()
  ) on conflict (calculation_run_id) do nothing
  returning id into batch_id;
  inserted_batch := batch_id is not null;
  if batch_id is null then
    select batch.id into batch_id from public.report_batches batch
    where batch.calculation_run_id = target_calculation_run_id for update;
  end if;

  if inserted_batch then
    perform internal.record_configuration_audit(
      actor.profile_id, actor.membership_id, actor.school_id,
      'REPORT_SNAPSHOT_BATCH_CREATED', 'report_batch', batch_id, null,
      jsonb_build_object(
        'calculation_run_id', target_calculation_run_id,
        'student_count', student_count
      )
    );
  end if;

  select * into result from internal.generate_student_report_snapshot(
    batch_id, target_calculation_run_id, target_enrollment_id,
    actor.profile_id, actor.membership_id, actor.school_id
  );

  update public.report_batches batch
  set completed_reports = (
        select count(*)::integer from public.reports report
        where report.batch_id = batch.id
      ),
      status = case when (
        select count(*) from public.reports report where report.batch_id = batch.id
      ) >= batch.total_reports then 'COMPLETED' else 'PROCESSING' end,
      completed_at = case when (
        select count(*) from public.reports report where report.batch_id = batch.id
      ) >= batch.total_reports then coalesce(batch.completed_at, now()) else null end
  where batch.id = batch_id;

  return query select result.report_id, result.report_version, result.snapshot_id,
    result.reused, result.supersedes_report_id;
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
  perform pg_advisory_xact_lock(hashtextextended(target_calculation_run_id::text, 11012));

  select * into run_row
  from internal.lock_report_source_scope(target_calculation_run_id, actor.school_id);

  select count(*)::integer into student_count
  from public.calculated_student_results
  where calculation_run_id = run_row.id;
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
    select batch.* into batch_row from public.report_batches batch
    where batch.calculation_run_id = run_row.id for update;
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
    if generated_result.reused then reused := reused + 1; else generated := generated + 1; end if;
  end loop;

  update public.report_batches
  set completed_reports = student_count,
      failed_reports = 0,
      status = 'COMPLETED',
      completed_at = coalesce(completed_at, now())
  where id = batch_row.id;

  return query select batch_row.id, generated, reused, 0;
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
declare actor record; run_row public.result_calculation_runs%rowtype;
  scope_school_id uuid; population bigint; existing bigint; missing bigint;
begin
  select * into actor from internal.require_results_reader();
  select run.* into run_row
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where run.id = target_calculation_run_id and year.school_id = actor.school_id;
  if not found then raise exception 'REPORT_SOURCE_NOT_FOUND' using errcode = 'P0001'; end if;
  select academic_years.school_id into scope_school_id
  from public.terms join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = run_row.term_id;
  select count(*) into population from public.calculated_student_results
  where calculation_run_id = run_row.id;
  select count(distinct report.enrollment_id) into existing
  from public.reports report
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.calculation_run_id = run_row.id;
  missing := population - existing;
  return query
  select run_row.id, run_row.version, term.id, term.name, year.name,
    grade.id, grade.name, population, population, existing, missing,
    coalesce((select jsonb_object_agg(history.enrollment_id::text, history.version)
      from (
        select report.enrollment_id, max(report.version) version
        from public.reports report where report.term_id = run_row.term_id
        group by report.enrollment_id
      ) history), '{}'::jsonb),
    run_row.input_checksum, run_row.output_checksum,
    population > 0 and missing = 0
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  join public.grade_levels grade on grade.id = run_row.grade_level_id
  where term.id = run_row.term_id and year.school_id = scope_school_id;
end;
$$;

create or replace function public.list_generated_reports(
  target_calculation_run_id uuid default null
)
returns table(
  report_id uuid,
  enrollment_id uuid,
  student_name text,
  admission_number text,
  academic_year_name text,
  term_name text,
  term_number smallint,
  grade_name text,
  class_name text,
  calculation_run_id uuid,
  calculation_version integer,
  report_version integer,
  status public.report_status,
  created_at timestamptz,
  snapshot_checksum text,
  superseded_by uuid,
  is_latest boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader();
  return query
  select report.id, report.enrollment_id,
    snapshot.snapshot_data #>> '{student,display_name}',
    snapshot.snapshot_data #>> '{student,admission_number}',
    snapshot.snapshot_data #>> '{academic_period,academic_year_name}',
    snapshot.snapshot_data #>> '{academic_period,term_name}',
    (snapshot.snapshot_data #>> '{academic_period,term_number}')::smallint,
    snapshot.snapshot_data #>> '{placement,grade_name}',
    snapshot.snapshot_data #>> '{placement,class_name}',
    report.calculation_run_id, run.version, report.version, report.status,
    report.created_at, snapshot.snapshot_checksum, report.superseded_by,
    report.superseded_by is null
  from public.reports report
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  join public.result_calculation_runs run on run.id = report.calculation_run_id
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where year.school_id = actor.school_id
    and (target_calculation_run_id is null or report.calculation_run_id = target_calculation_run_id)
  order by report.created_at desc, report.enrollment_id, report.version desc;
end;
$$;

create or replace function public.get_generated_report(target_report_id uuid)
returns table(
  report_id uuid,
  enrollment_id uuid,
  calculation_run_id uuid,
  calculation_version integer,
  report_version integer,
  status public.report_status,
  created_at timestamptz,
  superseded_by uuid,
  snapshot_id uuid,
  snapshot_schema_version integer,
  snapshot_data jsonb,
  snapshot_checksum text,
  input_checksum text,
  output_checksum text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader();
  return query
  select report.id, report.enrollment_id, report.calculation_run_id,
    run.version, report.version, report.status, report.created_at,
    report.superseded_by, snapshot.id, snapshot.snapshot_schema_version,
    snapshot.snapshot_data, snapshot.snapshot_checksum,
    source.input_checksum, source.output_checksum
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.result_calculation_runs run on run.id = report.calculation_run_id
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  join public.report_snapshot_sources source on source.snapshot_id = snapshot.id
  where report.id = target_report_id and year.school_id = actor.school_id;
end;
$$;

create or replace function public.get_report_snapshot(target_report_id uuid)
returns table(
  report_id uuid,
  snapshot_id uuid,
  snapshot_schema_version integer,
  snapshot_data jsonb,
  snapshot_checksum text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader();
  return query
  select report.id, snapshot.id, snapshot.snapshot_schema_version,
    snapshot.snapshot_data, snapshot.snapshot_checksum
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.id = target_report_id and year.school_id = actor.school_id;
end;
$$;

create or replace function public.get_report_subject_results(target_report_id uuid)
returns table(
  report_id uuid,
  subject_id uuid,
  subject_code text,
  subject_name text,
  subject_score numeric,
  grade text,
  aggregate_points integer,
  subject_position integer,
  subject_status public.calculated_subject_status,
  is_pass boolean,
  assessed_weight numeric,
  has_absence boolean,
  has_exemption boolean,
  subject_tie_size integer,
  subject_is_tied boolean,
  teacher_comment text,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader();
  return query
  select result.report_id, result.subject_id, result.subject_code,
    result.subject_name, result.subject_score, result.grade,
    result.aggregate_points, result.subject_position, result.subject_status,
    result.is_pass, result.assessed_weight, result.has_absence,
    result.has_exemption, result.subject_tie_size, result.subject_is_tied,
    result.teacher_comment, result.sort_order
  from public.report_subject_results result
  join public.reports report on report.id = result.report_id
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where result.report_id = target_report_id and year.school_id = actor.school_id
  order by result.sort_order, result.subject_id;
end;
$$;

create or replace function public.get_student_report_history(
  target_enrollment_id uuid,
  target_term_id uuid
)
returns table(
  report_id uuid,
  calculation_run_id uuid,
  calculation_version integer,
  report_version integer,
  generated_at timestamptz,
  snapshot_checksum text,
  superseded_by uuid,
  status public.report_status,
  is_latest boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader();
  return query
  select report.id, report.calculation_run_id, run.version, report.version,
    report.generated_at, snapshot.snapshot_checksum, report.superseded_by,
    report.status, report.superseded_by is null
  from public.reports report
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.result_calculation_runs run on run.id = report.calculation_run_id
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.enrollment_id = target_enrollment_id
    and report.term_id = target_term_id
    and year.school_id = actor.school_id
  order by report.version;
end;
$$;

revoke all on function internal.lock_report_source_scope(uuid, uuid),
  internal.generate_student_report_snapshot(
  uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

revoke execute on function public.generate_student_report_snapshot(uuid, uuid),
  public.generate_grade_report_snapshots(uuid),
  public.get_report_generation_readiness(uuid),
  public.list_generated_reports(uuid),
  public.get_generated_report(uuid),
  public.get_report_snapshot(uuid),
  public.get_report_subject_results(uuid),
  public.get_student_report_history(uuid, uuid)
  from public, anon;

grant execute on function public.generate_student_report_snapshot(uuid, uuid),
  public.generate_grade_report_snapshots(uuid),
  public.get_report_generation_readiness(uuid),
  public.list_generated_reports(uuid),
  public.get_generated_report(uuid),
  public.get_report_snapshot(uuid),
  public.get_report_subject_results(uuid),
  public.get_student_report_history(uuid, uuid)
  to authenticated;
