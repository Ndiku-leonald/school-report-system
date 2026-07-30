create type public.app_permission as enum (
  'DASHBOARD_VIEW',
  'TEACHER_WORKSPACE_VIEW',
  'SCHOOL_SETTINGS_VIEW',
  'SCHOOL_SETTINGS_MANAGE',
  'STAFF_VIEW',
  'STAFF_MANAGE',
  'ACADEMIC_CONFIGURATION_VIEW',
  'ACADEMIC_CONFIGURATION_MANAGE',
  'STUDENTS_VIEW_ALL',
  'STUDENTS_VIEW_ASSIGNED',
  'STUDENTS_MANAGE',
  'ASSIGNMENTS_VIEW_ALL',
  'ASSIGNMENTS_VIEW_OWN',
  'ASSIGNMENTS_MANAGE',
  'MARKS_VIEW_ALL',
  'MARKS_VIEW_ASSIGNED',
  'MARKS_ENTER',
  'MARKS_SUBMIT',
  'MARKS_REVIEW',
  'MARKS_APPROVE',
  'MARKS_LOCK',
  'ATTENDANCE_VIEW_ALL',
  'ATTENDANCE_MANAGE_ASSIGNED',
  'COMMENTS_VIEW_ALL',
  'COMMENTS_MANAGE_ASSIGNED',
  'REPORTS_VIEW_ALL',
  'REPORTS_VIEW_ASSIGNED',
  'REPORTS_GENERATE',
  'REPORTS_REVIEW',
  'REPORTS_PUBLISH',
  'REPORTS_WITHDRAW',
  'ANALYTICS_VIEW',
  'PROMOTION_VIEW',
  'PROMOTION_CONFIRM',
  'AUDIT_VIEW'
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role public.staff_role not null,
  permission public.app_permission not null,
  created_at timestamptz not null default now(),
  constraint role_permissions_role_permission_unique unique (role, permission)
);

comment on table public.role_permissions is
  'Migration-controlled MVP role matrix. Browser reads and mutations are prohibited.';

alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
revoke all privileges on table public.role_permissions from anon, authenticated;

insert into public.role_permissions (role, permission)
select role_name, permission_name
from unnest(array['SUPER_ADMIN', 'SCHOOL_ADMIN']::public.staff_role[]) role_name
cross join unnest(enum_range(null::public.app_permission)) permission_name;

insert into public.role_permissions (role, permission)
select 'HEAD_TEACHER', permission_name
from unnest(array[
  'DASHBOARD_VIEW',
  'SCHOOL_SETTINGS_VIEW',
  'STAFF_VIEW',
  'ACADEMIC_CONFIGURATION_VIEW',
  'STUDENTS_VIEW_ALL',
  'ASSIGNMENTS_VIEW_ALL',
  'MARKS_VIEW_ALL',
  'MARKS_REVIEW',
  'MARKS_APPROVE',
  'MARKS_LOCK',
  'ATTENDANCE_VIEW_ALL',
  'COMMENTS_VIEW_ALL',
  'REPORTS_VIEW_ALL',
  'REPORTS_GENERATE',
  'REPORTS_REVIEW',
  'REPORTS_PUBLISH',
  'REPORTS_WITHDRAW',
  'ANALYTICS_VIEW',
  'PROMOTION_VIEW',
  'PROMOTION_CONFIRM',
  'AUDIT_VIEW'
]::public.app_permission[]) permission_name;

insert into public.role_permissions (role, permission)
select 'ACADEMIC_REGISTRAR', permission_name
from unnest(array[
  'DASHBOARD_VIEW',
  'ACADEMIC_CONFIGURATION_VIEW',
  'ACADEMIC_CONFIGURATION_MANAGE',
  'STUDENTS_VIEW_ALL',
  'STUDENTS_MANAGE',
  'ASSIGNMENTS_VIEW_ALL',
  'ASSIGNMENTS_MANAGE',
  'MARKS_VIEW_ALL',
  'MARKS_REVIEW',
  'MARKS_APPROVE',
  'ATTENDANCE_VIEW_ALL',
  'COMMENTS_VIEW_ALL',
  'REPORTS_VIEW_ALL',
  'REPORTS_GENERATE',
  'REPORTS_REVIEW',
  'ANALYTICS_VIEW',
  'PROMOTION_VIEW'
]::public.app_permission[]) permission_name;

