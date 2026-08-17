-- Stage 8: secure, school-scoped teacher assignment management.
-- Assignment history stays in the original Stage 2 tables; all browser
-- mutations pass through selected-session, permission-checked RPCs.

-- Fail fast if historical data would make the new temporal constraints unsafe.
do $$
begin
  if exists (
    select 1
    from public.teaching_assignments left_assignment
    join public.teaching_assignments right_assignment
      on right_assignment.id > left_assignment.id
     and right_assignment.term_id = left_assignment.term_id
     and right_assignment.class_section_id = left_assignment.class_section_id
     and right_assignment.subject_id = left_assignment.subject_id
     and right_assignment.staff_membership_id = left_assignment.staff_membership_id
     and daterange(
       right_assignment.starts_on,
       coalesce(right_assignment.ends_on, 'infinity'::date),
       '[]'
     ) && daterange(
       left_assignment.starts_on,
       coalesce(left_assignment.ends_on, 'infinity'::date),
       '[]'
     )
  ) then
    raise exception 'TEACHING_ASSIGNMENT_OVERLAP_PREFLIGHT_FAILED'
      using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.class_teacher_assignments left_assignment
    join public.class_teacher_assignments right_assignment
      on right_assignment.id > left_assignment.id
     and right_assignment.term_id = left_assignment.term_id
     and right_assignment.class_section_id = left_assignment.class_section_id
     and right_assignment.is_primary
     and left_assignment.is_primary
     and daterange(
       right_assignment.starts_on,
       coalesce(right_assignment.ends_on, 'infinity'::date),
       '[]'
     ) && daterange(
       left_assignment.starts_on,
       coalesce(left_assignment.ends_on, 'infinity'::date),
       '[]'
     )
  ) then
    raise exception 'PRIMARY_CLASS_TEACHER_OVERLAP_PREFLIGHT_FAILED'
      using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.class_teacher_assignments left_assignment
    join public.class_teacher_assignments right_assignment
      on right_assignment.id > left_assignment.id
     and right_assignment.term_id = left_assignment.term_id
     and right_assignment.class_section_id = left_assignment.class_section_id
     and right_assignment.staff_membership_id = left_assignment.staff_membership_id
     and daterange(
       right_assignment.starts_on,
       coalesce(right_assignment.ends_on, 'infinity'::date),
       '[]'
     ) && daterange(
       left_assignment.starts_on,
       coalesce(left_assignment.ends_on, 'infinity'::date),
       '[]'
     )
  ) then
    raise exception 'CLASS_TEACHER_ASSIGNMENT_OVERLAP_PREFLIGHT_FAILED'
      using errcode = '23P01';
  end if;
end
$$;

drop index if exists public.teaching_assignment_active_duplicate_idx;
drop index if exists public.class_teacher_one_active_primary_idx;
drop index if exists public.class_teacher_active_duplicate_idx;

alter table public.teaching_assignments
  add constraint teaching_assignment_period_no_overlap
  exclude using gist (
    term_id with =,
    class_section_id with =,
    subject_id with =,
    staff_membership_id with =,
    daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&
  );

alter table public.class_teacher_assignments
  add constraint primary_class_teacher_period_no_overlap
  exclude using gist (
    term_id with =,
    class_section_id with =,
    daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&
  ) where (is_primary);

alter table public.class_teacher_assignments
  add constraint class_teacher_assignment_period_no_overlap
  exclude using gist (
    term_id with =,
    class_section_id with =,
    staff_membership_id with =,
    daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&
  );

create index teaching_assignments_status_dates_idx
  on public.teaching_assignments (is_active, starts_on, ends_on);

-- Preserve the legacy 23505 result for an exact active duplicate while the
-- exclusion constraint handles all other overlapping periods.
create unique index teaching_assignment_active_exact_period_idx
  on public.teaching_assignments (
    term_id,
    class_section_id,
    subject_id,
    staff_membership_id,
    starts_on,
    coalesce(ends_on, 'infinity'::date)
  ) where (is_active);

create or replace function internal.reject_exact_teaching_assignment_duplicate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.is_active and exists (
    select 1
    from public.teaching_assignments assignment
    where assignment.term_id = new.term_id
      and assignment.class_section_id = new.class_section_id
      and assignment.subject_id = new.subject_id
      and assignment.staff_membership_id = new.staff_membership_id
      and assignment.starts_on = new.starts_on
      and coalesce(assignment.ends_on, 'infinity'::date)
        = coalesce(new.ends_on, 'infinity'::date)
      and assignment.is_active
  ) then
    raise exception 'duplicate active teaching assignment'
      using errcode = '23505';
  end if;
  return new;
end
$$;

create trigger teaching_assignments_reject_exact_duplicate_stage8
before insert on public.teaching_assignments
for each row execute function internal.reject_exact_teaching_assignment_duplicate();

create index class_teacher_assignments_status_dates_idx
  on public.class_teacher_assignments (is_active, starts_on, ends_on);

alter table public.teaching_assignments enable row level security;
alter table public.teaching_assignments force row level security;
alter table public.class_teacher_assignments enable row level security;
alter table public.class_teacher_assignments force row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.teaching_assignments from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.class_teacher_assignments from public, anon, authenticated;

create or replace function internal.raise_assignment_conflict()
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  raise exception 'TEACHER_ASSIGNMENT_CONFLICT' using errcode = 'PT409';
end
$$;

create or replace function internal.current_assignment_actor()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select
    membership.profile_id,
    membership.id,
    membership.school_id,
    coalesce(
      array_agg(distinct role_assignment.role)
        filter (where role_assignment.role is not null),
      '{}'::public.staff_role[]
    ),
    coalesce(
      array_agg(distinct role_permission.permission)
        filter (where role_permission.permission is not null),
      '{}'::public.app_permission[]
    )
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id
   and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  left join public.staff_role_assignments role_assignment
    on role_assignment.membership_id = membership.id
   and role_assignment.granted_at <= now()
   and role_assignment.revoked_at is null
  left join public.role_permissions role_permission
    on role_permission.role = role_assignment.role
  where auth.uid() is not null
    and internal.current_auth_session_id() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE'
    and school.is_active
  group by membership.profile_id, membership.id, membership.school_id;
$$;

-- A role grant is effective only from its authoritative grant timestamp. Keep
-- the shared selected-membership permission helpers aligned with the stricter
-- assignment actor so future-dated roles cannot authorize direct RLS reads or
-- application route guards early.
create or replace function internal.current_user_has_permission(
  target_school_id uuid,
  requested_permission public.app_permission
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
    join public.staff_role_assignments assignment
      on assignment.membership_id = membership.id
     and assignment.granted_at <= now()
     and assignment.revoked_at is null
    join public.role_permissions mapping on mapping.role = assignment.role
    where selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
      and membership.school_id = target_school_id
      and membership.status = 'ACTIVE'
      and school.is_active
      and mapping.permission = requested_permission
  );
$$;

create or replace function public.get_my_effective_permissions(
  target_membership_id uuid
)
returns setof public.app_permission
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select distinct mapping.permission
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id
   and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  join public.staff_role_assignments assignment
    on assignment.membership_id = membership.id
   and assignment.granted_at <= now()
   and assignment.revoked_at is null
  join public.role_permissions mapping on mapping.role = assignment.role
  where selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.id = target_membership_id
    and membership.status = 'ACTIVE'
    and school.is_active
  order by mapping.permission;
$$;

create or replace function internal.require_assignment_manager()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query
  select actor.*
  from internal.current_assignment_actor() actor
  where 'ASSIGNMENTS_MANAGE' = any(actor.effective_permissions);

  if not found then
    raise exception 'TEACHER_ASSIGNMENT_FORBIDDEN' using errcode = '42501';
  end if;
