-- Stage 4 exposes only the authenticated staff identity context required to
-- establish a server-authoritative session. Academic data remains deny-by-default.

grant select on table public.profiles to authenticated;
grant select on table public.school_staff_memberships to authenticated;
grant select on table public.staff_role_assignments to authenticated;
grant select on table public.schools to authenticated;

-- RLS bypass does not imply SQL privileges. These explicit service grants are
-- limited to the trusted Stage 4 provisioning, activation, and audit paths.
grant select on table public.schools to service_role;
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete
  on table public.school_staff_memberships to service_role;
grant select, insert, update, delete
  on table public.staff_role_assignments to service_role;
grant insert on table public.audit_logs to service_role;
grant usage on schema internal to service_role;
grant execute on function internal.set_updated_at() to service_role;
grant execute on function internal.membership_belongs_to_school(uuid, uuid)
  to service_role;
grant execute on function internal.validate_staff_role_grant_scope()
  to service_role;
grant execute on function internal.validate_audit_actor_scope()
  to service_role;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy school_staff_memberships_select_own
on public.school_staff_memberships
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy staff_role_assignments_select_own
on public.staff_role_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.school_staff_memberships
    where school_staff_memberships.id = staff_role_assignments.membership_id
      and school_staff_memberships.profile_id = (select auth.uid())
  )
);

create policy schools_select_for_own_memberships
on public.schools
for select
to authenticated
using (
  exists (
    select 1
    from public.school_staff_memberships
    where school_staff_memberships.school_id = schools.id
      and school_staff_memberships.profile_id = (select auth.uid())
  )
);

comment on policy profiles_select_own on public.profiles is
  'Authenticated staff can read only the profile keyed to their auth user.';
comment on policy school_staff_memberships_select_own
  on public.school_staff_memberships is
  'Authenticated staff can read only memberships belonging to their profile.';
comment on policy staff_role_assignments_select_own
  on public.staff_role_assignments is
  'Authenticated staff can read roles attached to their own memberships.';
comment on policy schools_select_for_own_memberships on public.schools is
  'Authenticated staff can read only schools referenced by their memberships.';