insert into public.role_permissions (role, permission)
select 'CLASS_TEACHER', permission_name
from unnest(array[
  'TEACHER_WORKSPACE_VIEW',
  'ACADEMIC_CONFIGURATION_VIEW',
  'STUDENTS_VIEW_ASSIGNED',
  'ASSIGNMENTS_VIEW_OWN',
  'MARKS_VIEW_ASSIGNED',
  'ATTENDANCE_MANAGE_ASSIGNED',
  'COMMENTS_MANAGE_ASSIGNED',
  'REPORTS_VIEW_ASSIGNED'
]::public.app_permission[]) permission_name;

insert into public.role_permissions (role, permission)
select 'SUBJECT_TEACHER', permission_name
from unnest(array[
  'TEACHER_WORKSPACE_VIEW',
  'ACADEMIC_CONFIGURATION_VIEW',
  'STUDENTS_VIEW_ASSIGNED',
  'ASSIGNMENTS_VIEW_OWN',
  'MARKS_VIEW_ASSIGNED',
  'MARKS_ENTER',
  'MARKS_SUBMIT'
]::public.app_permission[]) permission_name;

create or replace function internal.current_user_has_active_membership(
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_staff_memberships membership
    join public.schools school on school.id = membership.school_id
    where membership.profile_id = auth.uid()
      and membership.school_id = target_school_id
      and membership.status = 'ACTIVE'
      and school.is_active
  );
$$;

create or replace function internal.current_user_has_permission(
  target_school_id uuid,
  requested_permission public.app_permission
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_staff_memberships membership
    join public.schools school on school.id = membership.school_id
    join public.staff_role_assignments assignment
      on assignment.membership_id = membership.id
      and assignment.revoked_at is null
    join public.role_permissions mapping on mapping.role = assignment.role
    where membership.profile_id = auth.uid()
      and membership.school_id = target_school_id
      and membership.status = 'ACTIVE'
      and school.is_active
      and mapping.permission = requested_permission
  );
$$;

