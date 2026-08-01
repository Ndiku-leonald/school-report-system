-- Stage 6: secure academic-configuration management.
-- Browser roles retain SELECT-only table access. Every mutation below derives
-- its school and actor from the verified JWT session selection, applies an
-- optimistic-concurrency check, and appends its audit event transactionally.

alter table public.grading_scales
  add column retired_at timestamptz;

alter table public.ranking_rules
  add column retired_at timestamptz;

alter table public.promotion_rules
  add column retired_at timestamptz;

alter table public.terms
  add constraint terms_do_not_overlap
  exclude using gist (
    academic_year_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  );

create unique index term_one_promotion_term_per_year_idx
  on public.terms (academic_year_id)
  where is_promotion_term;

create unique index subject_active_sort_order_idx
  on public.subjects (school_id, sort_order)
  where is_active;

create unique index grade_level_subject_sort_order_idx
  on public.grade_level_subjects (grade_level_id, sort_order);

create index grading_scales_school_lifecycle_idx
  on public.grading_scales (school_id, is_active, retired_at);

create index ranking_rules_school_lifecycle_idx
  on public.ranking_rules (school_id, is_active, retired_at);

create index promotion_rules_school_lifecycle_idx
  on public.promotion_rules (school_id, is_active, retired_at);

create or replace function internal.current_configuration_actor()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select
    membership.profile_id,
    membership.id,
    membership.school_id
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id
    and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  where auth.uid() is not null
    and internal.current_auth_session_id() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE'
    and school.is_active
    and internal.current_user_has_permission(
      membership.school_id,
      'ACADEMIC_CONFIGURATION_MANAGE'
    );
$$;

comment on function internal.current_configuration_actor() is
  'Returns the current selected active membership actor only when its live role grants academic-configuration management.';

create or replace function internal.require_configuration_actor()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query
  select actor.profile_id, actor.membership_id, actor.school_id
  from internal.current_configuration_actor() actor;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_FORBIDDEN'
      using errcode = '42501';
  end if;
end
$$;

create or replace function public.create_grade_level(
  grade_code text, grade_name text, grade_sort_order integer,
  grade_is_final boolean default false
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; created public.grade_levels%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  insert into public.grade_levels (
    school_id, code, name, sort_order, is_final_grade
  ) values (
    actor.school_id, upper(btrim(grade_code)), btrim(grade_name),
    grade_sort_order, grade_is_final
  ) returning * into created;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_CREATED', 'grade_level', created.id, null,
    to_jsonb(created) - array['school_id', 'created_at']::text[]
  );
  return query select created.id, 'ACTIVE', created.updated_at;
end
$$;

create or replace function public.update_grade_level(
  target_grade_level_id uuid, expected_updated_at timestamptz,
  grade_code text, grade_name text, grade_sort_order integer,
  grade_is_final boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.grade_levels%rowtype; changed public.grade_levels%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.grade_levels
  where id = target_grade_level_id and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.grade_levels set
    code = upper(btrim(grade_code)), name = btrim(grade_name),
    sort_order = grade_sort_order, is_final_grade = grade_is_final
  where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'grade_level', changed.id,
    to_jsonb(existing) - array['school_id', 'created_at', 'updated_at']::text[],
    to_jsonb(changed) - array['school_id', 'created_at', 'updated_at']::text[]
  );
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end
$$;

create or replace function public.set_grade_level_active(
  target_grade_level_id uuid, expected_updated_at timestamptz, target_active boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.grade_levels%rowtype; changed public.grade_levels%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.grade_levels
  where id = target_grade_level_id and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.grade_levels set is_active = target_active
  where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_STATUS_CHANGED', 'grade_level', changed.id,
    jsonb_build_object('is_active', existing.is_active),
    jsonb_build_object('is_active', changed.is_active)
  );
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end
$$;

create or replace function public.reorder_grade_levels(ordered_grades jsonb)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; item record; active_count integer;
begin
  select * into actor from internal.require_configuration_actor();
  if jsonb_typeof(ordered_grades) <> 'array' then
    raise exception 'ACADEMIC_CONFIGURATION_ORDER_INVALID' using errcode = '22023';
  end if;
  select count(*) into active_count from public.grade_levels
    where school_id = actor.school_id and is_active;
  if jsonb_array_length(ordered_grades) <> active_count
     or (select count(distinct x.id) from jsonb_to_recordset(ordered_grades) as x(id uuid, sort_order int, expected_updated_at timestamptz)) <> active_count
     or exists (
       select 1 from jsonb_to_recordset(ordered_grades) as x(id uuid, sort_order int, expected_updated_at timestamptz)
       left join public.grade_levels grade on grade.id = x.id and grade.school_id = actor.school_id and grade.is_active
       where grade.id is null or x.sort_order <= 0
     )
     or (select count(distinct x.sort_order) from jsonb_to_recordset(ordered_grades) as x(id uuid, sort_order int, expected_updated_at timestamptz)) <> active_count then
    raise exception 'ACADEMIC_CONFIGURATION_ORDER_INVALID' using errcode = '22023';
  end if;
  perform 1 from public.grade_levels
    where school_id = actor.school_id and is_active for update;
  if exists (
    select 1 from jsonb_to_recordset(ordered_grades) as x(id uuid, sort_order int, expected_updated_at timestamptz)
    join public.grade_levels grade on grade.id = x.id
    where grade.updated_at is distinct from x.expected_updated_at
  ) then perform internal.raise_configuration_conflict(); end if;
  update public.grade_levels set sort_order = sort_order + 1000000
    where school_id = actor.school_id and is_active;
  for item in select * from jsonb_to_recordset(ordered_grades) as x(id uuid, sort_order int, expected_updated_at timestamptz)
  loop
    update public.grade_levels set sort_order = item.sort_order where id = item.id
    returning id, 'ACTIVE', public.grade_levels.updated_at into entity_id, entity_status, updated_at;
    return next;
  end loop;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'grade_level_order', null, null, ordered_grades
  );
