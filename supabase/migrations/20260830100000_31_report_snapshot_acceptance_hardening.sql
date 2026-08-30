-- Stage 12 acceptance correction: assigned class teachers may read only the
-- report rows covered by their selected membership and class assignment.
-- Generation remains restricted to REPORTS_GENERATE.

-- A valid run in another school is an authorization failure, not a missing
-- source. Keep that distinction at the generation boundary so cross-school
-- callers cannot receive a misleading source-not-found result. The wrapper
-- still delegates to Migration 30's finalized-source lock and validation.
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
  if exists (
    select 1
    from public.result_calculation_runs run
    join public.terms term on term.id = run.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where run.id = target_calculation_run_id
      and year.school_id <> target_school_id
  ) then
    raise exception 'REPORT_GENERATION_FORBIDDEN' using errcode = '42501';
  end if;
  select * into result_row
  from internal.lock_and_require_current_report_calculation_source(
    target_calculation_run_id, target_school_id
  );
  return result_row;
end;
$$;

create or replace function internal.current_user_can_read_report(
  target_term_id uuid,
  target_class_section_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select exists (
    select 1
    from internal.staff_session_active_memberships selection
    join public.school_staff_memberships membership
      on membership.id = selection.membership_id
     and membership.profile_id = selection.profile_id
    join public.schools school on school.id = membership.school_id
    join public.terms term on term.id = target_term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
     and academic_year.school_id = membership.school_id
    join public.staff_role_assignments assignment
      on assignment.membership_id = membership.id
     and assignment.granted_at <= now()
     and assignment.revoked_at is null
    join public.role_permissions permission on permission.role = assignment.role
    where auth.uid() is not null
      and selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
      and membership.status = 'ACTIVE'
      and school.is_active
      and permission.permission in ('REPORTS_VIEW_ALL', 'REPORTS_GENERATE')
  )
  or exists (
    select 1
    from internal.staff_session_active_memberships selection
    join public.school_staff_memberships membership
      on membership.id = selection.membership_id
     and membership.profile_id = selection.profile_id
    join public.schools school on school.id = membership.school_id
    join public.terms term on term.id = target_term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
     and academic_year.school_id = membership.school_id
    join public.staff_role_assignments role_assignment
      on role_assignment.membership_id = membership.id
     and role_assignment.granted_at <= now()
     and role_assignment.revoked_at is null
    join public.role_permissions permission
      on permission.role = role_assignment.role
     and permission.permission = 'REPORTS_VIEW_ASSIGNED'
    join public.class_teacher_assignments class_assignment
      on class_assignment.staff_membership_id = membership.id
     and class_assignment.term_id = target_term_id
     and class_assignment.class_section_id = target_class_section_id
     and class_assignment.is_active
     and current_date >= class_assignment.starts_on
     and (class_assignment.ends_on is null or current_date <= class_assignment.ends_on)
    where auth.uid() is not null
      and selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
      and membership.status = 'ACTIVE'
      and school.is_active
  );
$$;

create or replace function internal.current_report_reader()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select membership.profile_id, membership.id, membership.school_id
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id
   and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  join public.staff_role_assignments assignment
    on assignment.membership_id = membership.id
   and assignment.granted_at <= now()
   and assignment.revoked_at is null
  join public.role_permissions permission on permission.role = assignment.role
  where auth.uid() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE'
    and school.is_active
    and permission.permission in (
      'REPORTS_VIEW_ALL', 'REPORTS_GENERATE', 'REPORTS_VIEW_ASSIGNED'
    );
$$;

create or replace function internal.require_report_reader()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query select * from internal.current_report_reader();
  if not found then
    raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.list_generated_reports(
  target_calculation_run_id uuid default null
)
returns table(
  report_id uuid, enrollment_id uuid, student_name text, admission_number text,
  academic_year_name text, term_name text, term_number smallint,
  grade_name text, class_name text, calculation_run_id uuid,
  calculation_version integer, report_version integer, status public.report_status,
  created_at timestamptz, snapshot_checksum text, superseded_by uuid,
  is_latest boolean
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_report_reader();
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
  join public.enrollments enrollment on enrollment.id = report.enrollment_id
  join public.class_sections section on section.id = enrollment.class_section_id
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  join public.result_calculation_runs run on run.id = report.calculation_run_id
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where year.school_id = actor.school_id
    and (target_calculation_run_id is null or report.calculation_run_id = target_calculation_run_id)
    and internal.current_user_can_read_report(report.term_id, section.id)
  order by report.created_at desc, report.enrollment_id, report.version desc;
end;
$$;

create or replace function public.get_generated_report(target_report_id uuid)
returns table(
  report_id uuid, enrollment_id uuid, calculation_run_id uuid,
  calculation_version integer, report_version integer, status public.report_status,
  created_at timestamptz, superseded_by uuid, snapshot_id uuid,
  snapshot_schema_version integer, snapshot_data jsonb, snapshot_checksum text,
  input_checksum text, output_checksum text
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_report_reader();
  return query
  select report.id, report.enrollment_id, report.calculation_run_id,
    run.version, report.version, report.status, report.created_at,
    report.superseded_by, snapshot.id, snapshot.snapshot_schema_version,
    snapshot.snapshot_data, snapshot.snapshot_checksum,
    source.input_checksum, source.output_checksum
  from public.reports report
  join public.enrollments enrollment on enrollment.id = report.enrollment_id
  join public.class_sections section on section.id = enrollment.class_section_id
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.result_calculation_runs run on run.id = report.calculation_run_id
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  join public.report_snapshot_sources source on source.snapshot_id = snapshot.id
  where report.id = target_report_id
    and year.school_id = actor.school_id
    and internal.current_user_can_read_report(report.term_id, section.id);
end;
$$;

create or replace function public.get_report_snapshot(target_report_id uuid)
returns table(
  report_id uuid, snapshot_id uuid, snapshot_schema_version integer,
  snapshot_data jsonb, snapshot_checksum text
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_report_reader();
  return query
  select report.id, snapshot.id, snapshot.snapshot_schema_version,
    snapshot.snapshot_data, snapshot.snapshot_checksum
  from public.reports report
  join public.enrollments enrollment on enrollment.id = report.enrollment_id
  join public.class_sections section on section.id = enrollment.class_section_id
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.id = target_report_id
    and year.school_id = actor.school_id
    and internal.current_user_can_read_report(report.term_id, section.id);
end;
$$;

create or replace function public.get_report_subject_results(target_report_id uuid)
returns table(
  report_id uuid, subject_id uuid, subject_code text, subject_name text,
  subject_score numeric, grade text, aggregate_points integer,
  subject_position integer, subject_status public.calculated_subject_status,
  is_pass boolean, assessed_weight numeric, has_absence boolean,
  has_exemption boolean, subject_tie_size integer, subject_is_tied boolean,
  teacher_comment text, sort_order integer
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_report_reader();
  return query
  select result.report_id, result.subject_id, result.subject_code,
    result.subject_name, result.subject_score, result.grade,
    result.aggregate_points, result.subject_position, result.subject_status,
    result.is_pass, result.assessed_weight, result.has_absence,
    result.has_exemption, result.subject_tie_size, result.subject_is_tied,
    result.teacher_comment, result.sort_order
  from public.report_subject_results result
  join public.reports report on report.id = result.report_id
  join public.enrollments enrollment on enrollment.id = report.enrollment_id
  join public.class_sections section on section.id = enrollment.class_section_id
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where result.report_id = target_report_id
    and year.school_id = actor.school_id
    and internal.current_user_can_read_report(report.term_id, section.id)
  order by result.sort_order, result.subject_id;
end;
$$;

create or replace function public.get_student_report_history(
  target_enrollment_id uuid,
  target_term_id uuid
)
returns table(
  report_id uuid, calculation_run_id uuid, calculation_version integer,
  report_version integer, generated_at timestamptz, snapshot_checksum text,
  superseded_by uuid, status public.report_status, is_latest boolean
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_report_reader();
  return query
  select report.id, report.calculation_run_id, run.version, report.version,
    report.generated_at, snapshot.snapshot_checksum, report.superseded_by,
    report.status, report.superseded_by is null
  from public.reports report
  join public.enrollments enrollment on enrollment.id = report.enrollment_id
  join public.class_sections section on section.id = enrollment.class_section_id
  join public.terms term on term.id = report.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.result_calculation_runs run on run.id = report.calculation_run_id
  join public.report_snapshots snapshot on snapshot.report_id = report.id
  where report.enrollment_id = target_enrollment_id
    and report.term_id = target_term_id
    and year.school_id = actor.school_id
    and internal.current_user_can_read_report(report.term_id, section.id)
  order by report.version;
end;
$$;

revoke all on function internal.current_user_can_read_report(uuid, uuid),
  internal.current_report_reader(), internal.require_report_reader()
from public, anon, authenticated;

comment on function internal.current_user_can_read_report(uuid, uuid) is
  'Selected-membership report read guard: schoolwide readers see their school and assigned class teachers see only assigned sections.';