create or replace function internal.current_user_has_any_permission(
  target_school_id uuid,
  requested_permissions public.app_permission[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from unnest(requested_permissions) requested_permission
    where internal.current_user_has_permission(
      target_school_id,
      requested_permission
    )
  );
$$;

create or replace function internal.current_user_owns_active_membership(
  target_membership_id uuid,
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_staff_memberships membership
    join public.schools school on school.id = membership.school_id
    where membership.id = target_membership_id
      and membership.profile_id = auth.uid()
      and membership.school_id = target_school_id
      and membership.status = 'ACTIVE'
      and school.is_active
  );
$$;

create or replace function internal.current_user_is_subject_teacher_assigned(
  target_term_id uuid,
  target_class_section_id uuid,
  target_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.teaching_assignments assignment
    join public.terms term on term.id = assignment.term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    join public.school_staff_memberships membership
      on membership.id = assignment.staff_membership_id
    join public.schools school on school.id = membership.school_id
    where assignment.term_id = target_term_id
      and assignment.class_section_id = target_class_section_id
      and assignment.subject_id = target_subject_id
      and assignment.is_active
      and current_date >= assignment.starts_on
      and (assignment.ends_on is null or current_date <= assignment.ends_on)
      and current_date between term.starts_on and term.ends_on
      and membership.profile_id = auth.uid()
      and membership.status = 'ACTIVE'
      and membership.school_id = academic_year.school_id
      and school.is_active
  );
$$;

create or replace function internal.current_user_is_class_teacher_assigned(
  target_term_id uuid,
  target_class_section_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.class_teacher_assignments assignment
    join public.terms term on term.id = assignment.term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    join public.school_staff_memberships membership
      on membership.id = assignment.staff_membership_id
    join public.schools school on school.id = membership.school_id
    where assignment.term_id = target_term_id
      and assignment.class_section_id = target_class_section_id
      and assignment.is_active
      and current_date >= assignment.starts_on
      and (assignment.ends_on is null or current_date <= assignment.ends_on)
      and current_date between term.starts_on and term.ends_on
      and membership.profile_id = auth.uid()
      and membership.status = 'ACTIVE'
      and membership.school_id = academic_year.school_id
      and school.is_active
  );
$$;

create or replace function internal.current_user_can_read_class_section(
  target_class_section_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.terms term
    where (
      internal.current_user_is_class_teacher_assigned(
        term.id,
        target_class_section_id
      )
      or exists (
        select 1
        from public.teaching_assignments assignment
        where assignment.term_id = term.id
          and assignment.class_section_id = target_class_section_id
          and internal.current_user_is_subject_teacher_assigned(
            assignment.term_id,
            assignment.class_section_id,
            assignment.subject_id
          )
      )
    )
  );
$$;

create or replace function public.get_my_effective_permissions(
  target_membership_id uuid
)
returns setof public.app_permission
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct mapping.permission
  from public.school_staff_memberships membership
  join public.schools school on school.id = membership.school_id
  join public.staff_role_assignments assignment
    on assignment.membership_id = membership.id
    and assignment.revoked_at is null
  join public.role_permissions mapping on mapping.role = assignment.role
  where auth.uid() is not null
    and membership.id = target_membership_id
    and membership.profile_id = auth.uid()
    and membership.status = 'ACTIVE'
    and school.is_active
  order by mapping.permission;
$$;

comment on function internal.current_user_has_active_membership(uuid) is
  'Definer rights avoid forced-RLS recursion; returns only a caller-scoped boolean.';
comment on function internal.current_user_has_permission(uuid, public.app_permission) is
  'Definer rights read the migration-owned role matrix behind forced RLS.';
comment on function internal.current_user_has_any_permission(uuid, public.app_permission[]) is
  'Caller-scoped permission predicate for RLS policies.';
comment on function internal.current_user_owns_active_membership(uuid, uuid) is
  'Caller-scoped membership predicate for assignment RLS.';
comment on function internal.current_user_is_subject_teacher_assigned(uuid, uuid, uuid) is
  'Caller-scoped, currently available subject assignment predicate.';
comment on function internal.current_user_is_class_teacher_assigned(uuid, uuid) is
  'Caller-scoped, currently available class assignment predicate.';
comment on function internal.current_user_can_read_class_section(uuid) is
  'Caller-scoped class visibility derived from current assignments.';
comment on function public.get_my_effective_permissions(uuid) is
  'Returns effective permissions only for the caller own active membership.';

revoke all on function internal.current_user_has_active_membership(uuid)
  from public, anon, authenticated;
revoke all on function internal.current_user_has_permission(
  uuid,
  public.app_permission
) from public, anon, authenticated;
revoke all on function internal.current_user_has_any_permission(
  uuid,
  public.app_permission[]
) from public, anon, authenticated;
revoke all on function internal.current_user_owns_active_membership(uuid, uuid)
  from public, anon, authenticated;
revoke all on function internal.current_user_is_subject_teacher_assigned(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function internal.current_user_is_class_teacher_assigned(
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function internal.current_user_can_read_class_section(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_effective_permissions(uuid)
  from public, anon, authenticated;

grant usage on schema internal to authenticated;
grant execute on function internal.current_user_has_active_membership(uuid)
  to authenticated;
grant execute on function internal.current_user_has_permission(
  uuid,
  public.app_permission
) to authenticated;
grant execute on function internal.current_user_has_any_permission(
  uuid,
  public.app_permission[]
) to authenticated;
grant execute on function internal.current_user_owns_active_membership(uuid, uuid)
  to authenticated;
grant execute on function internal.current_user_is_subject_teacher_assigned(
  uuid,
  uuid,
  uuid
) to authenticated;
grant execute on function internal.current_user_is_class_teacher_assigned(
  uuid,
  uuid
) to authenticated;
grant execute on function internal.current_user_can_read_class_section(uuid)
  to authenticated;
grant execute on function public.get_my_effective_permissions(uuid)
  to authenticated;

grant select on table
  public.academic_years,
  public.terms,
  public.grade_levels,
  public.class_sections,
  public.subjects,
  public.grade_level_subjects,
  public.assessment_schemes,
  public.assessment_components,
  public.grading_scales,
  public.grading_bands,
  public.ranking_rules,
  public.promotion_rules,
  public.teaching_assignments,
  public.class_teacher_assignments,
  public.students,
  public.enrollments,
  public.mark_sheets,
  public.marks,
  public.term_attendance,
  public.student_term_comments,
  public.reports,
  public.report_snapshots,
  public.report_subject_results,
  public.audit_logs
to authenticated;

create policy academic_years_select_authorized
on public.academic_years for select to authenticated
using (
  internal.current_user_has_permission(
    school_id,
    'ACADEMIC_CONFIGURATION_VIEW'
  )
);

create policy terms_select_authorized
on public.terms for select to authenticated
using (
  exists (
    select 1
    from public.academic_years academic_year
    where academic_year.id = terms.academic_year_id
      and internal.current_user_has_permission(
        academic_year.school_id,
        'ACADEMIC_CONFIGURATION_VIEW'
      )
  )
);

create policy grade_levels_select_authorized
on public.grade_levels for select to authenticated
using (
  internal.current_user_has_permission(
    school_id,
    'ACADEMIC_CONFIGURATION_VIEW'
  )
);

create policy class_sections_select_authorized
on public.class_sections for select to authenticated
using (
  exists (
    select 1
    from public.academic_years academic_year
    where academic_year.id = class_sections.academic_year_id
      and internal.current_user_has_permission(
        academic_year.school_id,
        'ACADEMIC_CONFIGURATION_VIEW'
      )
  )
);

create policy subjects_select_authorized
on public.subjects for select to authenticated
using (
  internal.current_user_has_permission(
    school_id,
    'ACADEMIC_CONFIGURATION_VIEW'
  )
);

create policy grade_level_subjects_select_authorized
on public.grade_level_subjects for select to authenticated
using (
  exists (
    select 1
    from public.grade_levels grade_level
    join public.subjects subject
      on subject.id = grade_level_subjects.subject_id
      and subject.school_id = grade_level.school_id
    where grade_level.id = grade_level_subjects.grade_level_id
      and internal.current_user_has_permission(
        grade_level.school_id,
        'ACADEMIC_CONFIGURATION_VIEW'
      )
  )
);

create policy assessment_schemes_select_authorized
on public.assessment_schemes for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where term.id = assessment_schemes.term_id
      and internal.current_user_has_permission(
        academic_year.school_id,
        'ACADEMIC_CONFIGURATION_VIEW'
      )
  )
);

create policy assessment_components_select_authorized
on public.assessment_components for select to authenticated
using (
  exists (
    select 1
    from public.assessment_schemes scheme
    join public.terms term on term.id = scheme.term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where scheme.id = assessment_components.assessment_scheme_id
      and internal.current_user_has_permission(
        academic_year.school_id,
        'ACADEMIC_CONFIGURATION_VIEW'
      )
  )
);

create policy grading_scales_select_authorized
on public.grading_scales for select to authenticated
using (
  internal.current_user_has_permission(
    school_id,
    'ACADEMIC_CONFIGURATION_VIEW'
  )
);

create policy grading_bands_select_authorized
on public.grading_bands for select to authenticated
using (
  exists (
    select 1
    from public.grading_scales scale
    where scale.id = grading_bands.grading_scale_id
      and internal.current_user_has_permission(
        scale.school_id,
        'ACADEMIC_CONFIGURATION_VIEW'
      )
  )
);

create policy ranking_rules_select_authorized
on public.ranking_rules for select to authenticated
using (
  internal.current_user_has_permission(
    school_id,
    'ACADEMIC_CONFIGURATION_VIEW'
  )
);

create policy promotion_rules_select_authorized
on public.promotion_rules for select to authenticated
using (
  internal.current_user_has_permission(
    school_id,
    'ACADEMIC_CONFIGURATION_VIEW'
  )
);

create policy teaching_assignments_select_authorized
on public.teaching_assignments for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where term.id = teaching_assignments.term_id
      and (
        internal.current_user_has_permission(
          academic_year.school_id,
          'ASSIGNMENTS_VIEW_ALL'
        )
        or (
          internal.current_user_has_permission(
            academic_year.school_id,
            'ASSIGNMENTS_VIEW_OWN'
          )
          and internal.current_user_owns_active_membership(
            teaching_assignments.staff_membership_id,
            academic_year.school_id
          )
          and internal.current_user_is_subject_teacher_assigned(
            teaching_assignments.term_id,
            teaching_assignments.class_section_id,
            teaching_assignments.subject_id
          )
        )
      )
  )
);