end
$$;

create or replace function public.create_class_section(
  target_academic_year_id uuid, target_grade_level_id uuid,
  section_name text, section_code text, section_capacity integer default null
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; created public.class_sections%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  if not exists (
    select 1 from public.academic_years where id = target_academic_year_id
      and school_id = actor.school_id and status in ('DRAFT', 'ACTIVE')
  ) or not exists (
    select 1 from public.grade_levels where id = target_grade_level_id
      and school_id = actor.school_id
  ) then raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID' using errcode = '23514'; end if;
  insert into public.class_sections (
    academic_year_id, grade_level_id, name, class_code, capacity
  ) values (
    target_academic_year_id, target_grade_level_id, btrim(section_name),
    upper(btrim(section_code)), section_capacity
  ) returning * into created;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_CREATED', 'class_section', created.id, null,
    to_jsonb(created) - 'created_at'
  );
  return query select created.id, 'ACTIVE', created.updated_at;
end
$$;

create or replace function public.update_class_section(
  target_class_section_id uuid, expected_updated_at timestamptz,
  target_academic_year_id uuid, target_grade_level_id uuid,
  section_name text, section_code text, section_capacity integer
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.class_sections%rowtype; changed public.class_sections%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select section.* into existing from public.class_sections section
  join public.academic_years year on year.id = section.academic_year_id
  where section.id = target_class_section_id and year.school_id = actor.school_id
    and year.status in ('DRAFT', 'ACTIVE') for update of section;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_YEAR_UNAVAILABLE' using errcode = '23514'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  if not exists (
    select 1 from public.academic_years where id = target_academic_year_id
      and school_id = actor.school_id and status in ('DRAFT', 'ACTIVE')
  ) or not exists (
    select 1 from public.grade_levels where id = target_grade_level_id
      and school_id = actor.school_id
  ) then raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID' using errcode = '23514'; end if;
  update public.class_sections set academic_year_id = target_academic_year_id,
    grade_level_id = target_grade_level_id, name = btrim(section_name),
    class_code = upper(btrim(section_code)), capacity = section_capacity
  where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'class_section', changed.id,
    to_jsonb(existing) - array['created_at', 'updated_at']::text[],
    to_jsonb(changed) - array['created_at', 'updated_at']::text[]
  );
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end
$$;

create or replace function public.set_class_section_active(
  target_class_section_id uuid, expected_updated_at timestamptz, target_active boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.class_sections%rowtype; changed public.class_sections%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select section.* into existing from public.class_sections section
  join public.academic_years year on year.id = section.academic_year_id
  where section.id = target_class_section_id and year.school_id = actor.school_id
    and year.status in ('DRAFT', 'ACTIVE') for update of section;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_YEAR_UNAVAILABLE' using errcode = '23514'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.class_sections set is_active = target_active where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_STATUS_CHANGED', 'class_section', changed.id,
    jsonb_build_object('is_active', existing.is_active), jsonb_build_object('is_active', changed.is_active)
  );
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end
$$;

create or replace function internal.raise_configuration_conflict()
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  raise exception 'ACADEMIC_CONFIGURATION_CONFLICT'
    using errcode = '40001';
end
$$;