end
$$;

create or replace function internal.require_assignment_reader()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  can_view_all boolean,
  can_view_own boolean,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query
  select
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ASSIGNMENTS_VIEW_ALL' = any(actor.effective_permissions),
    'ASSIGNMENTS_VIEW_OWN' = any(actor.effective_permissions),
    'ASSIGNMENTS_MANAGE' = any(actor.effective_permissions)
  from internal.current_assignment_actor() actor
  where actor.effective_permissions && array[
    'ASSIGNMENTS_VIEW_ALL'::public.app_permission,
    'ASSIGNMENTS_VIEW_OWN'::public.app_permission,
    'ASSIGNMENTS_MANAGE'::public.app_permission
  ];

  if not found then
    raise exception 'TEACHER_ASSIGNMENT_FORBIDDEN' using errcode = '42501';
  end if;
end
$$;

create or replace function internal.record_assignment_audit(
  actor_profile_id uuid,
  actor_membership_id uuid,
  actor_school_id uuid,
  audit_action text,
  audit_entity_type text,
  audit_entity_id uuid,
  audit_old_values jsonb,
  audit_new_values jsonb,
  audit_reason text default null
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  insert into public.audit_logs (
    school_id,
    actor_profile_id,
    actor_membership_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    reason
  ) values (
    actor_school_id,
    actor_profile_id,
    actor_membership_id,
    audit_action,
    audit_entity_type,
    audit_entity_id,
    audit_old_values,
    audit_new_values,
    nullif(btrim(audit_reason), '')
  );
$$;

create or replace function internal.assignment_audit_values(
  assignment public.teaching_assignments
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'term_id', assignment.term_id,
    'class_section_id', assignment.class_section_id,
    'subject_id', assignment.subject_id,
    'staff_membership_id', assignment.staff_membership_id,
    'starts_on', assignment.starts_on,
    'ends_on', assignment.ends_on,
    'is_active', assignment.is_active
  );
$$;

create or replace function internal.assignment_audit_values(
  assignment public.class_teacher_assignments
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'term_id', assignment.term_id,
    'class_section_id', assignment.class_section_id,
    'staff_membership_id', assignment.staff_membership_id,
    'is_primary', assignment.is_primary,
    'starts_on', assignment.starts_on,
    'ends_on', assignment.ends_on,
    'is_active', assignment.is_active
  );
$$;

create or replace function internal.assert_teacher_eligibility(
  actor_school_id uuid,
  target_membership_id uuid,
  required_role public.staff_role
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  membership_state public.membership_status;
  membership_school_id uuid;
begin
  select membership.school_id, membership.status
    into membership_school_id, membership_state
  from public.school_staff_memberships membership
  where membership.id = target_membership_id;

  if not found or membership_school_id is distinct from actor_school_id then
    raise exception 'TEACHER_ASSIGNMENT_CROSS_SCHOOL' using errcode = '42501';
  end if;
  if membership_state <> 'ACTIVE' then
    raise exception 'TEACHER_ASSIGNMENT_TEACHER_INACTIVE' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.staff_role_assignments role_assignment
    where role_assignment.membership_id = target_membership_id
      and role_assignment.role = required_role
      and role_assignment.granted_at <= now()
      and role_assignment.revoked_at is null
  ) then
    raise exception 'TEACHER_ASSIGNMENT_ROLE_REQUIRED' using errcode = '42501';
  end if;
end
$$;

create or replace function internal.assert_assignment_scope(
  actor_school_id uuid,
  target_term_id uuid,
  target_class_section_id uuid,
  assignment_starts_on date,
  assignment_ends_on date,
  require_available boolean default true
)
returns public.terms
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_term public.terms%rowtype;
  selected_year public.academic_years%rowtype;
  selected_class public.class_sections%rowtype;
begin
  if assignment_starts_on is null
     or (assignment_ends_on is not null and assignment_ends_on < assignment_starts_on) then
    raise exception 'TEACHER_ASSIGNMENT_DATES_INVALID' using errcode = '23514';
  end if;

  select term.* into selected_term
  from public.terms term
  where term.id = target_term_id;
  if not found then
    raise exception 'TEACHER_ASSIGNMENT_TERM_INVALID' using errcode = '23514';
  end if;

  select year.* into selected_year
  from public.academic_years year
  where year.id = selected_term.academic_year_id
    and year.school_id = actor_school_id;
  if not found then
    raise exception 'TEACHER_ASSIGNMENT_CROSS_SCHOOL' using errcode = '42501';
  end if;

  select section.* into selected_class
  from public.class_sections section
  where section.id = target_class_section_id;
  if not found then
    raise exception 'TEACHER_ASSIGNMENT_CLASS_INVALID' using errcode = '23514';
  end if;
  if selected_class.academic_year_id is distinct from selected_term.academic_year_id then
    raise exception 'TEACHER_ASSIGNMENT_ACADEMIC_SCOPE_INVALID' using errcode = '23514';
  end if;
  if require_available and not selected_class.is_active then
    raise exception 'TEACHER_ASSIGNMENT_CLASS_INACTIVE' using errcode = '23514';
  end if;
  if require_available and (
    selected_term.status = 'CLOSED'
    or selected_year.status in ('CLOSED', 'ARCHIVED')
  ) then
    raise exception 'TEACHER_ASSIGNMENT_TERM_CLOSED' using errcode = '23514';
  end if;
  if assignment_starts_on < selected_term.starts_on
     or assignment_starts_on > selected_term.ends_on
     or assignment_ends_on is not null
        and assignment_ends_on > selected_term.ends_on then
    raise exception 'TEACHER_ASSIGNMENT_DATES_OUTSIDE_TERM' using errcode = '23514';
  end if;

  return selected_term;
end
$$;

create or replace function internal.assert_subject_assignment_scope(
  actor_school_id uuid,
  target_term_id uuid,
  target_class_section_id uuid,
  target_subject_id uuid,
  assignment_starts_on date,
  assignment_ends_on date,
  require_available boolean default true
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  selected_class public.class_sections%rowtype;
  selected_subject public.subjects%rowtype;
begin
  perform internal.assert_assignment_scope(
    actor_school_id,
    target_term_id,
    target_class_section_id,
    assignment_starts_on,
    assignment_ends_on,
    require_available
  );

  select * into selected_class
  from public.class_sections
  where id = target_class_section_id;

  select * into selected_subject
  from public.subjects
  where id = target_subject_id;
  if not found or selected_subject.school_id is distinct from actor_school_id then
    raise exception 'TEACHER_ASSIGNMENT_SUBJECT_INVALID' using errcode = '23514';
  end if;
  if require_available and not selected_subject.is_active then
    raise exception 'TEACHER_ASSIGNMENT_SUBJECT_INACTIVE' using errcode = '23514';
  end if;
  if require_available and not exists (
    select 1
    from public.grade_level_subjects mapping
    where mapping.grade_level_id = selected_class.grade_level_id
      and mapping.subject_id = selected_subject.id
  ) then
    raise exception 'TEACHER_ASSIGNMENT_SUBJECT_NOT_MAPPED' using errcode = '23514';
  end if;
end
$$;

create or replace function internal.teaching_assignment_has_unsafe_dependencies(
  assignment_id uuid,
  proposed_starts_on date,
  proposed_ends_on date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.mark_sheets sheet
    where sheet.teaching_assignment_id = assignment_id
      and (
        sheet.created_at::date < proposed_starts_on
        or proposed_ends_on is not null and sheet.created_at::date > proposed_ends_on
      )
  ) or exists (
    select 1
    from public.marks mark
    join public.mark_sheets sheet on sheet.id = mark.mark_sheet_id
    where sheet.teaching_assignment_id = assignment_id
      and (
        mark.created_at::date < proposed_starts_on
        or proposed_ends_on is not null and mark.created_at::date > proposed_ends_on
      )
  );
$$;

create or replace function internal.class_assignment_has_unsafe_dependencies(
  target_term_id uuid,
  target_class_section_id uuid,
  proposed_starts_on date,
  proposed_ends_on date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.term_attendance attendance
    join public.enrollments enrollment on enrollment.id = attendance.enrollment_id
    where attendance.term_id = target_term_id
      and enrollment.class_section_id = target_class_section_id
      and (
        attendance.created_at::date < proposed_starts_on
        or proposed_ends_on is not null and attendance.created_at::date > proposed_ends_on
      )
  ) or exists (
    select 1
    from public.student_term_comments comment_record
    join public.enrollments enrollment on enrollment.id = comment_record.enrollment_id
    where comment_record.term_id = target_term_id
      and enrollment.class_section_id = target_class_section_id
      and (
        comment_record.created_at::date < proposed_starts_on
        or proposed_ends_on is not null and comment_record.created_at::date > proposed_ends_on
      )
  ) or exists (
    select 1
    from public.reports report
    join public.enrollments enrollment on enrollment.id = report.enrollment_id
    where report.term_id = target_term_id
      and enrollment.class_section_id = target_class_section_id
      and (
        report.created_at::date < proposed_starts_on
        or proposed_ends_on is not null and report.created_at::date > proposed_ends_on
      )
  ) or exists (
    select 1
    from public.report_batches batch
    where batch.term_id = target_term_id
      and batch.class_section_id = target_class_section_id
      and (
        batch.created_at::date < proposed_starts_on
        or proposed_ends_on is not null and batch.created_at::date > proposed_ends_on
      )
  ) or exists (
    select 1
    from public.promotion_decisions decision
    join public.enrollments enrollment on enrollment.id = decision.enrollment_id
    where decision.term_id = target_term_id
      and enrollment.class_section_id = target_class_section_id
      and (
        decision.created_at::date < proposed_starts_on
        or proposed_ends_on is not null and decision.created_at::date > proposed_ends_on
      )
  );
$$;

create or replace function internal.protect_teacher_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'TEACHER_ASSIGNMENT_DELETE_FORBIDDEN' using errcode = '55000';
  end if;

  if tg_table_name = 'teaching_assignments' then
    if new.term_id is distinct from old.term_id
       or new.class_section_id is distinct from old.class_section_id
       or new.subject_id is distinct from old.subject_id
       or new.staff_membership_id is distinct from old.staff_membership_id then
      raise exception 'TEACHER_ASSIGNMENT_IDENTITY_IMMUTABLE' using errcode = '55006';
    end if;
    if (new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on)
       and internal.teaching_assignment_has_unsafe_dependencies(
         old.id,
         new.starts_on,
         new.ends_on
       ) then
      raise exception 'TEACHER_ASSIGNMENT_ACADEMIC_DEPENDENCY' using errcode = '55006';
    end if;
  else
    if new.term_id is distinct from old.term_id
       or new.class_section_id is distinct from old.class_section_id
       or new.staff_membership_id is distinct from old.staff_membership_id
       or new.is_primary is distinct from old.is_primary then
      raise exception 'TEACHER_ASSIGNMENT_IDENTITY_IMMUTABLE' using errcode = '55006';
    end if;
    if (new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on)
       and internal.class_assignment_has_unsafe_dependencies(
         old.term_id,
         old.class_section_id,
         new.starts_on,
         new.ends_on
       ) then
      raise exception 'TEACHER_ASSIGNMENT_ACADEMIC_DEPENDENCY' using errcode = '55006';
    end if;
  end if;

  if not old.is_active and new.is_active then
    raise exception 'TEACHER_ASSIGNMENT_REACTIVATION_FORBIDDEN' using errcode = '55000';
  end if;
  if old.ends_on is not null
     and old.ends_on < current_date
     and (new.ends_on is null or new.ends_on >= current_date) then
    raise exception 'TEACHER_ASSIGNMENT_REACTIVATION_FORBIDDEN' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger teaching_assignments_preserve_history_stage8
before update or delete on public.teaching_assignments
for each row execute function internal.protect_teacher_assignment_history();

create trigger class_teacher_assignments_preserve_history_stage8
before update or delete on public.class_teacher_assignments
for each row execute function internal.protect_teacher_assignment_history();

-- Current access predicates additionally require the matching live teacher role.
create or replace function internal.current_user_is_subject_teacher_assigned(
  target_term_id uuid,
  target_class_section_id uuid,
  target_subject_id uuid
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
    join public.staff_role_assignments role_assignment
      on role_assignment.membership_id = membership.id
     and role_assignment.role = 'SUBJECT_TEACHER'
     and role_assignment.granted_at <= now()
     and role_assignment.revoked_at is null
    join public.teaching_assignments assignment
      on assignment.staff_membership_id = membership.id
    join public.terms term on term.id = assignment.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
      and assignment.term_id = target_term_id
      and assignment.class_section_id = target_class_section_id
      and assignment.subject_id = target_subject_id
      and assignment.is_active
      and current_date between assignment.starts_on and coalesce(assignment.ends_on, term.ends_on)
      and current_date between term.starts_on and term.ends_on
      and membership.status = 'ACTIVE'
      and membership.school_id = year.school_id
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
set search_path = pg_catalog, public, internal
as $$
  select exists (
    select 1
    from internal.staff_session_active_memberships selection
    join public.school_staff_memberships membership
      on membership.id = selection.membership_id
     and membership.profile_id = selection.profile_id
    join public.schools school on school.id = membership.school_id
    join public.staff_role_assignments role_assignment
      on role_assignment.membership_id = membership.id
     and role_assignment.role = 'CLASS_TEACHER'
     and role_assignment.granted_at <= now()
     and role_assignment.revoked_at is null
    join public.class_teacher_assignments assignment
      on assignment.staff_membership_id = membership.id
    join public.terms term on term.id = assignment.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
      and assignment.term_id = target_term_id
      and assignment.class_section_id = target_class_section_id
      and assignment.is_active
      and current_date between assignment.starts_on and coalesce(assignment.ends_on, term.ends_on)
      and current_date between term.starts_on and term.ends_on
      and membership.status = 'ACTIVE'
      and membership.school_id = year.school_id
      and school.is_active
  );
$$;

drop policy if exists teaching_assignments_select_authorized
  on public.teaching_assignments;
create policy teaching_assignments_select_authorized
on public.teaching_assignments for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years year on year.id = term.academic_year_id
    where term.id = teaching_assignments.term_id
      and (
        internal.current_user_has_permission(year.school_id, 'ASSIGNMENTS_VIEW_ALL')
        or internal.current_user_has_permission(year.school_id, 'ASSIGNMENTS_MANAGE')
        or (
          internal.current_user_has_permission(year.school_id, 'ASSIGNMENTS_VIEW_OWN')
          and internal.current_user_owns_active_membership(
            teaching_assignments.staff_membership_id,
            year.school_id
          )
          and exists (
            select 1
            from public.staff_role_assignments role_assignment
            where role_assignment.membership_id = teaching_assignments.staff_membership_id
              and role_assignment.role = 'SUBJECT_TEACHER'
              and role_assignment.granted_at <= now()
              and role_assignment.revoked_at is null
          )
        )
      )
  )
);

drop policy if exists class_teacher_assignments_select_authorized
  on public.class_teacher_assignments;
create policy class_teacher_assignments_select_authorized
on public.class_teacher_assignments for select to authenticated
using (
  exists (
    select 1
    from public.terms term
    join public.academic_years year on year.id = term.academic_year_id
    where term.id = class_teacher_assignments.term_id
      and (
        internal.current_user_has_permission(year.school_id, 'ASSIGNMENTS_VIEW_ALL')
        or internal.current_user_has_permission(year.school_id, 'ASSIGNMENTS_MANAGE')
        or (
          internal.current_user_has_permission(year.school_id, 'ASSIGNMENTS_VIEW_OWN')
          and internal.current_user_owns_active_membership(
            class_teacher_assignments.staff_membership_id,
            year.school_id
          )
          and exists (
            select 1
            from public.staff_role_assignments role_assignment
            where role_assignment.membership_id = class_teacher_assignments.staff_membership_id
              and role_assignment.role = 'CLASS_TEACHER'
              and role_assignment.granted_at <= now()
              and role_assignment.revoked_at is null
          )
        )
      )
  )
);

create or replace function public.create_teaching_assignment(
  target_term_id uuid,
  target_class_section_id uuid,
  target_subject_id uuid,
  target_staff_membership_id uuid,
  assignment_starts_on date,
  assignment_ends_on date
)
returns table (assignment_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  created public.teaching_assignments%rowtype;
begin
  select * into actor from internal.require_assignment_manager();
  perform internal.assert_subject_assignment_scope(
    actor.school_id,
    target_term_id,
    target_class_section_id,
    target_subject_id,
    assignment_starts_on,
    assignment_ends_on,
    true
  );
  perform internal.assert_teacher_eligibility(
    actor.school_id,
    target_staff_membership_id,
    'SUBJECT_TEACHER'
  );

  perform 1 from public.class_sections
  where id = target_class_section_id for update;

  insert into public.teaching_assignments (
    term_id,
    class_section_id,
    subject_id,
    staff_membership_id,
    starts_on,
    ends_on,
    is_active
  ) values (
    target_term_id,
    target_class_section_id,
    target_subject_id,
    target_staff_membership_id,
    assignment_starts_on,
    assignment_ends_on,
    true
  ) returning * into created;

  perform internal.record_assignment_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'TEACHING_ASSIGNMENT_CREATED',
    'teaching_assignment',
    created.id,
    null,
    internal.assignment_audit_values(created)
  );
  return query select created.id, created.updated_at;
exception
  when exclusion_violation or unique_violation then
    raise exception 'TEACHER_ASSIGNMENT_OVERLAP' using errcode = '23P01';
end
$$;

create or replace function public.update_teaching_assignment(
  target_assignment_id uuid,
  expected_updated_at timestamptz,
  assignment_starts_on date,
  assignment_ends_on date
)
returns table (assignment_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.teaching_assignments%rowtype;
  changed public.teaching_assignments%rowtype;
begin
  select * into actor from internal.require_assignment_manager();
  select assignment.* into existing
  from public.teaching_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where assignment.id = target_assignment_id
    and year.school_id = actor.school_id
  for update of assignment;
  if not found then
    raise exception 'TEACHER_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_assignment_conflict();
  end if;
  if not existing.is_active
     or existing.ends_on is not null and existing.ends_on < current_date then
    raise exception 'TEACHER_ASSIGNMENT_HISTORICAL_IMMUTABLE' using errcode = '55000';
  end if;
  perform internal.assert_subject_assignment_scope(
    actor.school_id,
    existing.term_id,
    existing.class_section_id,
    existing.subject_id,
    assignment_starts_on,
    assignment_ends_on,
    false
  );
  perform internal.assert_teacher_eligibility(
    actor.school_id,
    existing.staff_membership_id,
    'SUBJECT_TEACHER'
  );

  update public.teaching_assignments
  set starts_on = assignment_starts_on, ends_on = assignment_ends_on
  where id = existing.id
  returning * into changed;

  perform internal.record_assignment_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'TEACHING_ASSIGNMENT_UPDATED',
    'teaching_assignment',
    changed.id,
    internal.assignment_audit_values(existing),
    internal.assignment_audit_values(changed)
  );
  return query select changed.id, changed.updated_at;
exception
  when exclusion_violation or unique_violation then
    raise exception 'TEACHER_ASSIGNMENT_OVERLAP' using errcode = '23P01';
end
$$;

create or replace function public.end_teaching_assignment(
  target_assignment_id uuid,
  expected_updated_at timestamptz,
  assignment_ends_on date,
  reason text
)
returns table (assignment_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.teaching_assignments%rowtype;
  changed public.teaching_assignments%rowtype;
begin
  select * into actor from internal.require_assignment_manager();
  if nullif(btrim(reason), '') is null
     or length(btrim(reason)) < 3
     or length(btrim(reason)) > 500 then
    raise exception 'TEACHER_ASSIGNMENT_END_REASON_REQUIRED' using errcode = '22023';
  end if;
  select assignment.* into existing
  from public.teaching_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where assignment.id = target_assignment_id
    and year.school_id = actor.school_id
  for update of assignment;
  if not found then
    raise exception 'TEACHER_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_assignment_conflict();
  end if;
  if not existing.is_active or existing.ends_on is not null then
    raise exception 'TEACHER_ASSIGNMENT_ALREADY_ENDED' using errcode = '55000';
  end if;
  perform internal.assert_subject_assignment_scope(
    actor.school_id,
    existing.term_id,
    existing.class_section_id,
    existing.subject_id,
    existing.starts_on,
    assignment_ends_on,
    false
  );

  update public.teaching_assignments
  set ends_on = assignment_ends_on
  where id = existing.id
  returning * into changed;

  perform internal.record_assignment_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'TEACHING_ASSIGNMENT_ENDED',
    'teaching_assignment',
    changed.id,
    internal.assignment_audit_values(existing),
    internal.assignment_audit_values(changed),
    reason
  );
  return query select changed.id, changed.updated_at;
end
$$;

create or replace function public.create_class_teacher_assignment(
  target_term_id uuid,
  target_class_section_id uuid,
  target_staff_membership_id uuid,
  assignment_is_primary boolean,
  assignment_starts_on date,
  assignment_ends_on date
)
returns table (assignment_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  created public.class_teacher_assignments%rowtype;
begin
  select * into actor from internal.require_assignment_manager();
  perform internal.assert_assignment_scope(
    actor.school_id,
    target_term_id,
    target_class_section_id,
    assignment_starts_on,
    assignment_ends_on,
    true
  );
  perform internal.assert_teacher_eligibility(
    actor.school_id,
    target_staff_membership_id,
    'CLASS_TEACHER'
  );

  perform 1 from public.class_sections
  where id = target_class_section_id for update;

  insert into public.class_teacher_assignments (
    term_id,
    class_section_id,
    staff_membership_id,
    is_primary,
    starts_on,
    ends_on,
    is_active
  ) values (
    target_term_id,
    target_class_section_id,
    target_staff_membership_id,
    assignment_is_primary,
    assignment_starts_on,
    assignment_ends_on,
    true
  ) returning * into created;

  perform internal.record_assignment_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'CLASS_TEACHER_ASSIGNMENT_CREATED',
    'class_teacher_assignment',
    created.id,
    null,
    internal.assignment_audit_values(created)
  );
  return query select created.id, created.updated_at;
exception
  when exclusion_violation or unique_violation then
    if assignment_is_primary then
      raise exception 'PRIMARY_CLASS_TEACHER_CONFLICT' using errcode = '23P01';
    end if;
    raise exception 'CLASS_TEACHER_ASSIGNMENT_OVERLAP' using errcode = '23P01';
end
$$;

create or replace function public.update_class_teacher_assignment(
  target_assignment_id uuid,
  expected_updated_at timestamptz,
  assignment_starts_on date,
  assignment_ends_on date
)
returns table (assignment_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.class_teacher_assignments%rowtype;
  changed public.class_teacher_assignments%rowtype;
begin
  select * into actor from internal.require_assignment_manager();
  select assignment.* into existing
  from public.class_teacher_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where assignment.id = target_assignment_id
    and year.school_id = actor.school_id
  for update of assignment;
  if not found then
    raise exception 'TEACHER_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_assignment_conflict();
  end if;
  if not existing.is_active
     or existing.ends_on is not null and existing.ends_on < current_date then
    raise exception 'TEACHER_ASSIGNMENT_HISTORICAL_IMMUTABLE' using errcode = '55000';
  end if;
  perform internal.assert_assignment_scope(
    actor.school_id,
    existing.term_id,
    existing.class_section_id,
    assignment_starts_on,
    assignment_ends_on,
    false
  );
  perform internal.assert_teacher_eligibility(
    actor.school_id,
    existing.staff_membership_id,
    'CLASS_TEACHER'
  );

  update public.class_teacher_assignments
  set starts_on = assignment_starts_on, ends_on = assignment_ends_on
  where id = existing.id
  returning * into changed;

  perform internal.record_assignment_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'CLASS_TEACHER_ASSIGNMENT_UPDATED',
    'class_teacher_assignment',
    changed.id,
    internal.assignment_audit_values(existing),
    internal.assignment_audit_values(changed)
  );
  return query select changed.id, changed.updated_at;
exception
  when exclusion_violation or unique_violation then
    if existing.is_primary then
      raise exception 'PRIMARY_CLASS_TEACHER_CONFLICT' using errcode = '23P01';
    end if;
    raise exception 'CLASS_TEACHER_ASSIGNMENT_OVERLAP' using errcode = '23P01';
end
$$;

create or replace function public.end_class_teacher_assignment(
  target_assignment_id uuid,
  expected_updated_at timestamptz,
  assignment_ends_on date,
  reason text
)
returns table (assignment_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.class_teacher_assignments%rowtype;
  changed public.class_teacher_assignments%rowtype;
begin
  select * into actor from internal.require_assignment_manager();
  if nullif(btrim(reason), '') is null
     or length(btrim(reason)) < 3
     or length(btrim(reason)) > 500 then
    raise exception 'TEACHER_ASSIGNMENT_END_REASON_REQUIRED' using errcode = '22023';
  end if;
  select assignment.* into existing
  from public.class_teacher_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where assignment.id = target_assignment_id
    and year.school_id = actor.school_id
  for update of assignment;
  if not found then
    raise exception 'TEACHER_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_assignment_conflict();
  end if;
  if not existing.is_active or existing.ends_on is not null then
    raise exception 'TEACHER_ASSIGNMENT_ALREADY_ENDED' using errcode = '55000';
  end if;
  perform internal.assert_assignment_scope(
    actor.school_id,
    existing.term_id,
    existing.class_section_id,
    existing.starts_on,
    assignment_ends_on,
    false
  );

  update public.class_teacher_assignments
  set ends_on = assignment_ends_on
  where id = existing.id
  returning * into changed;

  perform internal.record_assignment_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'CLASS_TEACHER_ASSIGNMENT_ENDED',
    'class_teacher_assignment',
    changed.id,
    internal.assignment_audit_values(existing),
    internal.assignment_audit_values(changed),
    reason
  );
  return query select changed.id, changed.updated_at;
end
$$;

create or replace function public.replace_primary_class_teacher(
  target_term_id uuid,
  target_class_section_id uuid,
  target_staff_membership_id uuid,
  replacement_starts_on date,
  reason text
)
returns table (
  former_assignment_id uuid,
  replacement_assignment_id uuid,
  replacement_updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  former public.class_teacher_assignments%rowtype;
  ended public.class_teacher_assignments%rowtype;
  replacement public.class_teacher_assignments%rowtype;
begin
  select * into actor from internal.require_assignment_manager();
  if nullif(btrim(reason), '') is null
     or length(btrim(reason)) < 3
     or length(btrim(reason)) > 500 then
    raise exception 'TEACHER_ASSIGNMENT_REPLACEMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  perform internal.assert_assignment_scope(
    actor.school_id,
    target_term_id,
    target_class_section_id,
    replacement_starts_on,
    null,
    true
  );
  perform internal.assert_teacher_eligibility(
    actor.school_id,
    target_staff_membership_id,
    'CLASS_TEACHER'
  );

  -- The class row is the deterministic lock for all primary decisions in scope.
  perform 1 from public.class_sections
  where id = target_class_section_id for update;

  select assignment.* into former
  from public.class_teacher_assignments assignment
  where assignment.term_id = target_term_id
    and assignment.class_section_id = target_class_section_id
    and assignment.is_primary
    and assignment.is_active
    and replacement_starts_on between assignment.starts_on
      and coalesce(assignment.ends_on, 'infinity'::date)
  order by assignment.starts_on desc, assignment.id
  limit 1
  for update;

  if not found then
    raise exception 'PRIMARY_CLASS_TEACHER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if former.staff_membership_id = target_staff_membership_id then
    raise exception 'PRIMARY_CLASS_TEACHER_NOOP' using errcode = '22023';
  end if;
  if replacement_starts_on <= former.starts_on then
    raise exception 'PRIMARY_CLASS_TEACHER_REPLACEMENT_DATE_INVALID' using errcode = '23514';
  end if;

  update public.class_teacher_assignments
  set ends_on = replacement_starts_on - 1
  where id = former.id
  returning * into ended;

  insert into public.class_teacher_assignments (
    term_id,
    class_section_id,
    staff_membership_id,
    is_primary,
    starts_on,
    ends_on,
    is_active
  ) values (
    target_term_id,
    target_class_section_id,
    target_staff_membership_id,
    true,
    replacement_starts_on,
    null,
    true
  ) returning * into replacement;

  perform internal.record_assignment_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'CLASS_TEACHER_ASSIGNMENT_ENDED',
    'class_teacher_assignment',
    ended.id,
    internal.assignment_audit_values(former),
    internal.assignment_audit_values(ended),
    reason
  );
  perform internal.record_assignment_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'PRIMARY_CLASS_TEACHER_REPLACED',
    'class_teacher_assignment',
    replacement.id,
    null,
    internal.assignment_audit_values(replacement),
    reason
  );

  return query select ended.id, replacement.id, replacement.updated_at;