create policy class_teacher_assignments_select_authorized
on public.class_teacher_assignments for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where term.id = class_teacher_assignments.term_id
      and (
        internal.current_user_has_permission(
          academic_year.school_id,
          'ASSIGNMENTS_VIEW_ALL'
        )
        or (
          internal.current_user_has_permission(
            academic_year.school_id,
            'ASSIGNMENTS_VIEW_OWN'
          )
          and internal.current_user_owns_active_membership(
            class_teacher_assignments.staff_membership_id,
            academic_year.school_id
          )
          and internal.current_user_is_class_teacher_assigned(
            class_teacher_assignments.term_id,
            class_teacher_assignments.class_section_id
          )
        )
      )
  )
);

create policy students_select_authorized
on public.students for select to authenticated
using (
  internal.current_user_has_permission(school_id, 'STUDENTS_VIEW_ALL')
  or (
    internal.current_user_has_permission(school_id, 'STUDENTS_VIEW_ASSIGNED')
    and exists (
      select 1
      from public.enrollments enrollment
      where enrollment.student_id = students.id
        and enrollment.status in ('ACTIVE', 'REPEATING')
        and internal.current_user_can_read_class_section(
          enrollment.class_section_id
        )
    )
  )
);

create policy enrollments_select_authorized
on public.enrollments for select to authenticated
using (
  exists (
    select 1
    from public.academic_years academic_year
    where academic_year.id = enrollments.academic_year_id
      and (
        internal.current_user_has_permission(
          academic_year.school_id,
          'STUDENTS_VIEW_ALL'
        )
        or (
          internal.current_user_has_permission(
            academic_year.school_id,
            'STUDENTS_VIEW_ASSIGNED'
          )
          and internal.current_user_can_read_class_section(
            enrollments.class_section_id
          )
        )
      )
  )
);