create or replace function internal.record_configuration_audit(
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
  )
  values (
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

create or replace function internal.assert_rule_scope(
  actor_school_id uuid,
  target_academic_year_id uuid,
  target_grade_level_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if target_academic_year_id is not null
     and not exists (
       select 1
       from public.academic_years
       where id = target_academic_year_id
         and school_id = actor_school_id
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID'
      using errcode = '23514';
  end if;

  if target_grade_level_id is not null
     and not exists (
       select 1
       from public.grade_levels
       where id = target_grade_level_id
         and school_id = actor_school_id
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID'
      using errcode = '23514';
  end if;
end
$$;

revoke all on function internal.current_configuration_actor()
  from public, anon, authenticated;
revoke all on function internal.require_configuration_actor()
  from public, anon, authenticated;
revoke all on function internal.raise_configuration_conflict()
  from public, anon, authenticated;
revoke all on function internal.record_configuration_audit(
  uuid, uuid, uuid, text, text, uuid, jsonb, jsonb, text
) from public, anon, authenticated;
revoke all on function internal.assert_rule_scope(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.create_academic_year(
  year_name text,
  year_starts_on date,
  year_ends_on date
)
returns table (
  entity_id uuid,
  entity_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  created public.academic_years%rowtype;
begin
  select * into actor from internal.require_configuration_actor();

  insert into public.academic_years (
    school_id, name, starts_on, ends_on, status
  )
  values (
    actor.school_id, btrim(year_name), year_starts_on, year_ends_on, 'DRAFT'
  )
  returning * into created;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_CREATED',
    'academic_year',
    created.id,
    null,
    jsonb_build_object(
      'name', created.name,
      'starts_on', created.starts_on,
      'ends_on', created.ends_on,
      'status', created.status
    )
  );

  return query select created.id, created.status::text, created.updated_at;
end
$$;

create or replace function public.update_academic_year(
  target_year_id uuid,
  year_name text,
  year_starts_on date,
  year_ends_on date,
  expected_updated_at timestamptz
)
returns table (
  entity_id uuid,
  entity_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.academic_years%rowtype;
  changed public.academic_years%rowtype;
begin
  select * into actor from internal.require_configuration_actor();

  select * into existing
  from public.academic_years
  where id = target_year_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if existing.status <> 'DRAFT' then
    raise exception 'ACADEMIC_CONFIGURATION_IMMUTABLE'
      using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.academic_years
  set
    name = btrim(year_name),
    starts_on = year_starts_on,
    ends_on = year_ends_on
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED',
    'academic_year',
    changed.id,
    jsonb_build_object(
      'name', existing.name,
      'starts_on', existing.starts_on,
      'ends_on', existing.ends_on,
      'status', existing.status
    ),
    jsonb_build_object(
      'name', changed.name,
      'starts_on', changed.starts_on,
      'ends_on', changed.ends_on,
      'status', changed.status
    )
  );

  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.activate_academic_year(
  target_year_id uuid,
  expected_updated_at timestamptz,
  transition_reason text default null
)
returns table (
  entity_id uuid,
  entity_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.academic_years%rowtype;
  changed public.academic_years%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing
  from public.academic_years
  where id = target_year_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if existing.status <> 'DRAFT' then
    raise exception 'ACADEMIC_CONFIGURATION_TRANSITION_INVALID'
      using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;
  if exists (
    select 1
    from public.academic_years
    where school_id = actor.school_id
      and status = 'ACTIVE'
      and id <> existing.id
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_ACTIVE_YEAR_EXISTS'
      using errcode = '23505';
  end if;

  update public.academic_years
  set status = 'ACTIVE'
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_ACTIVATED',
    'academic_year',
    changed.id,
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', changed.status),
    transition_reason
  );

  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.close_academic_year(
  target_year_id uuid,
  expected_updated_at timestamptz,
  transition_reason text default null
)
returns table (
  entity_id uuid,
  entity_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.academic_years%rowtype;
  changed public.academic_years%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing
  from public.academic_years
  where id = target_year_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if existing.status <> 'ACTIVE' then
    raise exception 'ACADEMIC_CONFIGURATION_TRANSITION_INVALID'
      using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.academic_years
  set status = 'CLOSED'
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_STATUS_CHANGED',
    'academic_year',
    changed.id,
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', changed.status),
    transition_reason
  );

  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.archive_academic_year(
  target_year_id uuid,
  expected_updated_at timestamptz,
  transition_reason text default null
)
returns table (
  entity_id uuid,
  entity_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.academic_years%rowtype;
  changed public.academic_years%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing
  from public.academic_years
  where id = target_year_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if existing.status <> 'CLOSED' then
    raise exception 'ACADEMIC_CONFIGURATION_TRANSITION_INVALID'
      using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.academic_years
  set status = 'ARCHIVED'
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_STATUS_CHANGED',
    'academic_year',
    changed.id,
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', changed.status),
    transition_reason
  );

  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.create_term(
  target_academic_year_id uuid,
  term_name text,
  target_term_number integer,
  term_starts_on date,
  term_ends_on date,
  promotion_term boolean default false
)
returns table (
  entity_id uuid,
  entity_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  year_record public.academic_years%rowtype;
  created public.terms%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into year_record
  from public.academic_years
  where id = target_academic_year_id
    and school_id = actor.school_id
    and status in ('DRAFT', 'ACTIVE')
  for share;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_YEAR_UNAVAILABLE'
      using errcode = '23514';
  end if;

  insert into public.terms (
    academic_year_id,
    name,
    term_number,
    starts_on,
    ends_on,
    status,
    is_promotion_term
  )
  values (
    year_record.id,
    btrim(term_name),
    target_term_number,
    term_starts_on,
    term_ends_on,
    'DRAFT',
    promotion_term
  )
  returning * into created;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_CREATED',
    'term',
    created.id,
    null,
    jsonb_build_object(
      'academic_year_id', created.academic_year_id,
      'name', created.name,
      'term_number', created.term_number,
      'starts_on', created.starts_on,
      'ends_on', created.ends_on,
      'status', created.status,
      'is_promotion_term', created.is_promotion_term
    )
  );

  return query select created.id, created.status::text, created.updated_at;
end
$$;

create or replace function public.update_term(
  target_term_id uuid,
  term_name text,
  target_term_number integer,
  term_starts_on date,
  term_ends_on date,
  promotion_term boolean,
  expected_updated_at timestamptz
)
returns table (
  entity_id uuid,
  entity_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.terms%rowtype;
  changed public.terms%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select term.* into existing
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id
    and year.school_id = actor.school_id
    and year.status in ('DRAFT', 'ACTIVE')
  for update of term;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if existing.status <> 'DRAFT' then
    raise exception 'ACADEMIC_CONFIGURATION_IMMUTABLE'
      using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.terms
  set
    name = btrim(term_name),
    term_number = target_term_number,
    starts_on = term_starts_on,
    ends_on = term_ends_on,
    is_promotion_term = promotion_term
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED',
    'term',
    changed.id,
    jsonb_build_object(
      'name', existing.name,
      'term_number', existing.term_number,
      'starts_on', existing.starts_on,
      'ends_on', existing.ends_on,
      'is_promotion_term', existing.is_promotion_term
    ),
    jsonb_build_object(
      'name', changed.name,
      'term_number', changed.term_number,
      'starts_on', changed.starts_on,
      'ends_on', changed.ends_on,
      'is_promotion_term', changed.is_promotion_term
    )
  );

  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.open_term(
  target_term_id uuid,
  expected_updated_at timestamptz
)
returns table (
  entity_id uuid,
  entity_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.terms%rowtype;
  changed public.terms%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select term.* into existing
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id
    and year.school_id = actor.school_id
    and year.status = 'ACTIVE'
  for update of term;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_YEAR_UNAVAILABLE'
      using errcode = '23514';
  end if;
  if existing.status <> 'DRAFT' then
    raise exception 'ACADEMIC_CONFIGURATION_TRANSITION_INVALID'
      using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.terms
  set status = 'OPEN'
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_ACTIVATED',
    'term',
    changed.id,
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', changed.status)
  );

  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.create_subject(
  subject_code text, subject_name text, subject_description text,
  subject_is_core boolean, subject_contributes_to_aggregate boolean,
  subject_sort_order integer
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; created public.subjects%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  insert into public.subjects (
    school_id, code, name, description, is_core,
    contributes_to_aggregate, sort_order
  ) values (
    actor.school_id, upper(btrim(subject_code)), btrim(subject_name),
    nullif(btrim(subject_description), ''), subject_is_core,
    subject_contributes_to_aggregate, subject_sort_order
  ) returning * into created;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_CREATED', 'subject', created.id, null,
    to_jsonb(created) - array['school_id', 'created_at']::text[]
  );
  return query select created.id, 'ACTIVE', created.updated_at;
end
$$;

create or replace function public.update_subject(
  target_subject_id uuid, expected_updated_at timestamptz,
  subject_code text, subject_name text, subject_description text,
  subject_is_core boolean, subject_contributes_to_aggregate boolean,
  subject_sort_order integer
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.subjects%rowtype; changed public.subjects%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.subjects
    where id = target_subject_id and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.subjects set code = upper(btrim(subject_code)), name = btrim(subject_name),
    description = nullif(btrim(subject_description), ''), is_core = subject_is_core,
    contributes_to_aggregate = subject_contributes_to_aggregate,
    sort_order = subject_sort_order
  where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'subject', changed.id,
    to_jsonb(existing) - array['school_id', 'created_at', 'updated_at']::text[],
    to_jsonb(changed) - array['school_id', 'created_at', 'updated_at']::text[]
  );
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end
$$;

create or replace function public.set_subject_active(
  target_subject_id uuid, expected_updated_at timestamptz, target_active boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.subjects%rowtype; changed public.subjects%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.subjects
    where id = target_subject_id and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.subjects set is_active = target_active where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_STATUS_CHANGED', 'subject', changed.id,
    jsonb_build_object('is_active', existing.is_active), jsonb_build_object('is_active', changed.is_active)
  );
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end
$$;

create or replace function public.reorder_subjects(ordered_subjects jsonb)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; item record; active_count integer;
begin
  select * into actor from internal.require_configuration_actor();
  if jsonb_typeof(ordered_subjects) <> 'array' then
    raise exception 'ACADEMIC_CONFIGURATION_ORDER_INVALID' using errcode = '22023';
  end if;
  select count(*) into active_count from public.subjects where school_id = actor.school_id and is_active;
  if jsonb_array_length(ordered_subjects) <> active_count
    or (select count(distinct x.id) from jsonb_to_recordset(ordered_subjects) x(id uuid, sort_order int, expected_updated_at timestamptz)) <> active_count
    or (select count(distinct x.sort_order) from jsonb_to_recordset(ordered_subjects) x(id uuid, sort_order int, expected_updated_at timestamptz)) <> active_count
    or exists (
      select 1 from jsonb_to_recordset(ordered_subjects) x(id uuid, sort_order int, expected_updated_at timestamptz)
      left join public.subjects subject on subject.id = x.id and subject.school_id = actor.school_id and subject.is_active
      where subject.id is null or x.sort_order <= 0
    ) then raise exception 'ACADEMIC_CONFIGURATION_ORDER_INVALID' using errcode = '22023'; end if;
  perform 1 from public.subjects where school_id = actor.school_id and is_active for update;
  if exists (
    select 1 from jsonb_to_recordset(ordered_subjects) x(id uuid, sort_order int, expected_updated_at timestamptz)
    join public.subjects subject on subject.id = x.id
    where subject.updated_at is distinct from x.expected_updated_at
  ) then perform internal.raise_configuration_conflict(); end if;
  update public.subjects set sort_order = sort_order + 1000000 where school_id = actor.school_id and is_active;
  for item in select * from jsonb_to_recordset(ordered_subjects) x(id uuid, sort_order int, expected_updated_at timestamptz)
  loop
    update public.subjects set sort_order = item.sort_order where id = item.id
    returning id, 'ACTIVE', public.subjects.updated_at into entity_id, entity_status, updated_at;
    return next;
  end loop;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'subject_order', null, null, ordered_subjects
  );
end
$$;

create or replace function public.set_grade_level_subject(
  target_grade_level_id uuid, target_subject_id uuid,
  mapping_required boolean, mapping_contributes_to_aggregate boolean,
  mapping_sort_order integer, target_mapping_id uuid default null,
  expected_updated_at timestamptz default null
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.grade_level_subjects%rowtype; changed public.grade_level_subjects%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  if not exists (
    select 1 from public.grade_levels where id = target_grade_level_id
      and school_id = actor.school_id and is_active
  ) or not exists (
    select 1 from public.subjects where id = target_subject_id
      and school_id = actor.school_id and is_active
  ) then raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID' using errcode = '23514'; end if;
  if target_mapping_id is null then
    insert into public.grade_level_subjects (
      grade_level_id, subject_id, is_required, contributes_to_aggregate, sort_order
    ) values (
      target_grade_level_id, target_subject_id, mapping_required,
      mapping_contributes_to_aggregate, mapping_sort_order
    ) returning * into changed;
  else
    select mapping.* into existing from public.grade_level_subjects mapping
    join public.grade_levels grade on grade.id = mapping.grade_level_id
    where mapping.id = target_mapping_id and grade.school_id = actor.school_id for update of mapping;
    if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
    update public.grade_level_subjects set grade_level_id = target_grade_level_id,
      subject_id = target_subject_id, is_required = mapping_required,
      contributes_to_aggregate = mapping_contributes_to_aggregate,
      sort_order = mapping_sort_order
    where id = existing.id returning * into changed;
  end if;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_MAPPING_CHANGED', 'grade_level_subject', changed.id,
    case when target_mapping_id is null then null else to_jsonb(existing) - array['created_at', 'updated_at']::text[] end,
    to_jsonb(changed) - array['created_at', 'updated_at']::text[]
  );
  return query select changed.id, 'ACTIVE', changed.updated_at;
end
$$;

create or replace function public.remove_grade_level_subject(
  target_mapping_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.grade_level_subjects%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select mapping.* into existing from public.grade_level_subjects mapping
  join public.grade_levels grade on grade.id = mapping.grade_level_id
  where mapping.id = target_mapping_id and grade.school_id = actor.school_id for update of mapping;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  if exists (
    select 1 from public.assessment_schemes where grade_level_id = existing.grade_level_id
      and subject_id = existing.subject_id and status = 'ACTIVE'
  ) or exists (
    select 1 from public.teaching_assignments assignment
    join public.class_sections section on section.id = assignment.class_section_id
    where section.grade_level_id = existing.grade_level_id and assignment.subject_id = existing.subject_id
  ) or exists (
    select 1 from public.mark_sheets sheet
    join public.class_sections section on section.id = sheet.class_section_id
    where section.grade_level_id = existing.grade_level_id and sheet.subject_id = existing.subject_id
  ) or exists (
    select 1 from public.report_subject_results result
    join public.reports report on report.id = result.report_id
    join public.enrollments enrollment on enrollment.id = report.enrollment_id
    join public.class_sections section on section.id = enrollment.class_section_id
    where section.grade_level_id = existing.grade_level_id and result.subject_id = existing.subject_id
  ) then raise exception 'ACADEMIC_CONFIGURATION_MAPPING_IN_USE' using errcode = '55006'; end if;
  delete from public.grade_level_subjects where id = existing.id;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_MAPPING_CHANGED', 'grade_level_subject', existing.id,
    to_jsonb(existing) - array['created_at', 'updated_at']::text[], null
  );
  return query select existing.id, 'REMOVED', expected_updated_at;
end
$$;

create or replace function public.save_assessment_scheme_draft(
  target_scheme_id uuid, expected_updated_at timestamptz,
  target_term_id uuid, target_grade_level_id uuid, target_subject_id uuid,
  scheme_name text, scheme_effective_from date, scheme_components jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.assessment_schemes%rowtype; changed public.assessment_schemes%rowtype; next_version int;
begin
  select * into actor from internal.require_configuration_actor();
  if jsonb_typeof(scheme_components) <> 'array' or jsonb_array_length(scheme_components) = 0 then
    raise exception 'ACADEMIC_CONFIGURATION_COMPONENTS_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.terms term join public.academic_years year on year.id = term.academic_year_id
    where term.id = target_term_id and year.school_id = actor.school_id
      and scheme_effective_from between term.starts_on and term.ends_on
  ) or not exists (
    select 1 from public.grade_levels where id = target_grade_level_id and school_id = actor.school_id
  ) or not exists (
    select 1 from public.subjects where id = target_subject_id and school_id = actor.school_id
  ) then raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID' using errcode = '23514'; end if;
  if target_scheme_id is not null then
    select scheme.* into existing from public.assessment_schemes scheme
    join public.terms term on term.id = scheme.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where scheme.id = target_scheme_id and year.school_id = actor.school_id for update of scheme;
    if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  end if;
  if target_scheme_id is null or existing.status <> 'DRAFT' then
    select coalesce(max(version), 0) + 1 into next_version from public.assessment_schemes
      where term_id = target_term_id and grade_level_id = target_grade_level_id and subject_id = target_subject_id;
    insert into public.assessment_schemes (
      term_id, grade_level_id, subject_id, name, version, status, effective_from, created_by
    ) values (
      target_term_id, target_grade_level_id, target_subject_id, btrim(scheme_name),
      next_version, 'DRAFT', scheme_effective_from, actor.membership_id
    ) returning * into changed;
  else
    update public.assessment_schemes set term_id = target_term_id,
      grade_level_id = target_grade_level_id, subject_id = target_subject_id,
      name = btrim(scheme_name), effective_from = scheme_effective_from
    where id = existing.id returning * into changed;
    delete from public.assessment_components where assessment_scheme_id = changed.id;
  end if;
  insert into public.assessment_components (
    assessment_scheme_id, name, component_code, maximum_score,
    weight_percentage, sort_order, is_required
  )
  select changed.id, btrim(component.name), upper(btrim(component.component_code)),
    component.maximum_score, component.weight_percentage, component.sort_order,
    coalesce(component.is_required, true)
  from jsonb_to_recordset(scheme_components) component(
    name text, component_code text, maximum_score numeric,
    weight_percentage numeric, sort_order int, is_required boolean
  );
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'assessment_scheme', changed.id,
    case when target_scheme_id is null then null else to_jsonb(existing) - array['created_at', 'updated_at']::text[] end,
    (to_jsonb(changed) - array['created_at', 'updated_at']::text[]) || jsonb_build_object('components', scheme_components)
  );
  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.activate_assessment_scheme(
  target_scheme_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.assessment_schemes%rowtype; changed public.assessment_schemes%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select scheme.* into existing from public.assessment_schemes scheme
  join public.terms term on term.id = scheme.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where scheme.id = target_scheme_id and year.school_id = actor.school_id for update of scheme;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.status <> 'DRAFT' then raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE' using errcode = '55000'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  if (select count(*) from public.assessment_components where assessment_scheme_id = existing.id) = 0
    or (select coalesce(sum(weight_percentage), 0) from public.assessment_components where assessment_scheme_id = existing.id) <> 100 then
    raise exception 'ACADEMIC_CONFIGURATION_WEIGHTS_INVALID' using errcode = '23514';
  end if;
  update public.assessment_schemes set status = 'ACTIVE' where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_ACTIVATED', 'assessment_scheme', changed.id,
    jsonb_build_object('status', existing.status), jsonb_build_object('status', changed.status)
  );
  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.retire_assessment_scheme(
  target_scheme_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.assessment_schemes%rowtype; changed public.assessment_schemes%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select scheme.* into existing from public.assessment_schemes scheme
  join public.terms term on term.id = scheme.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where scheme.id = target_scheme_id and year.school_id = actor.school_id for update of scheme;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.status <> 'ACTIVE' then raise exception 'ACADEMIC_CONFIGURATION_TRANSITION_INVALID' using errcode = '55000'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.assessment_schemes set status = 'RETIRED' where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_RETIRED', 'assessment_scheme', changed.id,
    jsonb_build_object('status', existing.status), jsonb_build_object('status', changed.status)
  );
  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.save_grading_scale_draft(
  target_scale_id uuid, expected_updated_at timestamptz,
  target_academic_year_id uuid, target_grade_level_id uuid,
  scale_name text, scale_effective_from date, scale_bands jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.grading_scales%rowtype; changed public.grading_scales%rowtype; next_version int;
begin
  select * into actor from internal.require_configuration_actor();
  perform internal.assert_rule_scope(actor.school_id, target_academic_year_id, target_grade_level_id);
  if jsonb_typeof(scale_bands) <> 'array' or jsonb_array_length(scale_bands) = 0 then
    raise exception 'ACADEMIC_CONFIGURATION_BANDS_INVALID' using errcode = '22023';
  end if;
  if target_scale_id is not null then
    select * into existing from public.grading_scales
      where id = target_scale_id and school_id = actor.school_id for update;
    if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  end if;
  if target_scale_id is null or existing.is_active or existing.retired_at is not null then
    select coalesce(max(version), 0) + 1 into next_version from public.grading_scales
    where school_id = actor.school_id
      and academic_year_id is not distinct from target_academic_year_id
      and grade_level_id is not distinct from target_grade_level_id;
    insert into public.grading_scales (
      school_id, academic_year_id, grade_level_id, name, version,
      is_active, effective_from, created_by
    ) values (
      actor.school_id, target_academic_year_id, target_grade_level_id,
      btrim(scale_name), next_version, false, scale_effective_from, actor.membership_id
    ) returning * into changed;
  else
    update public.grading_scales set academic_year_id = target_academic_year_id,
      grade_level_id = target_grade_level_id, name = btrim(scale_name),
      effective_from = scale_effective_from
    where id = existing.id returning * into changed;
    delete from public.grading_bands where grading_scale_id = changed.id;
  end if;
  insert into public.grading_bands (
    grading_scale_id, minimum_score, maximum_score, grade,
    aggregate_points, description, is_pass, sort_order
  )
  select changed.id, band.minimum_score, band.maximum_score, btrim(band.grade),
    band.aggregate_points, nullif(btrim(band.description), ''),
    coalesce(band.is_pass, true), band.sort_order
  from jsonb_to_recordset(scale_bands) band(
    minimum_score numeric, maximum_score numeric, grade text,
    aggregate_points int, description text, is_pass boolean, sort_order int
  );
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'grading_scale', changed.id,
    case when target_scale_id is null then null else to_jsonb(existing) - array['school_id', 'created_at', 'updated_at']::text[] end,
    (to_jsonb(changed) - array['school_id', 'created_at', 'updated_at']::text[]) || jsonb_build_object('bands', scale_bands)
  );
  return query select changed.id, 'DRAFT', changed.updated_at;
end
$$;

create or replace function public.activate_grading_scale(
  target_scale_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.grading_scales%rowtype; changed public.grading_scales%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.grading_scales
    where id = target_scale_id and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.is_active or existing.retired_at is not null then raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE' using errcode = '55000'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  if (select count(*) from public.grading_bands where grading_scale_id = existing.id) = 0
    or (select min(minimum_score) from public.grading_bands where grading_scale_id = existing.id) <> 0
    or (select max(maximum_score) from public.grading_bands where grading_scale_id = existing.id) <> 100
    or (select sum(maximum_score - minimum_score) from public.grading_bands where grading_scale_id = existing.id) <> 100 then
    raise exception 'ACADEMIC_CONFIGURATION_BAND_COVERAGE_INVALID' using errcode = '23514';
  end if;
  update public.grading_scales set is_active = true where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_ACTIVATED', 'grading_scale', changed.id,
    jsonb_build_object('is_active', false), jsonb_build_object('is_active', true));
  return query select changed.id, 'ACTIVE', changed.updated_at;
end
$$;

create or replace function public.deactivate_grading_scale(
  target_scale_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.grading_scales%rowtype; changed public.grading_scales%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.grading_scales
    where id = target_scale_id and school_id = actor.school_id for update;
  if not found or not existing.is_active then raise exception 'ACADEMIC_CONFIGURATION_TRANSITION_INVALID' using errcode = '55000'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.grading_scales set is_active = false, retired_at = now()
    where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_DEACTIVATED', 'grading_scale', changed.id,
    jsonb_build_object('is_active', true), jsonb_build_object('is_active', false, 'retired_at', changed.retired_at));
  return query select changed.id, 'RETIRED', changed.updated_at;
end
$$;

create or replace function public.save_ranking_rule(
  target_rule_id uuid, expected_updated_at timestamptz,
  target_academic_year_id uuid, target_grade_level_id uuid,
  rule_name text, rule_ranking_basis public.ranking_basis,
  rule_tie_method public.ranking_tie_method, rule_configuration jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.ranking_rules%rowtype; changed public.ranking_rules%rowtype; next_version int;
begin
  select * into actor from internal.require_configuration_actor();
  perform internal.assert_rule_scope(actor.school_id, target_academic_year_id, target_grade_level_id);
  if jsonb_typeof(rule_configuration) <> 'object'
    or octet_length(rule_configuration::text) > 10000 then
    raise exception 'ACADEMIC_CONFIGURATION_RULE_INVALID' using errcode = '22023';
  end if;
  if target_rule_id is not null then
    select * into existing from public.ranking_rules where id = target_rule_id
      and school_id = actor.school_id for update;
    if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  end if;
  if target_rule_id is null or existing.is_active or existing.retired_at is not null then
    select coalesce(max(version), 0) + 1 into next_version from public.ranking_rules
    where school_id = actor.school_id
      and academic_year_id is not distinct from target_academic_year_id
      and grade_level_id is not distinct from target_grade_level_id;
    insert into public.ranking_rules (
      school_id, academic_year_id, grade_level_id, name, version,
      ranking_basis, tie_method, configuration, created_by
    ) values (
      actor.school_id, target_academic_year_id, target_grade_level_id,
      btrim(rule_name), next_version, rule_ranking_basis, rule_tie_method,
      rule_configuration, actor.membership_id
    ) returning * into changed;
  else
    update public.ranking_rules set academic_year_id = target_academic_year_id,
      grade_level_id = target_grade_level_id, name = btrim(rule_name),
      ranking_basis = rule_ranking_basis, tie_method = rule_tie_method,
      configuration = rule_configuration
    where id = existing.id returning * into changed;
  end if;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'ranking_rule', changed.id,
    case when target_rule_id is null then null else to_jsonb(existing) - array['school_id', 'created_at', 'updated_at']::text[] end,
    to_jsonb(changed) - array['school_id', 'created_at', 'updated_at']::text[]
  );
  return query select changed.id, 'DRAFT', changed.updated_at;
end
$$;

create or replace function public.activate_ranking_rule(
  target_rule_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.ranking_rules%rowtype; changed public.ranking_rules%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.ranking_rules where id = target_rule_id
    and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.is_active or existing.retired_at is not null then raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE' using errcode = '55000'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.ranking_rules set is_active = true where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_ACTIVATED', 'ranking_rule', changed.id,
    jsonb_build_object('is_active', false), jsonb_build_object('is_active', true));
  return query select changed.id, 'ACTIVE', changed.updated_at;
end
$$;

create or replace function public.deactivate_ranking_rule(
  target_rule_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.ranking_rules%rowtype; changed public.ranking_rules%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.ranking_rules where id = target_rule_id
    and school_id = actor.school_id for update;
  if not found or not existing.is_active then raise exception 'ACADEMIC_CONFIGURATION_TRANSITION_INVALID' using errcode = '55000'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.ranking_rules set is_active = false, retired_at = now()
    where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_DEACTIVATED', 'ranking_rule', changed.id,
    jsonb_build_object('is_active', true), jsonb_build_object('is_active', false, 'retired_at', changed.retired_at));
  return query select changed.id, 'RETIRED', changed.updated_at;
end
$$;

create or replace function public.save_promotion_rule(
  target_rule_id uuid, expected_updated_at timestamptz,
  target_academic_year_id uuid, target_grade_level_id uuid,
  rule_name text, rule_minimum_average numeric, rule_maximum_aggregate integer,
  rule_minimum_subjects_passed integer, rule_minimum_attendance_percentage numeric,
  rule_required_subjects jsonb, rule_additional_configuration jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.promotion_rules%rowtype; changed public.promotion_rules%rowtype; next_version int;
begin
  select * into actor from internal.require_configuration_actor();
  perform internal.assert_rule_scope(actor.school_id, target_academic_year_id, target_grade_level_id);
  if jsonb_typeof(rule_required_subjects) <> 'object'
    or jsonb_typeof(rule_additional_configuration) <> 'object'
    or octet_length(rule_required_subjects::text) > 10000
    or octet_length(rule_additional_configuration::text) > 10000 then
    raise exception 'ACADEMIC_CONFIGURATION_RULE_INVALID' using errcode = '22023';
  end if;
  if target_rule_id is not null then
    select * into existing from public.promotion_rules where id = target_rule_id
      and school_id = actor.school_id for update;
    if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  end if;
  if target_rule_id is null or existing.is_active or existing.retired_at is not null then
    select coalesce(max(version), 0) + 1 into next_version from public.promotion_rules
    where school_id = actor.school_id
      and academic_year_id is not distinct from target_academic_year_id
      and grade_level_id is not distinct from target_grade_level_id;
    insert into public.promotion_rules (
      school_id, academic_year_id, grade_level_id, name, version,
      minimum_average, maximum_aggregate, minimum_subjects_passed,
      minimum_attendance_percentage, required_subject_rules, additional_rules, created_by
    ) values (
      actor.school_id, target_academic_year_id, target_grade_level_id,
      btrim(rule_name), next_version, rule_minimum_average, rule_maximum_aggregate,
      rule_minimum_subjects_passed, rule_minimum_attendance_percentage,
      rule_required_subjects, rule_additional_configuration, actor.membership_id
    ) returning * into changed;
  else
    update public.promotion_rules set academic_year_id = target_academic_year_id,
      grade_level_id = target_grade_level_id, name = btrim(rule_name),
      minimum_average = rule_minimum_average, maximum_aggregate = rule_maximum_aggregate,
      minimum_subjects_passed = rule_minimum_subjects_passed,
      minimum_attendance_percentage = rule_minimum_attendance_percentage,
      required_subject_rules = rule_required_subjects,
      additional_rules = rule_additional_configuration
    where id = existing.id returning * into changed;
  end if;
  perform internal.record_configuration_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED', 'promotion_rule', changed.id,
    case when target_rule_id is null then null else to_jsonb(existing) - array['school_id', 'created_at', 'updated_at']::text[] end,
    to_jsonb(changed) - array['school_id', 'created_at', 'updated_at']::text[]
  );
  return query select changed.id, 'DRAFT', changed.updated_at;
end
$$;

create or replace function public.activate_promotion_rule(
  target_rule_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.promotion_rules%rowtype; changed public.promotion_rules%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.promotion_rules where id = target_rule_id
    and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.is_active or existing.retired_at is not null then raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE' using errcode = '55000'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.promotion_rules set is_active = true where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_ACTIVATED', 'promotion_rule', changed.id,
    jsonb_build_object('is_active', false), jsonb_build_object('is_active', true));
  return query select changed.id, 'ACTIVE', changed.updated_at;
end
$$;

create or replace function public.deactivate_promotion_rule(
  target_rule_id uuid, expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.promotion_rules%rowtype; changed public.promotion_rules%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.promotion_rules where id = target_rule_id
    and school_id = actor.school_id for update;
  if not found or not existing.is_active then raise exception 'ACADEMIC_CONFIGURATION_TRANSITION_INVALID' using errcode = '55000'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  update public.promotion_rules set is_active = false, retired_at = now()
    where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_DEACTIVATED', 'promotion_rule', changed.id,
    jsonb_build_object('is_active', true), jsonb_build_object('is_active', false, 'retired_at', changed.retired_at));
  return query select changed.id, 'RETIRED', changed.updated_at;
end
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Keep every Stage 6 mutation
-- unavailable to unauthenticated roles, then expose only the narrow RPC surface.
revoke execute on all functions in schema public from public, anon;

grant execute on function public.create_academic_year(text, date, date) to authenticated;
grant execute on function public.update_academic_year(uuid, text, date, date, timestamptz) to authenticated;
grant execute on function public.activate_academic_year(uuid, timestamptz, text) to authenticated;
grant execute on function public.close_academic_year(uuid, timestamptz, text) to authenticated;
grant execute on function public.archive_academic_year(uuid, timestamptz, text) to authenticated;
grant execute on function public.create_term(uuid, text, integer, date, date, boolean) to authenticated;
grant execute on function public.update_term(uuid, text, integer, date, date, boolean, timestamptz) to authenticated;
grant execute on function public.open_term(uuid, timestamptz) to authenticated;
grant execute on function public.create_grade_level(text, text, integer, boolean) to authenticated;
grant execute on function public.update_grade_level(uuid, timestamptz, text, text, integer, boolean) to authenticated;
grant execute on function public.set_grade_level_active(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.reorder_grade_levels(jsonb) to authenticated;
grant execute on function public.create_class_section(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.update_class_section(uuid, timestamptz, uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.set_class_section_active(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.create_subject(text, text, text, boolean, boolean, integer) to authenticated;
grant execute on function public.update_subject(uuid, timestamptz, text, text, text, boolean, boolean, integer) to authenticated;
grant execute on function public.set_subject_active(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.reorder_subjects(jsonb) to authenticated;
grant execute on function public.set_grade_level_subject(uuid, uuid, boolean, boolean, integer, uuid, timestamptz) to authenticated;
grant execute on function public.remove_grade_level_subject(uuid, timestamptz) to authenticated;
grant execute on function public.save_assessment_scheme_draft(uuid, timestamptz, uuid, uuid, uuid, text, date, jsonb) to authenticated;
grant execute on function public.activate_assessment_scheme(uuid, timestamptz) to authenticated;
grant execute on function public.retire_assessment_scheme(uuid, timestamptz) to authenticated;
grant execute on function public.save_grading_scale_draft(uuid, timestamptz, uuid, uuid, text, date, jsonb) to authenticated;
grant execute on function public.activate_grading_scale(uuid, timestamptz) to authenticated;
grant execute on function public.deactivate_grading_scale(uuid, timestamptz) to authenticated;
grant execute on function public.save_ranking_rule(uuid, timestamptz, uuid, uuid, text, public.ranking_basis, public.ranking_tie_method, jsonb) to authenticated;
grant execute on function public.activate_ranking_rule(uuid, timestamptz) to authenticated;
grant execute on function public.deactivate_ranking_rule(uuid, timestamptz) to authenticated;
grant execute on function public.save_promotion_rule(uuid, timestamptz, uuid, uuid, text, numeric, integer, integer, numeric, jsonb, jsonb) to authenticated;
grant execute on function public.activate_promotion_rule(uuid, timestamptz) to authenticated;
grant execute on function public.deactivate_promotion_rule(uuid, timestamptz) to authenticated;
