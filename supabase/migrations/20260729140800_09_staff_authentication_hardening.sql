-- Invitation acceptance is a trusted, all-or-nothing transition. The caller
-- must present the profile and complete expected membership set observed by
-- the authenticated application session.
create function public.activate_staff_invitation(
  target_profile_id uuid,
  expected_membership_ids uuid[]
)
returns table (membership_id uuid)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  expected_count integer;
  locked_count integer;
  valid_count integer;
begin
  expected_count := cardinality(expected_membership_ids);
  if target_profile_id is null or expected_count is null or expected_count = 0 then
    raise exception 'Invitation activation requires a profile and membership IDs.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(expected_membership_ids) as supplied(id)
    where supplied.id is null
  ) or (
    select count(distinct supplied.id)
    from unnest(expected_membership_ids) as supplied(id)
  ) <> expected_count then
    raise exception 'Invitation membership IDs must be non-null and unique.'
      using errcode = '22023';
  end if;

  perform membership.id
  from public.school_staff_memberships as membership
  where membership.id = any(expected_membership_ids)
  order by membership.id
  for update;
  get diagnostics locked_count = row_count;

  if locked_count <> expected_count then
    raise exception 'One or more expected invitations are unavailable.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into valid_count
  from public.school_staff_memberships as membership
  join public.schools as school on school.id = membership.school_id
  where membership.id = any(expected_membership_ids)
    and membership.profile_id = target_profile_id
    and membership.status = 'INVITED'
    and school.is_active;

  if valid_count <> expected_count then
    raise exception 'One or more expected invitations are no longer eligible.'
      using errcode = 'P0001';
  end if;

  update public.school_staff_memberships as membership
  set
    status = 'ACTIVE',
    joined_at = coalesce(membership.joined_at, current_date)
  where membership.id = any(expected_membership_ids);

  insert into public.audit_logs (
    school_id,
    actor_profile_id,
    actor_membership_id,
    action,
    entity_type,
    entity_id,
    new_values
  )
  select
    membership.school_id,
    target_profile_id,
    membership.id,
    event.action,
    'school_staff_membership',
    membership.id,
    jsonb_build_object('status', 'ACTIVE')
  from public.school_staff_memberships as membership
  cross join (
    values
      ('STAFF_INVITATION_COMPLETED'::text),
      ('STAFF_MEMBERSHIP_ACTIVATED'::text)
  ) as event(action)
  where membership.id = any(expected_membership_ids);

  return query
  select membership.id
  from public.school_staff_memberships as membership
  where membership.id = any(expected_membership_ids)
  order by membership.id;
end
$$;

revoke all on function public.activate_staff_invitation(uuid, uuid[])
  from public;
revoke all on function public.activate_staff_invitation(uuid, uuid[])
  from anon;
revoke all on function public.activate_staff_invitation(uuid, uuid[])
  from authenticated;
grant execute on function public.activate_staff_invitation(uuid, uuid[])
  to service_role;

comment on function public.activate_staff_invitation(uuid, uuid[]) is
  'Atomically locks, validates, activates and audits the exact invited membership set through service_role only.';
