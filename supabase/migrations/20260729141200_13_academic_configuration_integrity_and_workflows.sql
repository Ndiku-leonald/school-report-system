-- Stage 6 corrective migration: preserve referenced academic identity, split
-- curriculum mapping operations, make version creation explicit, and align
-- audit semantics. Migration 12 remains immutable.

-- SQLSTATE 40001 is retryable and can leave a PostgREST request waiting until
-- its timeout. PT409 preserves the stable message and returns an immediate,
-- explicit HTTP conflict to browser callers.
create or replace function internal.raise_configuration_conflict()
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  raise exception 'ACADEMIC_CONFIGURATION_CONFLICT'
    using errcode = 'PT409';
end
$$;

update public.promotion_rules
set required_subject_rules = '[]'::jsonb
where required_subject_rules = '{}'::jsonb;

alter table public.promotion_rules
  drop constraint promotion_rules_required_subject_rules_check,
  add constraint promotion_rules_required_subject_rules_check
    check (jsonb_typeof(required_subject_rules) = 'array');

create or replace function internal.class_section_has_dependencies(
  target_class_section_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    exists (
      select 1
      from public.enrollments
      where class_section_id = target_class_section_id
    )
    or exists (
      select 1
      from public.teaching_assignments
      where class_section_id = target_class_section_id
    )
    or exists (
      select 1
      from public.class_teacher_assignments
      where class_section_id = target_class_section_id
    )
    or exists (
      select 1
      from public.mark_sheets
      where class_section_id = target_class_section_id
    )
    or exists (
      select 1
      from public.reports report
      join public.enrollments enrollment
        on enrollment.id = report.enrollment_id
      where enrollment.class_section_id = target_class_section_id
    );
$$;

create or replace function internal.protect_class_section_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public, internal
as $$
declare
  existing_year_status public.academic_year_status;
begin
  select status into existing_year_status
  from public.academic_years
  where id = old.academic_year_id;

  if existing_year_status not in ('DRAFT', 'ACTIVE')
     and (
       new.academic_year_id,
       new.grade_level_id,
       new.name,
       new.class_code,
       new.capacity,
       new.is_active
     ) is distinct from (
       old.academic_year_id,
       old.grade_level_id,
       old.name,
       old.class_code,
       old.capacity,
       old.is_active
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_YEAR_UNAVAILABLE'
      using errcode = '55000';
  end if;

  if (
    new.academic_year_id is distinct from old.academic_year_id
    or new.grade_level_id is distinct from old.grade_level_id
  ) and internal.class_section_has_dependencies(old.id) then
    raise exception 'ACADEMIC_CONFIGURATION_CLASS_SCOPE_IN_USE'
      using errcode = '55006';
  end if;

  return new;
end
$$;

create trigger class_sections_protect_identity
before update on public.class_sections
for each row execute function internal.protect_class_section_identity();

create or replace function internal.protect_curriculum_mapping_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.grade_level_id is distinct from old.grade_level_id
     or new.subject_id is distinct from old.subject_id then
    raise exception 'ACADEMIC_CONFIGURATION_MAPPING_IDENTITY_IMMUTABLE'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create trigger grade_level_subjects_protect_identity
before update on public.grade_level_subjects
for each row execute function internal.protect_curriculum_mapping_identity();

revoke all on function internal.class_section_has_dependencies(uuid)
  from public, anon, authenticated;
revoke all on function internal.protect_class_section_identity()
  from public, anon, authenticated;
revoke all on function internal.protect_curriculum_mapping_identity()
  from public, anon, authenticated;

create or replace function public.update_class_section(
  target_class_section_id uuid,
  expected_updated_at timestamptz,
  target_academic_year_id uuid,
  target_grade_level_id uuid,
  section_name text,
  section_code text,
  section_capacity integer
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.class_sections%rowtype;
  changed public.class_sections%rowtype;
begin
  select * into actor from internal.require_configuration_actor();

  select section.* into existing
  from public.class_sections section
  join public.academic_years year on year.id = section.academic_year_id
  where section.id = target_class_section_id
    and year.school_id = actor.school_id
  for update of section;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.academic_years
    where id = existing.academic_year_id
      and status in ('DRAFT', 'ACTIVE')
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_YEAR_UNAVAILABLE'
      using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;
  if not exists (
    select 1
    from public.academic_years
    where id = target_academic_year_id
      and school_id = actor.school_id
      and status in ('DRAFT', 'ACTIVE')
  ) or not exists (
    select 1
    from public.grade_levels
    where id = target_grade_level_id
      and school_id = actor.school_id
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID'
      using errcode = '23514';
  end if;
  if (
    target_academic_year_id is distinct from existing.academic_year_id
    or target_grade_level_id is distinct from existing.grade_level_id
  ) and internal.class_section_has_dependencies(existing.id) then
    raise exception 'ACADEMIC_CONFIGURATION_CLASS_SCOPE_IN_USE'
      using errcode = '55006';
  end if;

  update public.class_sections
  set
    academic_year_id = target_academic_year_id,
    grade_level_id = target_grade_level_id,
    name = btrim(section_name),
    class_code = upper(btrim(section_code)),
    capacity = section_capacity
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED',
    'class_section',
    changed.id,
    to_jsonb(existing) - array['created_at', 'updated_at']::text[],
    to_jsonb(changed) - array['created_at', 'updated_at']::text[]
  );

  return query
  select
    changed.id,
    case when changed.is_active then 'ACTIVE' else 'INACTIVE' end,
    changed.updated_at;
end
$$;

create or replace function public.create_grade_level_subject(
  target_grade_level_id uuid,
  target_subject_id uuid,
  mapping_required boolean,
  mapping_contributes_to_aggregate boolean,
  mapping_sort_order integer
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  created public.grade_level_subjects%rowtype;
begin
  select * into actor from internal.require_configuration_actor();

  if not exists (
    select 1
    from public.grade_levels
    where id = target_grade_level_id
      and school_id = actor.school_id
      and is_active
  ) or not exists (
    select 1
    from public.subjects
    where id = target_subject_id
      and school_id = actor.school_id
      and is_active
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID'
      using errcode = '23514';
  end if;

  insert into public.grade_level_subjects (
    grade_level_id,
    subject_id,
    is_required,
    contributes_to_aggregate,
    sort_order
  )
  values (
    target_grade_level_id,
    target_subject_id,
    mapping_required,
    mapping_contributes_to_aggregate,
    mapping_sort_order
  )
  returning * into created;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_MAPPING_CHANGED',
    'grade_level_subject',
    created.id,
    null,
    to_jsonb(created) - array['created_at', 'updated_at']::text[]
  );

  return query select created.id, 'ACTIVE', created.updated_at;
end
$$;

create or replace function public.update_grade_level_subject(
  target_mapping_id uuid,
  expected_updated_at timestamptz,
  mapping_required boolean,
  mapping_contributes_to_aggregate boolean,
  mapping_sort_order integer
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.grade_level_subjects%rowtype;
  changed public.grade_level_subjects%rowtype;
begin
  select * into actor from internal.require_configuration_actor();

  select mapping.* into existing
  from public.grade_level_subjects mapping
  join public.grade_levels grade on grade.id = mapping.grade_level_id
  where mapping.id = target_mapping_id
    and grade.school_id = actor.school_id
  for update of mapping;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.grade_level_subjects
  set
    is_required = mapping_required,
    contributes_to_aggregate = mapping_contributes_to_aggregate,
    sort_order = mapping_sort_order
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_MAPPING_CHANGED',
    'grade_level_subject',
    changed.id,
    to_jsonb(existing) - array['created_at', 'updated_at']::text[],
    to_jsonb(changed) - array['created_at', 'updated_at']::text[]
  );

  return query select changed.id, 'ACTIVE', changed.updated_at;
end
$$;

-- The migration-12 combined RPC remains in history but is no longer part of
-- the authenticated surface. Callers must choose create or update explicitly.
revoke execute on function public.set_grade_level_subject(
  uuid, uuid, boolean, boolean, integer, uuid, timestamptz
) from authenticated;

grant execute on function public.create_grade_level_subject(
  uuid, uuid, boolean, boolean, integer
) to authenticated;
grant execute on function public.update_grade_level_subject(
  uuid, timestamptz, boolean, boolean, integer
) to authenticated;

create or replace function public.update_academic_year(
  target_year_id uuid,
  year_name text,
  year_starts_on date,
  year_ends_on date,
  expected_updated_at timestamptz
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
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
  if exists (
    select 1
    from public.terms
    where academic_year_id = existing.id
      and (starts_on < year_starts_on or ends_on > year_ends_on)
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_TERM_OUTSIDE_YEAR'
      using errcode = '23514';
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

create or replace function public.reorder_grade_levels(ordered_grades jsonb)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  item record;
  active_count integer;
begin
  select * into actor from internal.require_configuration_actor();
  if jsonb_typeof(ordered_grades) <> 'array' then
    raise exception 'ACADEMIC_CONFIGURATION_ORDER_INVALID'
      using errcode = '22023';
  end if;
  select count(*) into active_count
  from public.grade_levels
  where school_id = actor.school_id
    and is_active;
  if jsonb_array_length(ordered_grades) <> active_count
     or (
       select count(distinct row_item.id)
       from jsonb_to_recordset(ordered_grades)
         as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
     ) <> active_count
     or exists (
       select 1
       from jsonb_to_recordset(ordered_grades)
         as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
       left join public.grade_levels grade
         on grade.id = row_item.id
         and grade.school_id = actor.school_id
         and grade.is_active
       where grade.id is null
          or row_item.sort_order <= 0
     )
     or (
       select count(distinct row_item.sort_order)
       from jsonb_to_recordset(ordered_grades)
         as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
     ) <> active_count then
    raise exception 'ACADEMIC_CONFIGURATION_ORDER_INVALID'
      using errcode = '22023';
  end if;

  perform 1
  from public.grade_levels
  where school_id = actor.school_id
    and is_active
  for update;

  if exists (
    select 1
    from jsonb_to_recordset(ordered_grades)
      as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
    join public.grade_levels grade on grade.id = row_item.id
    where grade.updated_at is distinct from row_item.expected_updated_at
  ) then
    perform internal.raise_configuration_conflict();
  end if;

  update public.grade_levels
  set sort_order = sort_order + 1000000
  where school_id = actor.school_id
    and is_active;

  for item in
    select *
    from jsonb_to_recordset(ordered_grades)
      as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
  loop
    update public.grade_levels
    set sort_order = item.sort_order
    where id = item.id
    returning
      id,
      'ACTIVE',
      public.grade_levels.updated_at
    into entity_id, entity_status, updated_at;
    return next;
  end loop;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED',
    'grade_level_order',
    null,
    null,
    jsonb_build_object('order', ordered_grades)
  );
end
$$;

create or replace function public.reorder_subjects(ordered_subjects jsonb)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  item record;
  active_count integer;
begin
  select * into actor from internal.require_configuration_actor();
  if jsonb_typeof(ordered_subjects) <> 'array' then
    raise exception 'ACADEMIC_CONFIGURATION_ORDER_INVALID'
      using errcode = '22023';
  end if;
  select count(*) into active_count
  from public.subjects
  where school_id = actor.school_id
    and is_active;
  if jsonb_array_length(ordered_subjects) <> active_count
     or (
       select count(distinct row_item.id)
       from jsonb_to_recordset(ordered_subjects)
         as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
     ) <> active_count
     or (
       select count(distinct row_item.sort_order)
       from jsonb_to_recordset(ordered_subjects)
         as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
     ) <> active_count
     or exists (
       select 1
       from jsonb_to_recordset(ordered_subjects)
         as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
       left join public.subjects subject
         on subject.id = row_item.id
         and subject.school_id = actor.school_id
         and subject.is_active
       where subject.id is null
          or row_item.sort_order <= 0
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_ORDER_INVALID'
      using errcode = '22023';
  end if;

  perform 1
  from public.subjects
  where school_id = actor.school_id
    and is_active
  for update;

  if exists (
    select 1
    from jsonb_to_recordset(ordered_subjects)
      as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
    join public.subjects subject on subject.id = row_item.id
    where subject.updated_at is distinct from row_item.expected_updated_at
  ) then
    perform internal.raise_configuration_conflict();
  end if;

  update public.subjects
  set sort_order = sort_order + 1000000
  where school_id = actor.school_id
    and is_active;

  for item in
    select *
    from jsonb_to_recordset(ordered_subjects)
      as row_item(id uuid, sort_order integer, expected_updated_at timestamptz)
  loop
    update public.subjects
    set sort_order = item.sort_order
    where id = item.id
    returning
      id,
      'ACTIVE',
      public.subjects.updated_at
    into entity_id, entity_status, updated_at;
    return next;
  end loop;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_UPDATED',
    'subject_order',
    null,
    null,
    jsonb_build_object('order', ordered_subjects)
  );
end
$$;

create or replace function public.save_assessment_scheme_draft(
  target_scheme_id uuid,
  expected_updated_at timestamptz,
  target_term_id uuid,
  target_grade_level_id uuid,
  target_subject_id uuid,
  scheme_name text,
  scheme_effective_from date,
  scheme_components jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.assessment_schemes%rowtype;
  changed public.assessment_schemes%rowtype;
  next_version integer;
  audit_action text;
begin
  select * into actor from internal.require_configuration_actor();

  if jsonb_typeof(scheme_components) <> 'array'
     or jsonb_array_length(scheme_components) = 0 then
    raise exception 'ACADEMIC_CONFIGURATION_COMPONENTS_INVALID'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.terms term
    join public.academic_years year on year.id = term.academic_year_id
    where term.id = target_term_id
      and year.school_id = actor.school_id
      and scheme_effective_from between term.starts_on and term.ends_on
  ) or not exists (
    select 1
    from public.grade_levels
    where id = target_grade_level_id
      and school_id = actor.school_id
  ) or not exists (
    select 1
    from public.subjects
    where id = target_subject_id
      and school_id = actor.school_id
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID'
      using errcode = '23514';
  end if;

  if target_scheme_id is null then
    select coalesce(max(version), 0) + 1 into next_version
    from public.assessment_schemes
    where term_id = target_term_id
      and grade_level_id = target_grade_level_id
      and subject_id = target_subject_id;

    insert into public.assessment_schemes (
      term_id,
      grade_level_id,
      subject_id,
      name,
      version,
      status,
      effective_from,
      created_by
    )
    values (
      target_term_id,
      target_grade_level_id,
      target_subject_id,
      btrim(scheme_name),
      next_version,
      'DRAFT',
      scheme_effective_from,
      actor.membership_id
    )
    returning * into changed;
    audit_action := 'ACADEMIC_CONFIGURATION_CREATED';
  else
    select scheme.* into existing
    from public.assessment_schemes scheme
    join public.terms term on term.id = scheme.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where scheme.id = target_scheme_id
      and year.school_id = actor.school_id
    for update of scheme;

    if not found then
      raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
        using errcode = 'P0002';
    end if;
    if existing.status <> 'DRAFT' then
      raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE'
        using errcode = '55000';
    end if;
    if existing.updated_at is distinct from expected_updated_at then
      perform internal.raise_configuration_conflict();
    end if;

    update public.assessment_schemes
    set
      term_id = target_term_id,
      grade_level_id = target_grade_level_id,
      subject_id = target_subject_id,
      name = btrim(scheme_name),
      effective_from = scheme_effective_from
    where id = existing.id
    returning * into changed;

    delete from public.assessment_components
    where assessment_scheme_id = changed.id;
    audit_action := 'ACADEMIC_CONFIGURATION_UPDATED';
  end if;

  insert into public.assessment_components (
    assessment_scheme_id,
    name,
    component_code,
    maximum_score,
    weight_percentage,
    sort_order,
    is_required
  )
  select
    changed.id,
    btrim(component.name),
    upper(btrim(component.component_code)),
    component.maximum_score,
    component.weight_percentage,
    component.sort_order,
    coalesce(component.is_required, true)
  from jsonb_to_recordset(scheme_components) component(
    name text,
    component_code text,
    maximum_score numeric,
    weight_percentage numeric,
    sort_order integer,
    is_required boolean
  );

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    audit_action,
    'assessment_scheme',
    changed.id,
    case
      when target_scheme_id is null then null
      else to_jsonb(existing) - array['created_at', 'updated_at']::text[]
    end,
    (
      to_jsonb(changed) - array['created_at', 'updated_at']::text[]
    ) || jsonb_build_object('components', scheme_components)
  );

  return query select changed.id, changed.status::text, changed.updated_at;
end
$$;

create or replace function public.create_assessment_scheme_version(
  source_scheme_id uuid,
  expected_updated_at timestamptz,
  scheme_name text,
  scheme_effective_from date,
  scheme_components jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  source public.assessment_schemes%rowtype;
  created public.assessment_schemes%rowtype;
  next_version integer;
begin
  select * into actor from internal.require_configuration_actor();

  select scheme.* into source
  from public.assessment_schemes scheme
  join public.terms term on term.id = scheme.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where scheme.id = source_scheme_id
    and year.school_id = actor.school_id
  for update of scheme;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if source.status not in ('ACTIVE', 'RETIRED') then
    raise exception 'ACADEMIC_CONFIGURATION_VERSION_SOURCE_INVALID'
      using errcode = '55000';
  end if;
  if source.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;
  if jsonb_typeof(scheme_components) <> 'array'
     or jsonb_array_length(scheme_components) = 0 then
    raise exception 'ACADEMIC_CONFIGURATION_COMPONENTS_INVALID'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.terms term
    where term.id = source.term_id
      and scheme_effective_from between term.starts_on and term.ends_on
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID'
      using errcode = '23514';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.assessment_schemes
  where term_id = source.term_id
    and grade_level_id = source.grade_level_id
    and subject_id = source.subject_id;

  insert into public.assessment_schemes (
    term_id,
    grade_level_id,
    subject_id,
    name,
    version,
    status,
    effective_from,
    created_by
  )
  values (
    source.term_id,
    source.grade_level_id,
    source.subject_id,
    btrim(scheme_name),
    next_version,
    'DRAFT',
    scheme_effective_from,
    actor.membership_id
  )
  returning * into created;

  insert into public.assessment_components (
    assessment_scheme_id,
    name,
    component_code,
    maximum_score,
    weight_percentage,
    sort_order,
    is_required
  )
  select
    created.id,
    btrim(component.name),
    upper(btrim(component.component_code)),
    component.maximum_score,
    component.weight_percentage,
    component.sort_order,
    coalesce(component.is_required, true)
  from jsonb_to_recordset(scheme_components) component(
    name text,
    component_code text,
    maximum_score numeric,
    weight_percentage numeric,
    sort_order integer,
    is_required boolean
  );

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_VERSION_CREATED',
    'assessment_scheme',
    created.id,
    null,
    (
      to_jsonb(created) - array['created_at', 'updated_at']::text[]
    ) || jsonb_build_object(
      'source_record_id', source.id,
      'components', scheme_components
    )
  );

  return query select created.id, created.status::text, created.updated_at;
end
$$;

grant execute on function public.create_assessment_scheme_version(
  uuid, timestamptz, text, date, jsonb
) to authenticated;

create or replace function public.save_grading_scale_draft(
  target_scale_id uuid,
  expected_updated_at timestamptz,
  target_academic_year_id uuid,
  target_grade_level_id uuid,
  scale_name text,
  scale_effective_from date,
  scale_bands jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.grading_scales%rowtype;
  changed public.grading_scales%rowtype;
  next_version integer;
  audit_action text;
begin
  select * into actor from internal.require_configuration_actor();
  perform internal.assert_rule_scope(
    actor.school_id,
    target_academic_year_id,
    target_grade_level_id
  );

  if jsonb_typeof(scale_bands) <> 'array'
     or jsonb_array_length(scale_bands) = 0 then
    raise exception 'ACADEMIC_CONFIGURATION_BANDS_INVALID'
      using errcode = '22023';
  end if;

  if target_scale_id is null then
    select coalesce(max(version), 0) + 1 into next_version
    from public.grading_scales
    where school_id = actor.school_id
      and academic_year_id is not distinct from target_academic_year_id
      and grade_level_id is not distinct from target_grade_level_id;

    insert into public.grading_scales (
      school_id,
      academic_year_id,
      grade_level_id,
      name,
      version,
      is_active,
      effective_from,
      created_by
    )
    values (
      actor.school_id,
      target_academic_year_id,
      target_grade_level_id,
      btrim(scale_name),
      next_version,
      false,
      scale_effective_from,
      actor.membership_id
    )
    returning * into changed;
    audit_action := 'ACADEMIC_CONFIGURATION_CREATED';
  else
    select * into existing
    from public.grading_scales
    where id = target_scale_id
      and school_id = actor.school_id
    for update;

    if not found then
      raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
        using errcode = 'P0002';
    end if;
    if existing.is_active or existing.retired_at is not null then
      raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE'
        using errcode = '55000';
    end if;
    if existing.updated_at is distinct from expected_updated_at then
      perform internal.raise_configuration_conflict();
    end if;

    update public.grading_scales
    set
      academic_year_id = target_academic_year_id,
      grade_level_id = target_grade_level_id,
      name = btrim(scale_name),
      effective_from = scale_effective_from
    where id = existing.id
    returning * into changed;

    delete from public.grading_bands
    where grading_scale_id = changed.id;
    audit_action := 'ACADEMIC_CONFIGURATION_UPDATED';
  end if;

  insert into public.grading_bands (
    grading_scale_id,
    minimum_score,
    maximum_score,
    grade,
    aggregate_points,
    description,
    is_pass,
    sort_order
  )
  select
    changed.id,
    band.minimum_score,
    band.maximum_score,
    btrim(band.grade),
    band.aggregate_points,
    nullif(btrim(band.description), ''),
    coalesce(band.is_pass, true),
    band.sort_order
  from jsonb_to_recordset(scale_bands) band(
    minimum_score numeric,
    maximum_score numeric,
    grade text,
    aggregate_points integer,
    description text,
    is_pass boolean,
    sort_order integer
  );

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    audit_action,
    'grading_scale',
    changed.id,
    case
      when target_scale_id is null then null
      else to_jsonb(existing)
        - array['school_id', 'created_at', 'updated_at']::text[]
    end,
    (
      to_jsonb(changed)
        - array['school_id', 'created_at', 'updated_at']::text[]
    ) || jsonb_build_object('bands', scale_bands)
  );

  return query select changed.id, 'DRAFT', changed.updated_at;
end
$$;

create or replace function public.create_grading_scale_version(
  source_scale_id uuid,
  expected_updated_at timestamptz,
  scale_name text,
  scale_effective_from date,
  scale_bands jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  source public.grading_scales%rowtype;
  created public.grading_scales%rowtype;
  next_version integer;
begin
  select * into actor from internal.require_configuration_actor();

  select * into source
  from public.grading_scales
  where id = source_scale_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if not source.is_active and source.retired_at is null then
    raise exception 'ACADEMIC_CONFIGURATION_VERSION_SOURCE_INVALID'
      using errcode = '55000';
  end if;
  if source.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;
  if jsonb_typeof(scale_bands) <> 'array'
     or jsonb_array_length(scale_bands) = 0 then
    raise exception 'ACADEMIC_CONFIGURATION_BANDS_INVALID'
      using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.grading_scales
  where school_id = actor.school_id
    and academic_year_id is not distinct from source.academic_year_id
    and grade_level_id is not distinct from source.grade_level_id;

  insert into public.grading_scales (
    school_id,
    academic_year_id,
    grade_level_id,
    name,
    version,
    is_active,
    effective_from,
    created_by
  )
  values (
    actor.school_id,
    source.academic_year_id,
    source.grade_level_id,
    btrim(scale_name),
    next_version,
    false,
    scale_effective_from,
    actor.membership_id
  )
  returning * into created;

  insert into public.grading_bands (
    grading_scale_id,
    minimum_score,
    maximum_score,
    grade,
    aggregate_points,
    description,
    is_pass,
    sort_order
  )
  select
    created.id,
    band.minimum_score,
    band.maximum_score,
    btrim(band.grade),
    band.aggregate_points,
    nullif(btrim(band.description), ''),
    coalesce(band.is_pass, true),
    band.sort_order
  from jsonb_to_recordset(scale_bands) band(
    minimum_score numeric,
    maximum_score numeric,
    grade text,
    aggregate_points integer,
    description text,
    is_pass boolean,
    sort_order integer
  );

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_VERSION_CREATED',
    'grading_scale',
    created.id,
    null,
    (
      to_jsonb(created)
        - array['school_id', 'created_at', 'updated_at']::text[]
    ) || jsonb_build_object(
      'source_record_id', source.id,
      'bands', scale_bands
    )
  );

  return query select created.id, 'DRAFT', created.updated_at;
end
$$;

grant execute on function public.create_grading_scale_version(
  uuid, timestamptz, text, date, jsonb
) to authenticated;

create or replace function internal.assert_ranking_configuration(
  rule_ranking_basis public.ranking_basis,
  rule_configuration jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if jsonb_typeof(rule_configuration) <> 'object'
     or jsonb_typeof(rule_configuration -> 'schema_version') <> 'number'
     or (rule_configuration ->> 'schema_version')::integer <> 1
     or jsonb_typeof(rule_configuration -> 'direction') <> 'string'
     or rule_configuration ->> 'direction' not in ('ASC', 'DESC')
     or jsonb_typeof(rule_configuration -> 'include_incomplete') <> 'boolean'
     or exists (
       select 1
       from jsonb_object_keys(rule_configuration) as key
       where key not in (
         'schema_version',
         'direction',
         'include_incomplete',
         'minimum_subjects',
         'configured_metric'
       )
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_RANKING_RULE_INVALID'
      using errcode = '22023';
  end if;

  if rule_configuration ? 'minimum_subjects'
     and jsonb_typeof(rule_configuration -> 'minimum_subjects') <> 'null'
     and (
       jsonb_typeof(rule_configuration -> 'minimum_subjects') <> 'number'
       or (rule_configuration ->> 'minimum_subjects') !~ '^[0-9]+$'
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_RANKING_RULE_INVALID'
      using errcode = '22023';
  end if;

  if rule_ranking_basis in ('TOTAL', 'AVERAGE')
     and (
       rule_configuration ->> 'direction' <> 'DESC'
       or rule_configuration ? 'configured_metric'
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_RANKING_RULE_INVALID'
      using errcode = '22023';
  end if;

  if rule_ranking_basis = 'AGGREGATE'
     and (
       rule_configuration ->> 'direction' <> 'ASC'
       or rule_configuration ? 'configured_metric'
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_RANKING_RULE_INVALID'
      using errcode = '22023';
  end if;

  if rule_ranking_basis = 'CONFIGURED'
     and (
       jsonb_typeof(rule_configuration -> 'configured_metric') <> 'string'
       or rule_configuration ->> 'configured_metric'
         not in ('TOTAL', 'AVERAGE', 'AGGREGATE')
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_RANKING_RULE_INVALID'
      using errcode = '22023';
  end if;
end
$$;

create or replace function internal.assert_promotion_configuration(
  actor_school_id uuid,
  target_grade_level_id uuid,
  rule_required_subjects jsonb,
  rule_additional_configuration jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if jsonb_typeof(rule_required_subjects) <> 'array'
     or jsonb_typeof(rule_additional_configuration) <> 'object'
     or jsonb_typeof(
       rule_additional_configuration -> 'schema_version'
     ) <> 'number'
     or (
       rule_additional_configuration ->> 'schema_version'
     )::integer <> 1
     or jsonb_typeof(
       rule_additional_configuration -> 'require_all_required_subjects'
     ) <> 'boolean'
     or jsonb_typeof(
       rule_additional_configuration -> 'allow_manual_review'
     ) <> 'boolean'
     or exists (
       select 1
       from jsonb_object_keys(rule_additional_configuration) as key
       where key not in (
         'schema_version',
         'require_all_required_subjects',
         'allow_manual_review'
       )
     ) then
    raise exception 'ACADEMIC_CONFIGURATION_PROMOTION_RULE_INVALID'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(rule_required_subjects) as rule
    where jsonb_typeof(rule) <> 'object'
       or jsonb_typeof(rule -> 'subject_id') <> 'string'
       or rule ->> 'subject_id'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(rule -> 'minimum_score') <> 'number'
       or (rule ->> 'minimum_score')::numeric not between 0 and 100
       or exists (
         select 1
         from jsonb_object_keys(rule) as key
         where key not in ('subject_id', 'minimum_score')
       )
  ) or (
    select count(*)
    from jsonb_array_elements(rule_required_subjects)
  ) <> (
    select count(distinct rule ->> 'subject_id')
    from jsonb_array_elements(rule_required_subjects) as rule
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_PROMOTION_RULE_INVALID'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(rule_required_subjects) as rule
    left join public.subjects subject
      on subject.id = (rule ->> 'subject_id')::uuid
      and subject.school_id = actor_school_id
    where subject.id is null
       or (
         target_grade_level_id is not null
         and not exists (
           select 1
           from public.grade_level_subjects mapping
           where mapping.grade_level_id = target_grade_level_id
             and mapping.subject_id = subject.id
         )
       )
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID'
      using errcode = '23514';
  end if;
end
$$;

revoke all on function internal.assert_ranking_configuration(
  public.ranking_basis, jsonb
) from public, anon, authenticated;
revoke all on function internal.assert_promotion_configuration(
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated;

create or replace function public.save_ranking_rule(
  target_rule_id uuid,
  expected_updated_at timestamptz,
  target_academic_year_id uuid,
  target_grade_level_id uuid,
  rule_name text,
  rule_ranking_basis public.ranking_basis,
  rule_tie_method public.ranking_tie_method,
  rule_configuration jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.ranking_rules%rowtype;
  changed public.ranking_rules%rowtype;
  next_version integer;
  audit_action text;
begin
  select * into actor from internal.require_configuration_actor();
  perform internal.assert_rule_scope(
    actor.school_id,
    target_academic_year_id,
    target_grade_level_id
  );
  perform internal.assert_ranking_configuration(
    rule_ranking_basis,
    rule_configuration
  );

  if target_rule_id is null then
    select coalesce(max(version), 0) + 1 into next_version
    from public.ranking_rules
    where school_id = actor.school_id
      and academic_year_id is not distinct from target_academic_year_id
      and grade_level_id is not distinct from target_grade_level_id;

    insert into public.ranking_rules (
      school_id,
      academic_year_id,
      grade_level_id,
      name,
      version,
      ranking_basis,
      tie_method,
      configuration,
      created_by
    )
    values (
      actor.school_id,
      target_academic_year_id,
      target_grade_level_id,
      btrim(rule_name),
      next_version,
      rule_ranking_basis,
      rule_tie_method,
      rule_configuration,
      actor.membership_id
    )
    returning * into changed;
    audit_action := 'ACADEMIC_CONFIGURATION_CREATED';
  else
    select * into existing
    from public.ranking_rules
    where id = target_rule_id
      and school_id = actor.school_id
    for update;

    if not found then
      raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
        using errcode = 'P0002';
    end if;
    if existing.is_active or existing.retired_at is not null then
      raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE'
        using errcode = '55000';
    end if;
    if existing.updated_at is distinct from expected_updated_at then
      perform internal.raise_configuration_conflict();
    end if;

    update public.ranking_rules
    set
      academic_year_id = target_academic_year_id,
      grade_level_id = target_grade_level_id,
      name = btrim(rule_name),
      ranking_basis = rule_ranking_basis,
      tie_method = rule_tie_method,
      configuration = rule_configuration
    where id = existing.id
    returning * into changed;
    audit_action := 'ACADEMIC_CONFIGURATION_UPDATED';
  end if;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    audit_action,
    'ranking_rule',
    changed.id,
    case
      when target_rule_id is null then null
      else to_jsonb(existing)
        - array['school_id', 'created_at', 'updated_at']::text[]
    end,
    to_jsonb(changed)
      - array['school_id', 'created_at', 'updated_at']::text[]
  );

  return query select changed.id, 'DRAFT', changed.updated_at;
end
$$;

create or replace function public.create_ranking_rule_version(
  source_rule_id uuid,
  expected_updated_at timestamptz,
  rule_name text,
  rule_ranking_basis public.ranking_basis,
  rule_tie_method public.ranking_tie_method,
  rule_configuration jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  source public.ranking_rules%rowtype;
  created public.ranking_rules%rowtype;
  next_version integer;
begin
  select * into actor from internal.require_configuration_actor();

  select * into source
  from public.ranking_rules
  where id = source_rule_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if not source.is_active and source.retired_at is null then
    raise exception 'ACADEMIC_CONFIGURATION_VERSION_SOURCE_INVALID'
      using errcode = '55000';
  end if;
  if source.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;
  perform internal.assert_ranking_configuration(
    rule_ranking_basis,
    rule_configuration
  );

  select coalesce(max(version), 0) + 1 into next_version
  from public.ranking_rules
  where school_id = actor.school_id
    and academic_year_id is not distinct from source.academic_year_id
    and grade_level_id is not distinct from source.grade_level_id;

  insert into public.ranking_rules (
    school_id,
    academic_year_id,
    grade_level_id,
    name,
    version,
    ranking_basis,
    tie_method,
    configuration,
    created_by
  )
  values (
    actor.school_id,
    source.academic_year_id,
    source.grade_level_id,
    btrim(rule_name),
    next_version,
    rule_ranking_basis,
    rule_tie_method,
    rule_configuration,
    actor.membership_id
  )
  returning * into created;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_VERSION_CREATED',
    'ranking_rule',
    created.id,
    null,
    (
      to_jsonb(created)
        - array['school_id', 'created_at', 'updated_at']::text[]
    ) || jsonb_build_object('source_record_id', source.id)
  );

  return query select created.id, 'DRAFT', created.updated_at;
end
$$;

grant execute on function public.create_ranking_rule_version(
  uuid,
  timestamptz,
  text,
  public.ranking_basis,
  public.ranking_tie_method,
  jsonb
) to authenticated;

create or replace function public.save_promotion_rule(
  target_rule_id uuid,
  expected_updated_at timestamptz,
  target_academic_year_id uuid,
  target_grade_level_id uuid,
  rule_name text,
  rule_minimum_average numeric,
  rule_maximum_aggregate integer,
  rule_minimum_subjects_passed integer,
  rule_minimum_attendance_percentage numeric,
  rule_required_subjects jsonb,
  rule_additional_configuration jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.promotion_rules%rowtype;
  changed public.promotion_rules%rowtype;
  next_version integer;
  audit_action text;
begin
  select * into actor from internal.require_configuration_actor();
  perform internal.assert_rule_scope(
    actor.school_id,
    target_academic_year_id,
    target_grade_level_id
  );
  perform internal.assert_promotion_configuration(
    actor.school_id,
    target_grade_level_id,
    rule_required_subjects,
    rule_additional_configuration
  );

  if target_rule_id is null then
    select coalesce(max(version), 0) + 1 into next_version
    from public.promotion_rules
    where school_id = actor.school_id
      and academic_year_id is not distinct from target_academic_year_id
      and grade_level_id is not distinct from target_grade_level_id;

    insert into public.promotion_rules (
      school_id,
      academic_year_id,
      grade_level_id,
      name,
      version,
      minimum_average,
      maximum_aggregate,
      minimum_subjects_passed,
      minimum_attendance_percentage,
      required_subject_rules,
      additional_rules,
      created_by
    )
    values (
      actor.school_id,
      target_academic_year_id,
      target_grade_level_id,
      btrim(rule_name),
      next_version,
      rule_minimum_average,
      rule_maximum_aggregate,
      rule_minimum_subjects_passed,
      rule_minimum_attendance_percentage,
      rule_required_subjects,
      rule_additional_configuration,
      actor.membership_id
    )
    returning * into changed;
    audit_action := 'ACADEMIC_CONFIGURATION_CREATED';
  else
    select * into existing
    from public.promotion_rules
    where id = target_rule_id
      and school_id = actor.school_id
    for update;

    if not found then
      raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
        using errcode = 'P0002';
    end if;
    if existing.is_active or existing.retired_at is not null then
      raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE'
        using errcode = '55000';
    end if;
    if existing.updated_at is distinct from expected_updated_at then
      perform internal.raise_configuration_conflict();
    end if;

    update public.promotion_rules
    set
      academic_year_id = target_academic_year_id,
      grade_level_id = target_grade_level_id,
      name = btrim(rule_name),
      minimum_average = rule_minimum_average,
      maximum_aggregate = rule_maximum_aggregate,
      minimum_subjects_passed = rule_minimum_subjects_passed,
      minimum_attendance_percentage = rule_minimum_attendance_percentage,
      required_subject_rules = rule_required_subjects,
      additional_rules = rule_additional_configuration
    where id = existing.id
    returning * into changed;
    audit_action := 'ACADEMIC_CONFIGURATION_UPDATED';
  end if;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    audit_action,
    'promotion_rule',
    changed.id,
    case
      when target_rule_id is null then null
      else to_jsonb(existing)
        - array['school_id', 'created_at', 'updated_at']::text[]
    end,
    to_jsonb(changed)
      - array['school_id', 'created_at', 'updated_at']::text[]
  );

  return query select changed.id, 'DRAFT', changed.updated_at;
end
$$;

create or replace function public.create_promotion_rule_version(
  source_rule_id uuid,
  expected_updated_at timestamptz,
  rule_name text,
  rule_minimum_average numeric,
  rule_maximum_aggregate integer,
  rule_minimum_subjects_passed integer,
  rule_minimum_attendance_percentage numeric,
  rule_required_subjects jsonb,
  rule_additional_configuration jsonb
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  source public.promotion_rules%rowtype;
  created public.promotion_rules%rowtype;
  next_version integer;
begin
  select * into actor from internal.require_configuration_actor();

  select * into source
  from public.promotion_rules
  where id = source_rule_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if not source.is_active and source.retired_at is null then
    raise exception 'ACADEMIC_CONFIGURATION_VERSION_SOURCE_INVALID'
      using errcode = '55000';
  end if;
  if source.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;
  perform internal.assert_promotion_configuration(
    actor.school_id,
    source.grade_level_id,
    rule_required_subjects,
    rule_additional_configuration
  );

  select coalesce(max(version), 0) + 1 into next_version
  from public.promotion_rules
  where school_id = actor.school_id
    and academic_year_id is not distinct from source.academic_year_id
    and grade_level_id is not distinct from source.grade_level_id;

  insert into public.promotion_rules (
    school_id,
    academic_year_id,
    grade_level_id,
    name,
    version,
    minimum_average,
    maximum_aggregate,
    minimum_subjects_passed,
    minimum_attendance_percentage,
    required_subject_rules,
    additional_rules,
    created_by
  )
  values (
    actor.school_id,
    source.academic_year_id,
    source.grade_level_id,
    btrim(rule_name),
    next_version,
    rule_minimum_average,
    rule_maximum_aggregate,
    rule_minimum_subjects_passed,
    rule_minimum_attendance_percentage,
    rule_required_subjects,
    rule_additional_configuration,
    actor.membership_id
  )
  returning * into created;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'ACADEMIC_CONFIGURATION_VERSION_CREATED',
    'promotion_rule',
    created.id,
    null,
    (
      to_jsonb(created)
        - array['school_id', 'created_at', 'updated_at']::text[]
    ) || jsonb_build_object('source_record_id', source.id)
  );

  return query select created.id, 'DRAFT', created.updated_at;
end
$$;

grant execute on function public.create_promotion_rule_version(
  uuid,
  timestamptz,
  text,
  numeric,
  integer,
  integer,
  numeric,
  jsonb,
  jsonb
) to authenticated;

create or replace function public.set_grade_level_active(
  target_grade_level_id uuid,
  expected_updated_at timestamptz,
  target_active boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.grade_levels%rowtype;
  changed public.grade_levels%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing
  from public.grade_levels
  where id = target_grade_level_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.grade_levels
  set is_active = target_active
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    case
      when target_active
        then 'ACADEMIC_CONFIGURATION_ACTIVATED'
      else 'ACADEMIC_CONFIGURATION_DEACTIVATED'
    end,
    'grade_level',
    changed.id,
    jsonb_build_object('is_active', existing.is_active),
    jsonb_build_object('is_active', changed.is_active)
  );

  return query
  select
    changed.id,
    case when changed.is_active then 'ACTIVE' else 'INACTIVE' end,
    changed.updated_at;
end
$$;

create or replace function public.set_subject_active(
  target_subject_id uuid,
  expected_updated_at timestamptz,
  target_active boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.subjects%rowtype;
  changed public.subjects%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing
  from public.subjects
  where id = target_subject_id
    and school_id = actor.school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.subjects
  set is_active = target_active
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    case
      when target_active
        then 'ACADEMIC_CONFIGURATION_ACTIVATED'
      else 'ACADEMIC_CONFIGURATION_DEACTIVATED'
    end,
    'subject',
    changed.id,
    jsonb_build_object('is_active', existing.is_active),
    jsonb_build_object('is_active', changed.is_active)
  );

  return query
  select
    changed.id,
    case when changed.is_active then 'ACTIVE' else 'INACTIVE' end,
    changed.updated_at;
end
$$;

create or replace function public.set_class_section_active(
  target_class_section_id uuid,
  expected_updated_at timestamptz,
  target_active boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  existing public.class_sections%rowtype;
  changed public.class_sections%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select section.* into existing
  from public.class_sections section
  join public.academic_years year on year.id = section.academic_year_id
  where section.id = target_class_section_id
    and year.school_id = actor.school_id
  for update of section;

  if not found then
    raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.academic_years
    where id = existing.academic_year_id
      and status in ('DRAFT', 'ACTIVE')
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_YEAR_UNAVAILABLE'
      using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then
    perform internal.raise_configuration_conflict();
  end if;

  update public.class_sections
  set is_active = target_active
  where id = existing.id
  returning * into changed;

  perform internal.record_configuration_audit(
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    case
      when target_active
        then 'ACADEMIC_CONFIGURATION_ACTIVATED'
      else 'ACADEMIC_CONFIGURATION_DEACTIVATED'
    end,
    'class_section',
    changed.id,
    jsonb_build_object('is_active', existing.is_active),
    jsonb_build_object('is_active', changed.is_active)
  );

  return query
  select
    changed.id,
    case when changed.is_active then 'ACTIVE' else 'INACTIVE' end,
    changed.updated_at;
end
$$;

-- New functions receive EXECUTE for PUBLIC by default. Keep the corrective
-- browser surface as narrow as migration 12: anonymous roles receive nothing,
-- authenticated callers receive only the six actor-checked public RPCs, and
-- internal helpers remain inaccessible outside their owning functions/triggers.
revoke execute on function public.create_grade_level_subject(
  uuid, uuid, boolean, boolean, integer
) from public, anon;
revoke execute on function public.update_grade_level_subject(
  uuid, timestamptz, boolean, boolean, integer
) from public, anon;
revoke execute on function public.create_assessment_scheme_version(
  uuid, timestamptz, text, date, jsonb
) from public, anon;
revoke execute on function public.create_grading_scale_version(
  uuid, timestamptz, text, date, jsonb
) from public, anon;
revoke execute on function public.create_ranking_rule_version(
  uuid, timestamptz, text, public.ranking_basis,
  public.ranking_tie_method, jsonb
) from public, anon;
revoke execute on function public.create_promotion_rule_version(
  uuid, timestamptz, text, numeric, integer, integer, numeric, jsonb, jsonb
) from public, anon;

revoke execute on function internal.class_section_has_dependencies(uuid)
  from public, anon, authenticated;
revoke execute on function internal.protect_class_section_identity()
  from public, anon, authenticated;
revoke execute on function internal.protect_curriculum_mapping_identity()
  from public, anon, authenticated;
revoke execute on function internal.assert_ranking_configuration(
  public.ranking_basis, jsonb
) from public, anon, authenticated;
revoke execute on function internal.assert_promotion_configuration(
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated;