exception
  when exclusion_violation or unique_violation then
    raise exception 'PRIMARY_CLASS_TEACHER_CONFLICT' using errcode = '23P01';
end
$$;

create or replace function public.list_teaching_assignments(
  filter_academic_year_id uuid,
  filter_term_id uuid,
  filter_grade_level_id uuid,
  filter_class_section_id uuid,
  filter_subject_id uuid,
  filter_staff_membership_id uuid,
  filter_period text,
  page_number integer,
  page_size integer
)
returns table (
  assignment_id uuid,
  teacher_name text,
  employee_number text,
  teacher_role public.staff_role,
  academic_year_id uuid,
  academic_year_name text,
  term_id uuid,
  term_name text,
  term_starts_on date,
  term_ends_on date,
  grade_level_id uuid,
  grade_name text,
  class_section_id uuid,
  class_name text,
  subject_id uuid,
  subject_name text,
  staff_membership_id uuid,
  starts_on date,
  ends_on date,
  is_active boolean,
  period_status text,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_assignment_reader();
  return query
  select
    assignment.id,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    membership.employee_number,
    'SUBJECT_TEACHER'::public.staff_role,
    year.id,
    year.name,
    term.id,
    term.name,
    term.starts_on,
    term.ends_on,
    grade.id,
    grade.name,
    section.id,
    section.name,
    subject.id,
    subject.name,
    membership.id,
    assignment.starts_on,
    assignment.ends_on,
    assignment.is_active,
    case
      when not assignment.is_active then 'INACTIVE'
      when assignment.starts_on > current_date then 'UPCOMING'
      when coalesce(assignment.ends_on, term.ends_on) < current_date then 'ENDED'
      else 'CURRENT'
    end,
    assignment.updated_at,
    count(*) over ()
  from public.teaching_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = assignment.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.subjects subject on subject.id = assignment.subject_id
  join public.school_staff_memberships membership
    on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  where year.school_id = reader.school_id
    and (
      reader.can_view_all
      or reader.can_manage
      or (
        reader.can_view_own
        and assignment.staff_membership_id = reader.membership_id
        and exists (
          select 1
          from public.staff_role_assignments role_assignment
          where role_assignment.membership_id = reader.membership_id
            and role_assignment.role = 'SUBJECT_TEACHER'
            and role_assignment.granted_at <= now()
            and role_assignment.revoked_at is null
        )
      )
    )
    and (filter_academic_year_id is null or year.id = filter_academic_year_id)
    and (filter_term_id is null or term.id = filter_term_id)
    and (filter_grade_level_id is null or grade.id = filter_grade_level_id)
    and (filter_class_section_id is null or section.id = filter_class_section_id)
    and (filter_subject_id is null or subject.id = filter_subject_id)
    and (filter_staff_membership_id is null or membership.id = filter_staff_membership_id)
    and (
      filter_period is null
      or filter_period = 'CURRENT' and assignment.is_active
        and current_date between assignment.starts_on and coalesce(assignment.ends_on, term.ends_on)
      or filter_period = 'UPCOMING' and assignment.is_active and assignment.starts_on > current_date
      or filter_period = 'ENDED' and coalesce(assignment.ends_on, term.ends_on) < current_date
      or filter_period = 'INACTIVE' and not assignment.is_active
    )
  order by assignment.starts_on desc, year.name, term.term_number, grade.sort_order,
    section.name, subject.sort_order, teacher_name, assignment.id
  limit least(greatest(coalesce(page_size, 25), 1), 100)
  offset (greatest(coalesce(page_number, 1), 1) - 1)
    * least(greatest(coalesce(page_size, 25), 1), 100);
end
$$;

create or replace function public.list_class_teacher_assignments(
  filter_academic_year_id uuid,
  filter_term_id uuid,
  filter_grade_level_id uuid,
  filter_class_section_id uuid,
  filter_staff_membership_id uuid,
  filter_primary boolean,
  filter_period text,
  page_number integer,
  page_size integer
)
returns table (
  assignment_id uuid,
  teacher_name text,
  employee_number text,
  teacher_role public.staff_role,
  academic_year_id uuid,
  academic_year_name text,
  term_id uuid,
  term_name text,
  term_starts_on date,
  term_ends_on date,
  grade_level_id uuid,
  grade_name text,
  class_section_id uuid,
  class_name text,
  staff_membership_id uuid,
  is_primary boolean,
  starts_on date,
  ends_on date,
  is_active boolean,
  period_status text,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_assignment_reader();
  return query
  select
    assignment.id,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    membership.employee_number,
    'CLASS_TEACHER'::public.staff_role,
    year.id,
    year.name,
    term.id,
    term.name,
    term.starts_on,
    term.ends_on,
    grade.id,
    grade.name,
    section.id,
    section.name,
    membership.id,
    assignment.is_primary,
    assignment.starts_on,
    assignment.ends_on,
    assignment.is_active,
    case
      when not assignment.is_active then 'INACTIVE'
      when assignment.starts_on > current_date then 'UPCOMING'
      when coalesce(assignment.ends_on, term.ends_on) < current_date then 'ENDED'
      else 'CURRENT'
    end,
    assignment.updated_at,
    count(*) over ()
  from public.class_teacher_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = assignment.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.school_staff_memberships membership
    on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  where year.school_id = reader.school_id
    and (
      reader.can_view_all
      or reader.can_manage
      or (
        reader.can_view_own
        and assignment.staff_membership_id = reader.membership_id
        and exists (
          select 1
          from public.staff_role_assignments role_assignment
          where role_assignment.membership_id = reader.membership_id
            and role_assignment.role = 'CLASS_TEACHER'
            and role_assignment.granted_at <= now()
            and role_assignment.revoked_at is null
        )
      )
    )
    and (filter_academic_year_id is null or year.id = filter_academic_year_id)
    and (filter_term_id is null or term.id = filter_term_id)
    and (filter_grade_level_id is null or grade.id = filter_grade_level_id)
    and (filter_class_section_id is null or section.id = filter_class_section_id)
    and (filter_staff_membership_id is null or membership.id = filter_staff_membership_id)
    and (filter_primary is null or assignment.is_primary = filter_primary)
    and (
      filter_period is null
      or filter_period = 'CURRENT' and assignment.is_active
        and current_date between assignment.starts_on and coalesce(assignment.ends_on, term.ends_on)
      or filter_period = 'UPCOMING' and assignment.is_active and assignment.starts_on > current_date
      or filter_period = 'ENDED' and coalesce(assignment.ends_on, term.ends_on) < current_date
      or filter_period = 'INACTIVE' and not assignment.is_active
    )
  order by assignment.starts_on desc, year.name, term.term_number, grade.sort_order,
    section.name, assignment.is_primary desc, teacher_name, assignment.id
  limit least(greatest(coalesce(page_size, 25), 1), 100)
  offset (greatest(coalesce(page_number, 1), 1) - 1)
    * least(greatest(coalesce(page_size, 25), 1), 100);
end
$$;

create function public.get_teaching_assignment(target_assignment_id uuid)
returns table (
  assignment_id uuid,
  teacher_name text,
  employee_number text,
  teacher_role public.staff_role,
  academic_year_id uuid,
  academic_year_name text,
  term_id uuid,
  term_name text,
  term_starts_on date,
  term_ends_on date,
  grade_level_id uuid,
  grade_name text,
  class_section_id uuid,
  class_name text,
  subject_id uuid,
  subject_name text,
  staff_membership_id uuid,
  starts_on date,
  ends_on date,
  is_active boolean,
  period_status text,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_assignment_reader();
  return query
  select
    assignment.id,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    membership.employee_number,
    'SUBJECT_TEACHER'::public.staff_role,
    year.id,
    year.name,
    term.id,
    term.name,
    term.starts_on,
    term.ends_on,
    grade.id,
    grade.name,
    section.id,
    section.name,
    subject.id,
    subject.name,
    membership.id,
    assignment.starts_on,
    assignment.ends_on,
    assignment.is_active,
    case
      when not assignment.is_active then 'INACTIVE'
      when assignment.starts_on > current_date then 'UPCOMING'
      when coalesce(assignment.ends_on, term.ends_on) < current_date then 'ENDED'
      else 'CURRENT'
    end,
    assignment.updated_at,
    1::bigint
  from public.teaching_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = assignment.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.subjects subject on subject.id = assignment.subject_id
  join public.school_staff_memberships membership
    on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  where assignment.id = target_assignment_id
    and year.school_id = reader.school_id
    and (
      reader.can_view_all
      or reader.can_manage
      or (
        reader.can_view_own
        and assignment.staff_membership_id = reader.membership_id
        and exists (
          select 1
          from public.staff_role_assignments role_assignment
          where role_assignment.membership_id = reader.membership_id
            and role_assignment.role = 'SUBJECT_TEACHER'
            and role_assignment.granted_at <= now()
            and role_assignment.revoked_at is null
        )
      )
    );
end
$$;

create function public.get_class_teacher_assignment(target_assignment_id uuid)
returns table (
  assignment_id uuid,
  teacher_name text,
  employee_number text,
  teacher_role public.staff_role,
  academic_year_id uuid,
  academic_year_name text,
  term_id uuid,
  term_name text,
  term_starts_on date,
  term_ends_on date,
  grade_level_id uuid,
  grade_name text,
  class_section_id uuid,
  class_name text,
  staff_membership_id uuid,
  is_primary boolean,
  starts_on date,
  ends_on date,
  is_active boolean,
  period_status text,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_assignment_reader();
  return query
  select
    assignment.id,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    membership.employee_number,
    'CLASS_TEACHER'::public.staff_role,
    year.id,
    year.name,
    term.id,
    term.name,
    term.starts_on,
    term.ends_on,
    grade.id,
    grade.name,
    section.id,
    section.name,
    membership.id,
    assignment.is_primary,
    assignment.starts_on,
    assignment.ends_on,
    assignment.is_active,
    case
      when not assignment.is_active then 'INACTIVE'
      when assignment.starts_on > current_date then 'UPCOMING'
      when coalesce(assignment.ends_on, term.ends_on) < current_date then 'ENDED'
      else 'CURRENT'
    end,
    assignment.updated_at,
    1::bigint
  from public.class_teacher_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = assignment.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.school_staff_memberships membership
    on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  where assignment.id = target_assignment_id
    and year.school_id = reader.school_id
    and (
      reader.can_view_all
      or reader.can_manage
      or (
        reader.can_view_own
        and assignment.staff_membership_id = reader.membership_id
        and exists (
          select 1
          from public.staff_role_assignments role_assignment
          where role_assignment.membership_id = reader.membership_id
            and role_assignment.role = 'CLASS_TEACHER'
            and role_assignment.granted_at <= now()
            and role_assignment.revoked_at is null
        )
      )
    );
end
$$;

create or replace function public.list_eligible_subject_teachers(
  target_term_id uuid,
  target_class_section_id uuid,
  target_subject_id uuid,
  assignment_starts_on date,
  assignment_ends_on date
)
returns table (
  staff_membership_id uuid,
  display_name text,
  employee_number text,
  eligible_teacher_role public.staff_role,
  membership_status public.membership_status,
  currently_assigned boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_assignment_manager();
  perform internal.assert_subject_assignment_scope(
    actor.school_id,
    target_term_id,
    target_class_section_id,
    target_subject_id,
    assignment_starts_on,
    assignment_ends_on,
    true
  );
  return query
  select
    membership.id,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    membership.employee_number,
    'SUBJECT_TEACHER'::public.staff_role,
    membership.status,
    exists (
      select 1
      from public.teaching_assignments assignment
      where assignment.term_id = target_term_id
        and assignment.class_section_id = target_class_section_id
        and assignment.subject_id = target_subject_id
        and assignment.staff_membership_id = membership.id
        and daterange(
          assignment.starts_on,
          coalesce(assignment.ends_on, 'infinity'::date),
          '[]'
        ) && daterange(
          assignment_starts_on,
          coalesce(assignment_ends_on, 'infinity'::date),
          '[]'
        )
    )
  from public.school_staff_memberships membership
  join public.profiles profile on profile.id = membership.profile_id
  where membership.school_id = actor.school_id
    and membership.status = 'ACTIVE'
    and exists (
      select 1 from public.staff_role_assignments role_assignment
      where role_assignment.membership_id = membership.id
        and role_assignment.role = 'SUBJECT_TEACHER'
        and role_assignment.granted_at <= now()
        and role_assignment.revoked_at is null
    )
  order by display_name, membership.employee_number, membership.id;
end
$$;

create or replace function public.list_eligible_class_teachers(
  target_term_id uuid,
  target_class_section_id uuid,
  assignment_starts_on date,
  assignment_ends_on date,
  assignment_is_primary boolean
)
returns table (
  staff_membership_id uuid,
  display_name text,
  employee_number text,
  eligible_teacher_role public.staff_role,
  membership_status public.membership_status,
  currently_assigned boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_assignment_manager();
  perform internal.assert_assignment_scope(
    actor.school_id,
    target_term_id,
    target_class_section_id,
    assignment_starts_on,
    assignment_ends_on,
    true
  );
  return query
  select
    membership.id,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    membership.employee_number,
    'CLASS_TEACHER'::public.staff_role,
    membership.status,
    exists (
      select 1
      from public.class_teacher_assignments assignment
      where assignment.term_id = target_term_id
        and assignment.class_section_id = target_class_section_id
        and assignment.staff_membership_id = membership.id
        and (not assignment_is_primary or assignment.is_primary)
        and daterange(
          assignment.starts_on,
          coalesce(assignment.ends_on, 'infinity'::date),
          '[]'
        ) && daterange(
          assignment_starts_on,
          coalesce(assignment_ends_on, 'infinity'::date),
          '[]'
        )
    )
  from public.school_staff_memberships membership
  join public.profiles profile on profile.id = membership.profile_id
  where membership.school_id = actor.school_id
    and membership.status = 'ACTIVE'
    and exists (
      select 1 from public.staff_role_assignments role_assignment
      where role_assignment.membership_id = membership.id
        and role_assignment.role = 'CLASS_TEACHER'
        and role_assignment.granted_at <= now()
        and role_assignment.revoked_at is null
    )
  order by display_name, membership.employee_number, membership.id;
end
$$;

create or replace function public.list_assignment_teachers()
returns table (
  staff_membership_id uuid,
  display_name text,
  employee_number text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_assignment_reader();

  return query
  select distinct
    directory.staff_membership_id,
    directory.display_name,
    directory.employee_number
  from (
    select
      membership.id as staff_membership_id,
      concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name) as display_name,
      membership.employee_number
    from public.teaching_assignments assignment
    join public.terms term on term.id = assignment.term_id
    join public.academic_years year on year.id = term.academic_year_id
    join public.school_staff_memberships membership
      on membership.id = assignment.staff_membership_id
    join public.profiles profile on profile.id = membership.profile_id
    where year.school_id = reader.school_id
      and (
        reader.can_view_all
        or reader.can_manage
        or (
          reader.can_view_own
          and membership.id = reader.membership_id
          and exists (
            select 1
            from public.staff_role_assignments role_assignment
            where role_assignment.membership_id = reader.membership_id
              and role_assignment.role = 'SUBJECT_TEACHER'
              and role_assignment.granted_at <= now()
              and role_assignment.revoked_at is null
          )
        )
      )
    union
    select
      membership.id,
      concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
      membership.employee_number
    from public.class_teacher_assignments assignment
    join public.terms term on term.id = assignment.term_id
    join public.academic_years year on year.id = term.academic_year_id
    join public.school_staff_memberships membership
      on membership.id = assignment.staff_membership_id
    join public.profiles profile on profile.id = membership.profile_id
    where year.school_id = reader.school_id
      and (
        reader.can_view_all
        or reader.can_manage
        or (
          reader.can_view_own
          and membership.id = reader.membership_id
          and exists (
            select 1
            from public.staff_role_assignments role_assignment
            where role_assignment.membership_id = reader.membership_id
              and role_assignment.role = 'CLASS_TEACHER'
              and role_assignment.granted_at <= now()
              and role_assignment.revoked_at is null
          )
        )
      )
  ) directory
  order by directory.display_name, directory.employee_number,
    directory.staff_membership_id;
end
$$;

create or replace function public.get_my_teacher_assignments()
returns table (
  assignment_type text,
  assignment_id uuid,
  academic_year_name text,
  term_name text,
  grade_name text,
  class_name text,
  subject_name text,
  is_primary boolean,
  starts_on date,
  ends_on date,
  period_status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_assignment_reader();
  if not reader.can_view_own then
    raise exception 'TEACHER_ASSIGNMENT_OWN_VIEW_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select * from (
    select
      'SUBJECT'::text as assignment_type,
      assignment.id as assignment_id,
      year.name as academic_year_name,
      term.name as term_name,
      grade.name as grade_name,
      section.name as class_name,
      subject.name as subject_name,
      null::boolean as is_primary,
      assignment.starts_on as starts_on,
      assignment.ends_on as ends_on,
      case
        when not assignment.is_active then 'PREVIOUS'
        when assignment.starts_on > current_date then 'UPCOMING'
        when coalesce(assignment.ends_on, term.ends_on) < current_date then 'PREVIOUS'
        else 'CURRENT'
      end as period_status
    from public.teaching_assignments assignment
    join public.terms term on term.id = assignment.term_id
    join public.academic_years year on year.id = term.academic_year_id
    join public.class_sections section on section.id = assignment.class_section_id
    join public.grade_levels grade on grade.id = section.grade_level_id
    join public.subjects subject on subject.id = assignment.subject_id
    where year.school_id = reader.school_id
      and assignment.staff_membership_id = reader.membership_id
      and exists (
        select 1 from public.staff_role_assignments role_assignment
        where role_assignment.membership_id = reader.membership_id
          and role_assignment.role = 'SUBJECT_TEACHER'
          and role_assignment.granted_at <= now()
          and role_assignment.revoked_at is null
      )
    union all
    select
      'CLASS'::text,
      assignment.id,
      year.name,
      term.name,
      grade.name,
      section.name,
      null::text,
      assignment.is_primary,
      assignment.starts_on,
      assignment.ends_on,
      case
        when not assignment.is_active then 'PREVIOUS'
        when assignment.starts_on > current_date then 'UPCOMING'
        when coalesce(assignment.ends_on, term.ends_on) < current_date then 'PREVIOUS'
        else 'CURRENT'
      end
    from public.class_teacher_assignments assignment
    join public.terms term on term.id = assignment.term_id
    join public.academic_years year on year.id = term.academic_year_id
    join public.class_sections section on section.id = assignment.class_section_id
    join public.grade_levels grade on grade.id = section.grade_level_id
    where year.school_id = reader.school_id
      and assignment.staff_membership_id = reader.membership_id
      and exists (
        select 1 from public.staff_role_assignments role_assignment
        where role_assignment.membership_id = reader.membership_id
          and role_assignment.role = 'CLASS_TEACHER'
          and role_assignment.granted_at <= now()
          and role_assignment.revoked_at is null
      )
  ) own_assignments
  order by
    case own_assignments.period_status
      when 'CURRENT' then 1
      when 'UPCOMING' then 2
      when 'PREVIOUS' then 3
      else 4
    end,
    own_assignments.starts_on,
    own_assignments.assignment_type,
    own_assignments.assignment_id;
end
$$;

comment on function internal.current_assignment_actor() is
  'Selected-session assignment actor with roles and permissions from only the live selected membership.';
comment on function internal.require_assignment_manager() is
  'Requires ASSIGNMENTS_MANAGE on the authoritative selected membership.';
comment on function public.get_my_teacher_assignments() is
  'Returns only the caller selected-membership class and subject assignment history without staff contacts.';

revoke all on function internal.raise_assignment_conflict() from public, anon, authenticated;
revoke all on function internal.current_assignment_actor() from public, anon, authenticated;
revoke all on function internal.require_assignment_manager() from public, anon, authenticated;
revoke all on function internal.require_assignment_reader() from public, anon, authenticated;
revoke all on function internal.record_assignment_audit(uuid, uuid, uuid, text, text, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function internal.assignment_audit_values(public.teaching_assignments) from public, anon, authenticated;
revoke all on function internal.assignment_audit_values(public.class_teacher_assignments) from public, anon, authenticated;
revoke all on function internal.assert_teacher_eligibility(uuid, uuid, public.staff_role) from public, anon, authenticated;
revoke all on function internal.assert_assignment_scope(uuid, uuid, uuid, date, date, boolean) from public, anon, authenticated;
revoke all on function internal.assert_subject_assignment_scope(uuid, uuid, uuid, uuid, date, date, boolean) from public, anon, authenticated;
revoke all on function internal.teaching_assignment_has_unsafe_dependencies(uuid, date, date) from public, anon, authenticated;
revoke all on function internal.class_assignment_has_unsafe_dependencies(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function internal.protect_teacher_assignment_history() from public, anon, authenticated;
revoke all on function internal.reject_exact_teaching_assignment_duplicate() from public, anon, authenticated;

revoke execute on function public.create_teaching_assignment(uuid, uuid, uuid, uuid, date, date) from public, anon;
revoke execute on function public.update_teaching_assignment(uuid, timestamptz, date, date) from public, anon;
revoke execute on function public.end_teaching_assignment(uuid, timestamptz, date, text) from public, anon;
revoke execute on function public.create_class_teacher_assignment(uuid, uuid, uuid, boolean, date, date) from public, anon;
revoke execute on function public.update_class_teacher_assignment(uuid, timestamptz, date, date) from public, anon;
revoke execute on function public.end_class_teacher_assignment(uuid, timestamptz, date, text) from public, anon;
revoke execute on function public.replace_primary_class_teacher(uuid, uuid, uuid, date, text) from public, anon;
revoke execute on function public.list_teaching_assignments(uuid, uuid, uuid, uuid, uuid, uuid, text, integer, integer) from public, anon;
revoke execute on function public.list_class_teacher_assignments(uuid, uuid, uuid, uuid, uuid, boolean, text, integer, integer) from public, anon;
revoke execute on function public.get_teaching_assignment(uuid) from public, anon;
revoke execute on function public.get_class_teacher_assignment(uuid) from public, anon;
revoke execute on function public.list_eligible_subject_teachers(uuid, uuid, uuid, date, date) from public, anon;
revoke execute on function public.list_eligible_class_teachers(uuid, uuid, date, date, boolean) from public, anon;
revoke execute on function public.list_assignment_teachers() from public, anon;
revoke execute on function public.get_my_teacher_assignments() from public, anon;

grant execute on function public.create_teaching_assignment(uuid, uuid, uuid, uuid, date, date) to authenticated;
grant execute on function public.update_teaching_assignment(uuid, timestamptz, date, date) to authenticated;
grant execute on function public.end_teaching_assignment(uuid, timestamptz, date, text) to authenticated;
grant execute on function public.create_class_teacher_assignment(uuid, uuid, uuid, boolean, date, date) to authenticated;
grant execute on function public.update_class_teacher_assignment(uuid, timestamptz, date, date) to authenticated;
grant execute on function public.end_class_teacher_assignment(uuid, timestamptz, date, text) to authenticated;
grant execute on function public.replace_primary_class_teacher(uuid, uuid, uuid, date, text) to authenticated;
grant execute on function public.list_teaching_assignments(uuid, uuid, uuid, uuid, uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.list_class_teacher_assignments(uuid, uuid, uuid, uuid, uuid, boolean, text, integer, integer) to authenticated;
grant execute on function public.get_teaching_assignment(uuid) to authenticated;
grant execute on function public.get_class_teacher_assignment(uuid) to authenticated;
grant execute on function public.list_eligible_subject_teachers(uuid, uuid, uuid, date, date) to authenticated;
grant execute on function public.list_eligible_class_teachers(uuid, uuid, date, date, boolean) to authenticated;
grant execute on function public.list_assignment_teachers() to authenticated;
grant execute on function public.get_my_teacher_assignments() to authenticated;