create policy mark_sheets_select_authorized
on public.mark_sheets for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where term.id = mark_sheets.term_id
      and (
        internal.current_user_has_permission(
          academic_year.school_id,
          'MARKS_VIEW_ALL'
        )
        or (
          internal.current_user_has_permission(
            academic_year.school_id,
            'MARKS_VIEW_ASSIGNED'
          )
          and (
            internal.current_user_is_subject_teacher_assigned(
              mark_sheets.term_id,
              mark_sheets.class_section_id,
              mark_sheets.subject_id
            )
            or internal.current_user_is_class_teacher_assigned(
              mark_sheets.term_id,
              mark_sheets.class_section_id
            )
          )
        )
      )
  )
);

create policy marks_select_authorized
on public.marks for select to authenticated
using (
  exists (
    select 1
    from public.mark_sheets mark_sheet
    where mark_sheet.id = marks.mark_sheet_id
  )
);

create policy term_attendance_select_authorized
on public.term_attendance for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    join public.enrollments enrollment
      on enrollment.id = term_attendance.enrollment_id
    where term.id = term_attendance.term_id
      and (
        internal.current_user_has_permission(
          academic_year.school_id,
          'ATTENDANCE_VIEW_ALL'
        )
        or (
          internal.current_user_has_permission(
            academic_year.school_id,
            'ATTENDANCE_MANAGE_ASSIGNED'
          )
          and internal.current_user_is_class_teacher_assigned(
            term_attendance.term_id,
            enrollment.class_section_id
          )
        )
      )
  )
);

create policy student_term_comments_select_authorized
on public.student_term_comments for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    join public.enrollments enrollment
      on enrollment.id = student_term_comments.enrollment_id
    where term.id = student_term_comments.term_id
      and (
        internal.current_user_has_permission(
          academic_year.school_id,
          'COMMENTS_VIEW_ALL'
        )
        or (
          internal.current_user_has_permission(
            academic_year.school_id,
            'COMMENTS_MANAGE_ASSIGNED'
          )
          and internal.current_user_is_class_teacher_assigned(
            student_term_comments.term_id,
            enrollment.class_section_id
          )
        )
      )
  )
);

create policy reports_select_authorized
on public.reports for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    join public.enrollments enrollment on enrollment.id = reports.enrollment_id
    where term.id = reports.term_id
      and (
        internal.current_user_has_permission(
          academic_year.school_id,
          'REPORTS_VIEW_ALL'
        )
        or (
          internal.current_user_has_permission(
            academic_year.school_id,
            'REPORTS_VIEW_ASSIGNED'
          )
          and internal.current_user_is_class_teacher_assigned(
            reports.term_id,
            enrollment.class_section_id
          )
        )
      )
  )
);

create policy report_snapshots_select_authorized
on public.report_snapshots for select to authenticated
using (
  exists (
    select 1
    from public.reports report
    where report.id = report_snapshots.report_id
  )
);

create policy report_subject_results_select_authorized
on public.report_subject_results for select to authenticated
using (
  exists (
    select 1
    from public.reports report
    where report.id = report_subject_results.report_id
  )
);

create policy audit_logs_select_authorized
on public.audit_logs for select to authenticated
using (
  internal.current_user_has_permission(school_id, 'AUDIT_VIEW')
);
