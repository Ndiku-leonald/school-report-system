-- Bind every academic authorization decision to exactly one membership selected
-- for the current Supabase Auth session. Application cookies remain an untrusted
-- UI selector and cannot independently broaden PostgreSQL RLS.

create table internal.staff_session_active_memberships (
  session_id uuid primary key,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  membership_id uuid not null
    references public.school_staff_memberships(id) on delete cascade,
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_session_active_memberships_profile_idx
  on internal.staff_session_active_memberships (profile_id);

create index staff_session_active_memberships_membership_idx
  on internal.staff_session_active_memberships (membership_id);

comment on table internal.staff_session_active_memberships is
  'One active school membership per verified Supabase Auth session. Not exposed through the public API.';

revoke all privileges on table internal.staff_session_active_memberships
  from public, anon, authenticated;

create or replace function internal.current_auth_session_id()
returns uuid
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  raw_session_id text;
begin
  if auth.uid() is null then
    return null;
  end if;

  raw_session_id := auth.jwt() ->> 'session_id';
  if raw_session_id is null or btrim(raw_session_id) = '' then
    return null;
  end if;

  begin
    return raw_session_id::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;
end
$$;

comment on function internal.current_auth_session_id() is
  'Returns the verified JWT session_id as UUID, or null when authentication or the claim is missing or malformed.';

create or replace function internal.current_user_selected_membership_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select membership.id
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id
    and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  where selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE'
    and school.is_active;
$$;

comment on function internal.current_user_selected_membership_id() is
  'Definer rights read the non-API session-selection table and return only the current caller session active membership.';

create or replace function public.set_my_active_membership(
  target_membership_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  current_profile_id uuid;
  current_session_id uuid;
begin
  current_profile_id := auth.uid();
  current_session_id := internal.current_auth_session_id();

  if current_profile_id is null or current_session_id is null then
    raise exception 'An authenticated session is required.'
      using errcode = '28000';
  end if;

  perform membership.id
  from public.school_staff_memberships membership
  join public.schools school on school.id = membership.school_id
  where membership.id = target_membership_id
    and membership.profile_id = current_profile_id
    and membership.status = 'ACTIVE'
    and school.is_active;

  if not found then
    raise exception 'The selected membership is unavailable.'
      using errcode = 'P0001';
  end if;

  insert into internal.staff_session_active_memberships (
    session_id,
    profile_id,
    membership_id
  )
  values (
    current_session_id,
    current_profile_id,
    target_membership_id
  )
  on conflict (session_id) do update
  set
    profile_id = excluded.profile_id,
    membership_id = excluded.membership_id,
    selected_at = now(),
    updated_at = now();

  return target_membership_id;
end
$$;

create or replace function public.get_my_active_membership()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select internal.current_user_selected_membership_id();
$$;

create or replace function public.clear_my_active_membership()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  current_profile_id uuid;
  current_session_id uuid;
begin
  current_profile_id := auth.uid();
  current_session_id := internal.current_auth_session_id();

  if current_profile_id is null or current_session_id is null then
    return false;
  end if;

  delete from internal.staff_session_active_memberships selection
  where selection.session_id = current_session_id
    and selection.profile_id = current_profile_id;

  return found;
end
$$;

comment on function public.set_my_active_membership(uuid) is
  'Uses definer rights only to upsert the current verified session selection after validating caller ownership and active state.';
comment on function public.get_my_active_membership() is
  'Uses definer rights only to return the current verified session active selection.';
comment on function public.clear_my_active_membership() is
  'Uses definer rights only to delete the current verified session selection.';

revoke all on function internal.current_auth_session_id()
  from public, anon, authenticated;
revoke all on function internal.current_user_selected_membership_id()
  from public, anon, authenticated;
revoke all on function public.set_my_active_membership(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_active_membership()
  from public, anon, authenticated;
revoke all on function public.clear_my_active_membership()
  from public, anon, authenticated;

grant execute on function public.set_my_active_membership(uuid)
  to authenticated;
grant execute on function public.get_my_active_membership()
  to authenticated;
grant execute on function public.clear_my_active_membership()
  to authenticated;

create or replace function internal.current_user_has_active_membership(
  target_school_id uuid
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
    where selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
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

create or replace function internal.current_user_has_any_permission(
  target_school_id uuid,
  requested_permissions public.app_permission[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, internal
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
set search_path = pg_catalog, public, internal
as $$
  select exists (
    select 1
    from internal.staff_session_active_memberships selection
    join public.school_staff_memberships membership
      on membership.id = selection.membership_id
      and membership.profile_id = selection.profile_id
    join public.schools school on school.id = membership.school_id
    where selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
      and membership.id = target_membership_id
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
set search_path = pg_catalog, public, internal
as $$
  select exists (
    select 1
    from internal.staff_session_active_memberships selection
    join public.school_staff_memberships membership
      on membership.id = selection.membership_id
      and membership.profile_id = selection.profile_id
    join public.schools school on school.id = membership.school_id
    join public.teaching_assignments assignment
      on assignment.staff_membership_id = membership.id
    join public.terms term on term.id = assignment.term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
      and assignment.term_id = target_term_id
      and assignment.class_section_id = target_class_section_id
      and assignment.subject_id = target_subject_id
      and assignment.is_active
      and current_date >= assignment.starts_on
      and (assignment.ends_on is null or current_date <= assignment.ends_on)
      and current_date between term.starts_on and term.ends_on
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
set search_path = pg_catalog, public, internal
as $$
  select exists (
    select 1
    from internal.staff_session_active_memberships selection
    join public.school_staff_memberships membership
      on membership.id = selection.membership_id
      and membership.profile_id = selection.profile_id
    join public.schools school on school.id = membership.school_id
    join public.class_teacher_assignments assignment
      on assignment.staff_membership_id = membership.id
    join public.terms term on term.id = assignment.term_id
    join public.academic_years academic_year
      on academic_year.id = term.academic_year_id
    where selection.session_id = internal.current_auth_session_id()
      and selection.profile_id = auth.uid()
      and assignment.term_id = target_term_id
      and assignment.class_section_id = target_class_section_id
      and assignment.is_active
      and current_date >= assignment.starts_on
      and (assignment.ends_on is null or current_date <= assignment.ends_on)
      and current_date between term.starts_on and term.ends_on
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
set search_path = pg_catalog, public, internal
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
    and assignment.revoked_at is null
  join public.role_permissions mapping on mapping.role = assignment.role
  where selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.id = target_membership_id
    and membership.status = 'ACTIVE'
    and school.is_active
  order by mapping.permission;
$$;

comment on function internal.current_user_has_active_membership(uuid) is
  'Session-selected active membership predicate for RLS.';
comment on function internal.current_user_has_permission(uuid, public.app_permission) is
  'Permission predicate using only the role assignments of the current session-selected membership.';
comment on function internal.current_user_has_any_permission(uuid, public.app_permission[]) is
  'Any-permission predicate using only the current session-selected membership.';
comment on function internal.current_user_owns_active_membership(uuid, uuid) is
  'True only when the target is the current verified session-selected active membership.';
comment on function internal.current_user_is_subject_teacher_assigned(uuid, uuid, uuid) is
  'Subject assignment predicate bound to the current session-selected membership and current term.';
comment on function internal.current_user_is_class_teacher_assigned(uuid, uuid) is
  'Class assignment predicate bound to the current session-selected membership and current term.';
comment on function internal.current_user_can_read_class_section(uuid) is
  'Class visibility derived only from assignments belonging to the current session-selected membership.';
comment on function public.get_my_effective_permissions(uuid) is
  'Returns permissions only when the target is the current verified session-selected membership.';

drop policy enrollments_select_authorized on public.enrollments;

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
          and enrollments.status in ('ACTIVE', 'REPEATING')
          and internal.current_user_can_read_class_section(
            enrollments.class_section_id
          )
        )
      )
  )
);

comment on policy enrollments_select_authorized on public.enrollments is
  'Schoolwide viewers retain history; assignment-limited staff see only current ACTIVE or REPEATING rosters for the selected session membership.';
