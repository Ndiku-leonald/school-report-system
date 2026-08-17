-- Stage 9 correction: keep mark-sheet revisions immutable and hold every
-- mutable marks-entry authority row through draft creation and mark writes.

create or replace function internal.protect_mark_sheet_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'MARK_SHEET_DELETE_FORBIDDEN' using errcode = '55000';
  end if;
  if old.id is distinct from new.id
     or old.term_id is distinct from new.term_id
     or old.class_section_id is distinct from new.class_section_id
     or old.subject_id is distinct from new.subject_id
     or old.assessment_scheme_id is distinct from new.assessment_scheme_id
     or old.teaching_assignment_id is distinct from new.teaching_assignment_id
     or old.version is distinct from new.version
     or old.created_at is distinct from new.created_at then
    raise exception 'MARK_SHEET_IDENTITY_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end
$$;

comment on function internal.protect_mark_sheet_identity() is
  'Rejects deletion or mutation of a mark-sheet revision identity, including version; workflow state remains separately transitionable.';

create or replace function internal.lock_and_require_marks_write_authority()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  current_profile_id uuid := auth.uid();
  current_session_id uuid := internal.current_auth_session_id();
  selected_selection internal.staff_session_active_memberships%rowtype;
  selected_membership public.school_staff_memberships%rowtype;
  selected_school public.schools%rowtype;
  locked_roles public.staff_role[];
  locked_permissions public.app_permission[];
begin
  if current_profile_id is null or current_session_id is null then
    raise exception 'MARK_ENTRY_FORBIDDEN' using errcode = '42501';
  end if;

  -- Global marks-write lock order:
  --   1. current Auth session-selection row
  --   2. selected membership
  --   3. selected school
  --   4. membership role grants ordered by UUID
  --   5. permission mappings ordered by UUID
  --   6. teaching assignment
  --   7. term
  --   8. mark sheet
  --   9. mark cells ordered by component/enrollment
  -- Steps 6-9 remain in the Stage 9 assignment/sheet and cell helpers. Stage
  -- 4-8 authority, assignment and term mutations update their own row without
  -- later taking an earlier lock in this chain, so they cannot form a reverse
  -- edge. The winner owns a coherent authority snapshot until transaction end.
  select selection.* into selected_selection
  from internal.staff_session_active_memberships selection
  where selection.session_id = current_session_id
    and selection.profile_id = current_profile_id
  for update;

  if not found then
    raise exception 'MARK_ENTRY_FORBIDDEN' using errcode = '42501';
  end if;

  select membership.* into selected_membership
  from public.school_staff_memberships membership
  where membership.id = selected_selection.membership_id
  for update;

  if not found
     or selected_membership.profile_id is distinct from current_profile_id
     or selected_membership.status <> 'ACTIVE' then
    raise exception 'MARK_ENTRY_FORBIDDEN' using errcode = '42501';
  end if;

  select school.* into selected_school
  from public.schools school
  where school.id = selected_membership.school_id
  for update;

  if not found or not selected_school.is_active then
    raise exception 'MARK_ENTRY_FORBIDDEN' using errcode = '42501';
  end if;

  perform role_assignment.id
  from public.staff_role_assignments role_assignment
  where role_assignment.membership_id = selected_membership.id
  order by role_assignment.id
  for update;

  perform mapping.id
  from public.role_permissions mapping
  where mapping.role in (
    select role_assignment.role
    from public.staff_role_assignments role_assignment
    where role_assignment.membership_id = selected_membership.id
  )
  order by mapping.id
  for update;

  select coalesce(array_agg(distinct role_assignment.role), '{}'::public.staff_role[])
    into locked_roles
  from public.staff_role_assignments role_assignment
  where role_assignment.membership_id = selected_membership.id
    and role_assignment.granted_at <= now()
    and role_assignment.revoked_at is null;

  select coalesce(array_agg(distinct mapping.permission), '{}'::public.app_permission[])
    into locked_permissions
  from public.staff_role_assignments role_assignment
  join public.role_permissions mapping on mapping.role = role_assignment.role
  where role_assignment.membership_id = selected_membership.id
    and role_assignment.granted_at <= now()
    and role_assignment.revoked_at is null;

  if not ('SUBJECT_TEACHER' = any(locked_roles))
     or not ('MARKS_ENTER' = any(locked_permissions)) then
    raise exception 'MARK_ENTRY_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select current_profile_id, selected_membership.id, selected_school.id,
    locked_roles, locked_permissions;
end
$$;

comment on function internal.lock_and_require_marks_write_authority() is
  'Locks and revalidates current session selection, active membership/school, live SUBJECT_TEACHER grant and MARKS_ENTER permission for a marks mutation.';

create or replace function internal.require_marks_entry_actor()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language sql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
  select authority.*
  from internal.lock_and_require_marks_write_authority() authority;
$$;

comment on function internal.require_marks_entry_actor() is
  'Compatibility wrapper used by all Stage 9 mutation RPCs; delegates to transaction-held authority locking and revalidation.';

revoke all on function internal.protect_mark_sheet_identity()
  from public, anon, authenticated;
revoke all on function internal.lock_and_require_marks_write_authority()
  from public, anon, authenticated;
revoke all on function internal.require_marks_entry_actor()
  from public, anon, authenticated;
