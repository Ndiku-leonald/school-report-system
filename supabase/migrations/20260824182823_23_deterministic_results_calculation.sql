-- Stage 11: deterministic results calculation from locked, latest mark-sheet
-- revisions. This migration deliberately stops at calculated academic values;
-- report snapshots, PDFs, publication, and promotion remain later stages.

create type public.calculated_subject_status as enum (
  'COMPLETE',
  'INCOMPLETE',
  'EXEMPTED'
);

create table public.aggregate_classification_scales (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid references public.academic_years(id) on delete restrict,
  grade_level_id uuid references public.grade_levels(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 150),
  version integer not null default 1 check (version > 0),
  is_active boolean not null default false,
  retired_at timestamptz,
  created_by uuid references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aggregate_classification_scope_version_unique unique (
    school_id,
    academic_year_id,
    grade_level_id,
    version
  )
);

create unique index aggregate_classification_one_active_scope_idx
  on public.aggregate_classification_scales (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where is_active and retired_at is null;

create unique index aggregate_classification_scope_version_idx
  on public.aggregate_classification_scales (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

create table public.aggregate_classification_bands (
  id uuid primary key default gen_random_uuid(),
  scale_id uuid not null references public.aggregate_classification_scales(id) on delete restrict,
  minimum_aggregate integer not null check (minimum_aggregate >= 0),
  maximum_aggregate integer not null check (maximum_aggregate >= minimum_aggregate),
  label text not null check (length(btrim(label)) between 1 and 80),
  description text,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aggregate_classification_band_order_unique unique (scale_id, sort_order),
  constraint aggregate_classification_band_range_exclusion exclude using gist (
    scale_id with =,
    int8range(minimum_aggregate::bigint, (maximum_aggregate + 1)::bigint, '[)') with &&
  )
);

create table public.result_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  grade_level_id uuid not null references public.grade_levels(id) on delete restrict,
  version integer not null check (version > 0),
  supersedes_run_id uuid references public.result_calculation_runs(id) on delete restrict,
  grading_scale_id uuid not null references public.grading_scales(id) on delete restrict,
  ranking_rule_id uuid not null references public.ranking_rules(id) on delete restrict,
  aggregate_classification_scale_id uuid references public.aggregate_classification_scales(id) on delete restrict,
  input_checksum text not null check (length(btrim(input_checksum)) = 64),
  output_checksum text not null check (length(btrim(output_checksum)) = 64),
  created_by uuid references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint result_calculation_term_grade_version_unique unique (term_id, grade_level_id, version),
  constraint result_calculation_not_self_superseding check (
    supersedes_run_id is null or supersedes_run_id <> id
  )
);

create unique index result_calculation_one_direct_successor_idx
  on public.result_calculation_runs (supersedes_run_id)
  where supersedes_run_id is not null;

create table public.result_calculation_sources (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.result_calculation_runs(id) on delete restrict,
  mark_sheet_id uuid not null references public.mark_sheets(id) on delete restrict,
  class_section_id uuid not null references public.class_sections(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  mark_sheet_version integer not null check (mark_sheet_version > 0),
  assessment_scheme_id uuid not null references public.assessment_schemes(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint result_calculation_source_unique unique (calculation_run_id, mark_sheet_id)
);

create table public.calculated_student_results (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.result_calculation_runs(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  class_section_id uuid not null references public.class_sections(id) on delete restrict,
  subject_count integer not null check (subject_count >= 0),
  complete_subject_count integer not null check (complete_subject_count >= 0),
  subjects_passed integer not null check (subjects_passed >= 0),
  overall_total numeric(10,2) check (overall_total is null or overall_total >= 0),
  overall_average numeric(6,2) check (overall_average is null or overall_average between 0 and 100),
  overall_grade text,
  aggregate_total integer check (aggregate_total is null or aggregate_total >= 0),
  aggregate_classification text,
  is_complete boolean not null,
  ranking_eligible boolean not null,
  ranking_metric numeric(10,2),
  class_position integer check (class_position is null or class_position > 0),
  grade_level_position integer check (grade_level_position is null or grade_level_position > 0),
  class_tie_size integer not null default 0 check (class_tie_size >= 0),
  grade_level_tie_size integer not null default 0 check (grade_level_tie_size >= 0),
  class_is_tied boolean not null default false,
  grade_level_is_tied boolean not null default false,
  created_at timestamptz not null default now(),
  constraint calculated_student_result_unique unique (calculation_run_id, enrollment_id)
);

create table public.calculated_subject_results (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.result_calculation_runs(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  class_section_id uuid not null references public.class_sections(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  mark_sheet_id uuid not null references public.mark_sheets(id) on delete restrict,
  subject_status public.calculated_subject_status not null,
  subject_score numeric(6,2) check (subject_score is null or subject_score between 0 and 100),
  grade text,
  aggregate_points integer check (aggregate_points is null or aggregate_points > 0),
  is_pass boolean,
  assessed_weight numeric(7,2) not null check (assessed_weight >= 0),
  has_absence boolean not null default false,
  has_exemption boolean not null default false,
  subject_position integer check (subject_position is null or subject_position > 0),
  subject_tie_size integer not null default 0 check (subject_tie_size >= 0),
  subject_is_tied boolean not null default false,
  created_at timestamptz not null default now(),
  constraint calculated_subject_result_unique unique (calculation_run_id, enrollment_id, subject_id)
);

create table public.calculated_component_explanations (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.result_calculation_runs(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  class_section_id uuid not null references public.class_sections(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  mark_sheet_id uuid not null references public.mark_sheets(id) on delete restrict,
  assessment_component_id uuid not null references public.assessment_components(id) on delete restrict,
  component_name text not null,
  attendance_status public.assessment_attendance_status,
  entered_score numeric(7,2),
  maximum_score numeric(7,2) not null,
  weight_percentage numeric(7,2) not null,
  included_weight numeric(7,2) not null default 0,
  weighted_contribution numeric(12,6) not null default 0,
  created_at timestamptz not null default now(),
  constraint calculated_component_explanation_unique unique (
    calculation_run_id, enrollment_id, subject_id, assessment_component_id
  )
);

create table public.calculated_subject_performance (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.result_calculation_runs(id) on delete restrict,
  class_section_id uuid not null references public.class_sections(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  mean_score numeric(6,2),
  minimum_score numeric(6,2),
  maximum_score numeric(6,2),
  pass_rate numeric(6,2),
  complete_count integer not null default 0,
  incomplete_count integer not null default 0,
  exempted_count integer not null default 0,
  grade_distribution jsonb not null default '{}'::jsonb check (jsonb_typeof(grade_distribution) = 'object'),
  created_at timestamptz not null default now(),
  constraint calculated_subject_performance_unique unique (calculation_run_id, class_section_id, subject_id)
);

create or replace function internal.validate_aggregate_classification_scope()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare year_school_id uuid; grade_school_id uuid;
begin
  if new.academic_year_id is not null then
    select school_id into year_school_id from public.academic_years where id = new.academic_year_id;
    if year_school_id is distinct from new.school_id then
      raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID' using errcode = '23514';
    end if;
  end if;
  if new.grade_level_id is not null then
    select school_id into grade_school_id from public.grade_levels where id = new.grade_level_id;
    if grade_school_id is distinct from new.school_id then
      raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID' using errcode = '23514';
    end if;
  end if;
  if new.created_by is not null and not exists (
    select 1 from public.school_staff_memberships
    where id = new.created_by and school_id = new.school_id
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function internal.protect_aggregate_classification_lifecycle()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_active or old.retired_at is not null then
      raise exception 'Active and retired classification scales are immutable.' using errcode = '55000';
    end if;
    return old;
  end if;
  if old.is_active = false and old.retired_at is null then
    if new.is_active = false and new.retired_at is null then return new; end if;
    if new.is_active and new.retired_at is null
       and (to_jsonb(new) - array['is_active','updated_at']::text[])
           = (to_jsonb(old) - array['is_active','updated_at']::text[]) then return new; end if;
    raise exception 'A draft classification scale may only activate without definition changes.' using errcode = '55000';
  end if;
  if old.is_active and old.retired_at is null
     and new.is_active = false and new.retired_at is not null
     and (to_jsonb(new) - array['is_active','retired_at','updated_at']::text[])
         = (to_jsonb(old) - array['is_active','retired_at','updated_at']::text[]) then return new; end if;
  raise exception 'Active and retired classification scales are immutable.' using errcode = '55000';
end;
$$;

create or replace function internal.protect_aggregate_classification_bands()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare source_scale uuid; target_scale uuid;
begin
  source_scale := case when tg_op = 'INSERT' then null else old.scale_id end;
  target_scale := case when tg_op = 'DELETE' then null else new.scale_id end;
  if exists (
    select 1 from public.aggregate_classification_scales
    where id in (source_scale, target_scale) and (is_active or retired_at is not null)
  ) then
    raise exception 'Bands of active and retired classification scales are immutable.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists aggregate_classification_scope on public.aggregate_classification_scales;
create trigger aggregate_classification_scope before insert or update on public.aggregate_classification_scales
for each row execute function internal.validate_aggregate_classification_scope();
drop trigger if exists aggregate_classification_lifecycle on public.aggregate_classification_scales;
create trigger aggregate_classification_lifecycle before update or delete on public.aggregate_classification_scales
for each row execute function internal.protect_aggregate_classification_lifecycle();
drop trigger if exists aggregate_classification_bands_lifecycle on public.aggregate_classification_bands;
create trigger aggregate_classification_bands_lifecycle before insert or update or delete on public.aggregate_classification_bands
for each row execute function internal.protect_aggregate_classification_bands();
create trigger aggregate_classification_updated_at before update on public.aggregate_classification_scales
for each row execute function internal.set_updated_at();
create trigger aggregate_classification_band_updated_at before update on public.aggregate_classification_bands
for each row execute function internal.set_updated_at();

create or replace function internal.current_results_actor()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select membership.profile_id, membership.id, membership.school_id
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  where auth.uid() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE' and school.is_active
    and internal.current_user_has_permission(membership.school_id, 'REPORTS_GENERATE');
$$;

create or replace function internal.require_results_actor()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query select * from internal.current_results_actor();
  if not found then raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501'; end if;
end;
$$;

create or replace function internal.current_results_reader()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select membership.profile_id, membership.id, membership.school_id
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  where auth.uid() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE' and school.is_active
    and (
      internal.current_user_has_permission(membership.school_id, 'REPORTS_VIEW_ALL')
      or internal.current_user_has_permission(membership.school_id, 'REPORTS_GENERATE')
    );
$$;

create or replace function internal.current_academic_configuration_reader()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select membership.profile_id, membership.id, membership.school_id
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  where auth.uid() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE' and school.is_active
    and internal.current_user_has_permission(membership.school_id, 'ACADEMIC_CONFIGURATION_VIEW');
$$;

create or replace function internal.require_results_reader()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query select * from internal.current_results_reader();
  if not found then raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501'; end if;
end;
$$;

create or replace function public.save_aggregate_classification_scale(
  target_scale_id uuid,
  expected_updated_at timestamptz,
  target_academic_year_id uuid,
  target_grade_level_id uuid,
  scale_name text,
  scale_bands jsonb
)
returns table(entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.aggregate_classification_scales%rowtype;
  changed public.aggregate_classification_scales%rowtype; next_version integer;
begin
  select * into actor from internal.require_configuration_actor();
  if jsonb_typeof(scale_bands) <> 'array' or jsonb_array_length(scale_bands) = 0 then
    raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '22023';
  end if;
  perform internal.assert_rule_scope(actor.school_id, target_academic_year_id, target_grade_level_id);
  if target_scale_id is null then
    select coalesce(max(version), 0) + 1 into next_version from public.aggregate_classification_scales
    where school_id = actor.school_id and academic_year_id is not distinct from target_academic_year_id
      and grade_level_id is not distinct from target_grade_level_id;
    insert into public.aggregate_classification_scales
      (school_id, academic_year_id, grade_level_id, name, version, created_by)
    values (actor.school_id, target_academic_year_id, target_grade_level_id, btrim(scale_name), next_version, actor.membership_id)
    returning * into changed;
  else
    select * into existing from public.aggregate_classification_scales
    where id = target_scale_id and school_id = actor.school_id for update;
    if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if existing.is_active or existing.retired_at is not null then
      raise exception 'ACADEMIC_CONFIGURATION_VERSION_IMMUTABLE' using errcode = '55000';
    end if;
    if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
    update public.aggregate_classification_scales
    set academic_year_id = target_academic_year_id, grade_level_id = target_grade_level_id, name = btrim(scale_name)
    where id = existing.id returning * into changed;
  end if;
  delete from public.aggregate_classification_bands where scale_id = changed.id;
  insert into public.aggregate_classification_bands
    (scale_id, minimum_aggregate, maximum_aggregate, label, description, sort_order)
  select changed.id, row_item.minimum_aggregate, row_item.maximum_aggregate,
    btrim(row_item.label), nullif(btrim(row_item.description), ''), row_item.sort_order
  from jsonb_to_recordset(scale_bands) as row_item(
    minimum_aggregate integer, maximum_aggregate integer, label text, description text, sort_order integer
  );
  if exists (
    select 1 from jsonb_to_recordset(scale_bands) as row_item(minimum_aggregate integer, maximum_aggregate integer, label text, description text, sort_order integer)
    where row_item.minimum_aggregate < 0 or row_item.maximum_aggregate < row_item.minimum_aggregate
      or row_item.sort_order <= 0 or length(btrim(coalesce(row_item.label, ''))) = 0
  ) then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '22023'; end if;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    case when target_scale_id is null then 'ACADEMIC_CONFIGURATION_CREATED' else 'ACADEMIC_CONFIGURATION_UPDATED' end,
    'aggregate_classification_scale', changed.id, null,
    jsonb_build_object('version', changed.version, 'band_count', (select count(*) from public.aggregate_classification_bands where scale_id = changed.id)));
  return query select changed.id, 'DRAFT', changed.updated_at;
end;
$$;

create or replace function public.create_aggregate_classification_scale_version(
  source_scale_id uuid, expected_updated_at timestamptz, scale_name text, scale_bands jsonb
)
returns table(entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; source public.aggregate_classification_scales%rowtype; created public.aggregate_classification_scales%rowtype; next_version integer;
begin
  select * into actor from internal.require_configuration_actor();
  select * into source from public.aggregate_classification_scales where id = source_scale_id and school_id = actor.school_id for update;
  if not found or (not source.is_active and source.retired_at is null) then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '55000'; end if;
  if source.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  select coalesce(max(version), 0) + 1 into next_version from public.aggregate_classification_scales
  where school_id = actor.school_id and academic_year_id is not distinct from source.academic_year_id and grade_level_id is not distinct from source.grade_level_id;
  insert into public.aggregate_classification_scales(school_id, academic_year_id, grade_level_id, name, version, created_by)
  values(actor.school_id, source.academic_year_id, source.grade_level_id, btrim(scale_name), next_version, actor.membership_id) returning * into created;
  insert into public.aggregate_classification_bands(scale_id, minimum_aggregate, maximum_aggregate, label, description, sort_order)
  select created.id, minimum_aggregate, maximum_aggregate, label, description, sort_order from public.aggregate_classification_bands where scale_id = source.id;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ACADEMIC_CONFIGURATION_VERSION_CREATED', 'aggregate_classification_scale', created.id, null,
    jsonb_build_object('source_record_id', source.id, 'version', created.version));
  return query select created.id, 'DRAFT', created.updated_at;
end;
$$;

create or replace function public.activate_aggregate_classification_scale(target_scale_id uuid, expected_updated_at timestamptz)
returns table(entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; changed public.aggregate_classification_scales%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  update public.aggregate_classification_scales set is_active = true
  where id = target_scale_id and school_id = actor.school_id and not is_active and retired_at is null and updated_at = expected_updated_at
  returning * into changed;
  if not found then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '55000'; end if;
  if not exists (select 1 from public.aggregate_classification_bands where scale_id = changed.id) then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '23514'; end if;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id, 'ACADEMIC_CONFIGURATION_ACTIVATED', 'aggregate_classification_scale', changed.id, null, jsonb_build_object('version', changed.version));
  return query select changed.id, 'ACTIVE', changed.updated_at;
end;
$$;

create or replace function public.deactivate_aggregate_classification_scale(target_scale_id uuid, expected_updated_at timestamptz)
returns table(entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; changed public.aggregate_classification_scales%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  update public.aggregate_classification_scales set is_active = false, retired_at = now()
  where id = target_scale_id and school_id = actor.school_id and is_active and retired_at is null and updated_at = expected_updated_at
  returning * into changed;
  if not found then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '55000'; end if;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id, 'ACADEMIC_CONFIGURATION_DEACTIVATED', 'aggregate_classification_scale', changed.id, null, jsonb_build_object('version', changed.version));
  return query select changed.id, 'RETIRED', changed.updated_at;
end;
$$;

create or replace function public.list_aggregate_classification_scales()
returns table(id uuid, academic_year_id uuid, grade_level_id uuid, name text, version integer, is_active boolean, retired_at timestamptz, updated_at timestamptz, bands jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.current_academic_configuration_reader();
  if not found then raise exception 'ACADEMIC_CONFIGURATION_FORBIDDEN' using errcode = '42501'; end if;
  return query select scale.id, scale.academic_year_id, scale.grade_level_id, scale.name, scale.version, scale.is_active, scale.retired_at, scale.updated_at,
    coalesce(jsonb_agg(jsonb_build_object('id', band.id, 'minimumAggregate', band.minimum_aggregate, 'maximumAggregate', band.maximum_aggregate, 'label', band.label, 'description', band.description, 'sortOrder', band.sort_order) order by band.sort_order) filter (where band.id is not null), '[]'::jsonb)
  from public.aggregate_classification_scales scale left join public.aggregate_classification_bands band on band.scale_id = scale.id
  where scale.school_id = actor.school_id group by scale.id order by scale.version desc;
end;
$$;

create or replace function internal.validate_results_grading_scale(target_scale_id uuid, target_school_id uuid, target_year_id uuid, target_grade_id uuid, require_active boolean default true)
returns void language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare scale public.grading_scales%rowtype; band_count integer;
begin
  select * into scale from public.grading_scales where id = target_scale_id;
  if not found or scale.school_id is distinct from target_school_id or (require_active and (not scale.is_active or scale.retired_at is not null))
     or (scale.academic_year_id is not null and scale.academic_year_id is distinct from target_year_id)
     or (scale.grade_level_id is not null and scale.grade_level_id is distinct from target_grade_id) then
    raise exception 'RESULT_GRADING_SCALE_INVALID' using errcode = '23514';
  end if;
  select count(*) into band_count from public.grading_bands where grading_scale_id = scale.id;
  if band_count = 0 or not exists (select 1 from public.grading_bands where grading_scale_id = scale.id and minimum_score = 0)
     or not exists (select 1 from public.grading_bands where grading_scale_id = scale.id and maximum_score = 100)
     or exists (select 1 from public.grading_bands left join public.grading_bands next_band on next_band.grading_scale_id = grading_bands.grading_scale_id and next_band.minimum_score = grading_bands.maximum_score where grading_bands.grading_scale_id = scale.id and grading_bands.maximum_score < 100 and next_band.id is null) then
    raise exception 'RESULT_GRADING_SCALE_INVALID' using errcode = '23514';
  end if;
end;
$$;

create or replace function internal.validate_results_ranking_rule(target_rule_id uuid, target_school_id uuid, target_year_id uuid, target_grade_id uuid, require_active boolean default true)
returns void language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare rule public.ranking_rules%rowtype; direction text; configured_metric text; minimum_subjects_text text;
begin
  select * into rule from public.ranking_rules where id = target_rule_id;
  if not found or rule.school_id is distinct from target_school_id or (require_active and (not rule.is_active or rule.retired_at is not null))
     or (rule.academic_year_id is not null and rule.academic_year_id is distinct from target_year_id)
     or (rule.grade_level_id is not null and rule.grade_level_id is distinct from target_grade_id) then
    raise exception 'RESULT_RANKING_RULE_INVALID' using errcode = '23514';
  end if;
  direction := rule.configuration ->> 'direction'; configured_metric := rule.configuration ->> 'configured_metric'; minimum_subjects_text := rule.configuration ->> 'minimum_subjects';
  if direction not in ('ASC','DESC') or (rule.ranking_basis = 'CONFIGURED' and configured_metric not in ('TOTAL','AVERAGE','AGGREGATE'))
     or (minimum_subjects_text is not null and minimum_subjects_text !~ '^[0-9]+$') then
    raise exception 'RESULT_RANKING_RULE_INVALID' using errcode = '23514';
  end if;
end;
$$;

create or replace function internal.validate_results_classification_scale(target_scale_id uuid, target_school_id uuid, target_year_id uuid, target_grade_id uuid, require_active boolean default true)
returns void language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare scale public.aggregate_classification_scales%rowtype;
begin
  if target_scale_id is null then return; end if;
  select * into scale from public.aggregate_classification_scales where id = target_scale_id;
  if not found or scale.school_id is distinct from target_school_id or (require_active and (not scale.is_active or scale.retired_at is not null))
     or (scale.academic_year_id is not null and scale.academic_year_id is distinct from target_year_id)
     or (scale.grade_level_id is not null and scale.grade_level_id is distinct from target_grade_id)
     or not exists (select 1 from public.aggregate_classification_bands where scale_id = scale.id) then
    raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.calculate_grade_results(
  target_term_id uuid,
  target_grade_level_id uuid,
  target_grading_scale_id uuid,
  target_ranking_rule_id uuid,
  target_aggregate_classification_scale_id uuid default null
)
returns table(calculation_run_id uuid, calculation_version integer, reused boolean, input_checksum text, output_checksum text)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; term_row public.terms%rowtype; year_row public.academic_years%rowtype; grade_row public.grade_levels%rowtype;
  previous public.result_calculation_runs%rowtype; scale_id uuid; rule_id uuid; classification_id uuid; new_version integer; run_id uuid;
  input_hash text; output_hash text; direction text; tie_method public.ranking_tie_method; ranking_basis public.ranking_basis;
  include_incomplete boolean; minimum_subjects integer; aggregate_subject_count integer;
begin
  select * into actor from internal.require_results_actor();
  perform pg_advisory_xact_lock(hashtextextended(target_term_id::text || ':' || target_grade_level_id::text, 11011));
  select term.* into term_row from public.terms term where term.id = target_term_id for update;
  select year.* into year_row from public.academic_years year where year.id = term_row.academic_year_id;
  if not found or year_row.school_id is distinct from actor.school_id then raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501'; end if;
  if term_row.status <> 'LOCKED' then raise exception 'RESULT_TERM_NOT_LOCKED' using errcode = '23514'; end if;
  select * into grade_row from public.grade_levels where id = target_grade_level_id and school_id = actor.school_id and is_active;
  if not found then raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514'; end if;

  select * into previous from public.result_calculation_runs where term_id = target_term_id and grade_level_id = target_grade_level_id order by version desc limit 1;
  if previous.id is not null then
    scale_id := previous.grading_scale_id; rule_id := previous.ranking_rule_id; classification_id := previous.aggregate_classification_scale_id;
  else
    if target_grading_scale_id is null or target_ranking_rule_id is null then raise exception 'RESULT_GRADING_SCALE_INVALID' using errcode = '22023'; end if;
    scale_id := target_grading_scale_id; rule_id := target_ranking_rule_id; classification_id := target_aggregate_classification_scale_id;
  end if;
  perform internal.validate_results_grading_scale(scale_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  perform internal.validate_results_ranking_rule(rule_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  perform internal.validate_results_classification_scale(classification_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  select ranking_basis, tie_method, configuration ->> 'direction', coalesce((configuration ->> 'include_incomplete')::boolean, false), coalesce(nullif(configuration ->> 'minimum_subjects','')::integer, 0)
    into ranking_basis, tie_method, direction, include_incomplete, minimum_subjects from public.ranking_rules where id = rule_id;

  create temporary table tmp_result_sources(mark_sheet_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_version integer, assessment_scheme_id uuid, workflow_status public.mark_sheet_status) on commit drop;
  if not exists (select 1 from public.class_sections where academic_year_id = year_row.id and grade_level_id = target_grade_level_id and is_active)
     or not exists (select 1 from public.grade_level_subjects where grade_level_id = target_grade_level_id) then
    raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514';
  end if;
  insert into tmp_result_sources
  select latest.id, latest.class_section_id, latest.subject_id, latest.version, latest.assessment_scheme_id, latest.workflow_status
  from (
    select sheet.*, row_number() over(partition by sheet.term_id, sheet.class_section_id, sheet.subject_id order by sheet.version desc, sheet.id desc) as source_rank
    from public.mark_sheets sheet join public.class_sections section on section.id = sheet.class_section_id
    where sheet.term_id = target_term_id and section.grade_level_id = target_grade_level_id and section.academic_year_id = year_row.id
      and section.is_active and exists (select 1 from public.grade_level_subjects mapping where mapping.grade_level_id = target_grade_level_id and mapping.subject_id = sheet.subject_id)
  ) latest where latest.source_rank = 1;
  if exists (
    select 1 from public.class_sections section cross join public.grade_level_subjects mapping
    where section.academic_year_id = year_row.id and section.grade_level_id = target_grade_level_id and section.is_active and mapping.grade_level_id = target_grade_level_id
      and not exists (select 1 from tmp_result_sources source where source.class_section_id = section.id and source.subject_id = mapping.subject_id)
  ) then raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514'; end if;
  if exists (select 1 from tmp_result_sources where workflow_status <> 'LOCKED') then raise exception 'RESULT_SOURCE_NOT_LOCKED' using errcode = '23514'; end if;

  create temporary table tmp_result_explanations(
    enrollment_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_id uuid, assessment_component_id uuid,
    component_name text, attendance_status public.assessment_attendance_status, entered_score numeric, maximum_score numeric,
    weight_percentage numeric, is_required boolean, included_weight numeric, weighted_contribution numeric
  ) on commit drop;
  insert into tmp_result_explanations
  select enrollment.id, source.class_section_id, source.subject_id, source.mark_sheet_id, component.id, component.name,
    mark.attendance_status, mark.score, component.maximum_score, component.weight_percentage, component.is_required,
    case when mark.attendance_status in ('PRESENT','ABSENT') then component.weight_percentage else 0 end,
    case when mark.attendance_status = 'PRESENT' then (mark.score / component.maximum_score) * component.weight_percentage else 0 end
  from tmp_result_sources source join public.assessment_components component on component.assessment_scheme_id = source.assessment_scheme_id
  join public.enrollments enrollment on enrollment.class_section_id = source.class_section_id and enrollment.academic_year_id = year_row.id and enrollment.status in ('ACTIVE','REPEATING')
  left join public.marks mark on mark.mark_sheet_id = source.mark_sheet_id and mark.assessment_component_id = component.id and mark.enrollment_id = enrollment.id;

  create temporary table tmp_result_subjects(
    enrollment_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_id uuid, subject_status public.calculated_subject_status,
    subject_score numeric, grade text, aggregate_points integer, is_pass boolean, assessed_weight numeric, has_absence boolean, has_exemption boolean,
    subject_position integer, subject_tie_size integer default 0, subject_is_tied boolean default false, contributes_to_aggregate boolean, is_required boolean
  ) on commit drop;
  insert into tmp_result_subjects
  select explanation.enrollment_id, explanation.class_section_id, explanation.subject_id, explanation.mark_sheet_id,
    case when bool_or(explanation.is_required and (explanation.attendance_status is null or explanation.attendance_status = 'NOT_ASSESSED')) then 'INCOMPLETE'::public.calculated_subject_status
      when coalesce(sum(explanation.included_weight),0) = 0 then 'EXEMPTED'::public.calculated_subject_status else 'COMPLETE'::public.calculated_subject_status end,
    case when coalesce(sum(explanation.included_weight),0) > 0 and not bool_or(explanation.is_required and (explanation.attendance_status is null or explanation.attendance_status = 'NOT_ASSESSED'))
      then round(sum(explanation.weighted_contribution) * 100 / sum(explanation.included_weight), 2) end,
    null, null, null, coalesce(sum(explanation.included_weight),0), coalesce(bool_or(explanation.attendance_status = 'ABSENT'),false), coalesce(bool_or(explanation.attendance_status = 'EXEMPTED'),false),
    null, 0, false, mapping.contributes_to_aggregate, mapping.is_required
  from tmp_result_explanations explanation join public.grade_level_subjects mapping on mapping.grade_level_id = target_grade_level_id and mapping.subject_id = explanation.subject_id
  group by explanation.enrollment_id, explanation.class_section_id, explanation.subject_id, explanation.mark_sheet_id, mapping.contributes_to_aggregate, mapping.is_required;
  if exists (select 1 from tmp_result_subjects subject where subject.subject_status = 'COMPLETE' and (select count(*) from public.grading_bands band where band.grading_scale_id = scale_id and subject.subject_score <@ band.score_range) <> 1) then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;
  update tmp_result_subjects subject set grade = band.grade, aggregate_points = band.aggregate_points, is_pass = band.is_pass
  from public.grading_bands band where band.grading_scale_id = scale_id and subject.subject_status = 'COMPLETE' and subject.subject_score <@ band.score_range;
  if exists (select 1 from tmp_result_subjects subject where subject.subject_status = 'COMPLETE' and subject.contributes_to_aggregate and subject.aggregate_points is null) then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;

  create temporary table tmp_result_students(
    enrollment_id uuid, class_section_id uuid, subject_count integer, complete_subject_count integer, subjects_passed integer,
    overall_total numeric, overall_average numeric, overall_grade text, aggregate_total integer, aggregate_classification text,
    is_complete boolean, ranking_eligible boolean, ranking_metric numeric, class_position integer, grade_level_position integer,
    class_tie_size integer default 0, grade_level_tie_size integer default 0, class_is_tied boolean default false, grade_level_is_tied boolean default false
  ) on commit drop;
  insert into tmp_result_students
  select enrollment_id, class_section_id, count(*)::integer, count(*) filter(where subject_status='COMPLETE')::integer,
    count(*) filter(where subject_status='COMPLETE' and is_pass)::integer,
    sum(subject_score) filter(where subject_status='COMPLETE'),
    round(sum(subject_score) filter(where subject_status='COMPLETE') / nullif(count(*) filter(where subject_status='COMPLETE'),0), 2), null,
    case when count(*) filter(where contributes_to_aggregate) > 0 and bool_and(subject_status='COMPLETE' and aggregate_points is not null) filter(where contributes_to_aggregate) then sum(aggregate_points) filter(where contributes_to_aggregate)::integer end,
    null,
    coalesce(bool_and(subject_status in ('COMPLETE','EXEMPTED')) filter(where is_required), true), false, null, null, null, 0, 0, false, false
  from tmp_result_subjects group by enrollment_id, class_section_id;
  if classification_id is not null then
    update tmp_result_students student set aggregate_classification = band.label
    from public.aggregate_classification_bands band where band.scale_id = classification_id and student.aggregate_total is not null and student.aggregate_total between band.minimum_aggregate and band.maximum_aggregate;
    if exists (select 1 from tmp_result_students where aggregate_total is not null and aggregate_classification is null) then raise exception 'RESULT_CLASSIFICATION_UNMATCHED' using errcode = '23514'; end if;
  end if;
  update tmp_result_students student set overall_grade = band.grade
  from public.grading_bands band where band.grading_scale_id = scale_id and student.overall_average is not null and student.overall_average <@ band.score_range;
  if exists (select 1 from tmp_result_students student where student.overall_average is not null and (select count(*) from public.grading_bands band where band.grading_scale_id = scale_id and student.overall_average <@ band.score_range) <> 1) then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;
  update tmp_result_students student set ranking_metric = case ranking_basis
    when 'TOTAL' then overall_total when 'AVERAGE' then overall_average when 'AGGREGATE' then aggregate_total
    else case (select configuration ->> 'configured_metric' from public.ranking_rules where id = rule_id) when 'TOTAL' then overall_total when 'AVERAGE' then overall_average when 'AGGREGATE' then aggregate_total end end;
  update tmp_result_students set ranking_eligible = ranking_metric is not null and complete_subject_count >= minimum_subjects and (include_incomplete or is_complete);

  with ranked as (
    select student.*, count(*) over(partition by class_section_id, ranking_metric)::integer class_ties, count(*) over(partition by ranking_metric)::integer grade_ties,
      dense_rank() over(partition by class_section_id order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last) class_dense,
      rank() over(partition by class_section_id order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last) class_competition,
      row_number() over(partition by class_section_id order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last, enrollment_id) class_ordinal,
      dense_rank() over(order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last) grade_dense,
      rank() over(order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last) grade_competition,
      row_number() over(order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last, enrollment_id) grade_ordinal
    from tmp_result_students student where ranking_eligible
  )
  update tmp_result_students target set class_position = case tie_method when 'DENSE' then ranked.class_dense when 'COMPETITION' then ranked.class_competition when 'ORDINAL' then ranked.class_ordinal else ranked.class_competition end,
    grade_level_position = case tie_method when 'DENSE' then ranked.grade_dense when 'COMPETITION' then ranked.grade_competition when 'ORDINAL' then ranked.grade_ordinal else ranked.grade_competition end,
    class_tie_size = ranked.class_ties, grade_level_tie_size = ranked.grade_ties, class_is_tied = ranked.class_ties > 1, grade_level_is_tied = ranked.grade_ties > 1
  from ranked where target.enrollment_id = ranked.enrollment_id;

  with ranked as (
    select subject.enrollment_id, subject.subject_id, count(*) over(partition by subject.subject_id, subject.subject_score)::integer ties,
      dense_rank() over(partition by subject.subject_id order by subject.subject_score desc) dense_position,
      rank() over(partition by subject.subject_id order by subject.subject_score desc) competition_position,
      row_number() over(partition by subject.subject_id order by subject.subject_score desc, subject.enrollment_id) ordinal_position
    from tmp_result_subjects subject where subject.subject_status='COMPLETE' and subject.subject_score is not null
  )
  update tmp_result_subjects target set subject_position = case tie_method when 'DENSE' then ranked.dense_position when 'ORDINAL' then ranked.ordinal_position when 'COMPETITION' then ranked.competition_position else ranked.competition_position end,
    subject_tie_size = ranked.ties, subject_is_tied = ranked.ties > 1 from ranked where target.enrollment_id = ranked.enrollment_id and target.subject_id = ranked.subject_id;

  select encode(extensions.digest(
    target_term_id::text || ':' || target_grade_level_id::text || ':' || scale_id::text || ':' || rule_id::text || ':' || coalesce(classification_id::text,'') || ':' ||
    coalesce((select string_agg(concat_ws('|', mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id, workflow_status::text), ';' order by class_section_id, subject_id, mark_sheet_version, mark_sheet_id) from tmp_result_sources),'') || ':' ||
    coalesce((select string_agg(concat_ws('|', enrollment_id, subject_id, assessment_component_id, coalesce(attendance_status::text,''), coalesce(entered_score::text,''), maximum_score, weight_percentage, is_required), ';' order by enrollment_id, subject_id, assessment_component_id) from tmp_result_explanations),''), 'sha256'), 'hex') into input_hash;
  if previous.id is not null and previous.input_checksum = input_hash then return query select previous.id, previous.version, true, previous.input_checksum, previous.output_checksum; return; end if;
  select encode(extensions.digest(
    coalesce((select string_agg(concat_ws('|', enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, coalesce(overall_total::text,''), coalesce(overall_average::text,''), coalesce(overall_grade,''), coalesce(aggregate_total::text,''), coalesce(aggregate_classification,''), is_complete, ranking_eligible, coalesce(ranking_metric::text,''), coalesce(class_position::text,''), coalesce(grade_level_position::text,''), class_tie_size, grade_level_tie_size) , ';' order by enrollment_id) from tmp_result_students),'') || ':' ||
    coalesce((select string_agg(concat_ws('|', enrollment_id, subject_id, mark_sheet_id, subject_status::text, coalesce(subject_score::text,''), coalesce(grade,''), coalesce(aggregate_points::text,''), coalesce(is_pass::text,''), assessed_weight, has_absence, has_exemption, coalesce(subject_position::text,''), subject_tie_size), ';' order by enrollment_id, subject_id) from tmp_result_subjects),''), 'sha256'), 'hex') into output_hash;
  new_version := coalesce(previous.version, 0) + 1;
  insert into public.result_calculation_runs(term_id, grade_level_id, version, supersedes_run_id, grading_scale_id, ranking_rule_id, aggregate_classification_scale_id, input_checksum, output_checksum, created_by)
  values(target_term_id, target_grade_level_id, new_version, previous.id, scale_id, rule_id, classification_id, input_hash, output_hash, actor.membership_id) returning id into run_id;
  insert into public.result_calculation_sources(calculation_run_id, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id)
  select run_id, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id from tmp_result_sources;
  insert into public.calculated_student_results(calculation_run_id, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied)
  select run_id, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied from tmp_result_students;
  insert into public.calculated_subject_results(calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied)
  select run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied from tmp_result_subjects;
  insert into public.calculated_component_explanations(calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, assessment_component_id, component_name, attendance_status, entered_score, maximum_score, weight_percentage, included_weight, weighted_contribution)
  select run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, assessment_component_id, component_name, attendance_status, entered_score, maximum_score, weight_percentage, included_weight, weighted_contribution from tmp_result_explanations;
  insert into public.calculated_subject_performance(calculation_run_id, class_section_id, subject_id, mean_score, minimum_score, maximum_score, pass_rate, complete_count, incomplete_count, exempted_count, grade_distribution)
  select run_id, class_section_id, subject_id, round(avg(subject_score) filter(where subject_status='COMPLETE'),2), min(subject_score) filter(where subject_status='COMPLETE'), max(subject_score) filter(where subject_status='COMPLETE'), round(100 * avg(case when is_pass then 1.0 else 0.0 end) filter(where subject_status='COMPLETE'),2), count(*) filter(where subject_status='COMPLETE'), count(*) filter(where subject_status='INCOMPLETE'), count(*) filter(where subject_status='EXEMPTED'), coalesce(jsonb_object_agg(grade, grade_count) filter(where grade is not null), '{}'::jsonb)
  from (select class_section_id, subject_id, subject_status, subject_score, is_pass, grade, count(*) over(partition by class_section_id, subject_id, grade) as grade_count from tmp_result_subjects) distribution
  group by class_section_id, subject_id;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id, 'RESULT_CALCULATION_CREATED', 'result_calculation_run', run_id, null, jsonb_build_object('version', new_version, 'term_id', target_term_id, 'grade_level_id', target_grade_level_id, 'input_checksum', input_hash, 'output_checksum', output_hash, 'source_count', (select count(*) from tmp_result_sources)));
  return query select run_id, new_version, false, input_hash, output_hash;
end;
$$;

create or replace function public.list_result_calculation_terms()
returns table(term_id uuid, academic_year_id uuid, academic_year_name text, term_name text, term_status public.term_status, grade_level_id uuid, grade_name text, latest_run_id uuid, latest_version integer, input_checksum text, created_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader();
  return query select term.id, year.id, year.name, term.name, term.status, grade.id, grade.name, run.id, run.version, run.input_checksum, run.created_at
  from public.terms term join public.academic_years year on year.id = term.academic_year_id
  cross join public.grade_levels grade
  left join lateral (select result.* from public.result_calculation_runs result where result.term_id = term.id and result.grade_level_id = grade.id order by result.version desc limit 1) run on true
  where year.school_id = actor.school_id and grade.school_id = actor.school_id and grade.is_active order by year.starts_on desc, term.term_number, grade.sort_order;
end;
$$;

create or replace function public.list_result_calculation_options(target_term_id uuid, target_grade_level_id uuid)
returns table(option_type text, option_id uuid, option_name text, option_version integer, ranking_basis public.ranking_basis, tie_method public.ranking_tie_method)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; year_id uuid;
begin
  select * into actor from internal.require_results_reader();
  select academic_year_id into year_id from public.terms where id = target_term_id;
  return query
  select 'GRADING_SCALE', scale.id, scale.name, scale.version, null::public.ranking_basis, null::public.ranking_tie_method from public.grading_scales scale where scale.school_id = actor.school_id and scale.is_active and scale.retired_at is null and (scale.academic_year_id is null or scale.academic_year_id = year_id) and (scale.grade_level_id is null or scale.grade_level_id = target_grade_level_id)
  union all select 'RANKING_RULE', rule.id, rule.name, rule.version, rule.ranking_basis, rule.tie_method from public.ranking_rules rule where rule.school_id = actor.school_id and rule.is_active and rule.retired_at is null and (rule.academic_year_id is null or rule.academic_year_id = year_id) and (rule.grade_level_id is null or rule.grade_level_id = target_grade_level_id)
  union all select 'CLASSIFICATION_SCALE', classification.id, classification.name, classification.version, null::public.ranking_basis, null::public.ranking_tie_method from public.aggregate_classification_scales classification where classification.school_id = actor.school_id and classification.is_active and classification.retired_at is null and (classification.academic_year_id is null or classification.academic_year_id = year_id) and (classification.grade_level_id is null or classification.grade_level_id = target_grade_level_id);
end;
$$;

create or replace function internal.assert_result_run_readable(target_run_id uuid, target_school_id uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
begin
  if not exists (select 1 from public.result_calculation_runs run join public.terms term on term.id = run.term_id join public.academic_years year on year.id = term.academic_year_id where run.id = target_run_id and year.school_id = target_school_id) then raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501'; end if;
end;
$$;

create or replace function public.get_result_calculation_run(target_run_id uuid)
returns table(run_id uuid, term_id uuid, term_name text, academic_year_id uuid, academic_year_name text, grade_level_id uuid, grade_name text, version integer, supersedes_run_id uuid, grading_scale_id uuid, grading_scale_name text, grading_scale_version integer, ranking_rule_id uuid, ranking_rule_name text, ranking_rule_version integer, classification_scale_id uuid, classification_scale_name text, classification_scale_version integer, input_checksum text, output_checksum text, created_at timestamptz, source_sheet_count bigint, student_count bigint)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader(); perform internal.assert_result_run_readable(target_run_id, actor.school_id);
  return query select run.id, term.id, term.name, year.id, year.name, grade.id, grade.name, run.version, run.supersedes_run_id,
    scale.id, scale.name, scale.version, rule.id, rule.name, rule.version, classification.id, classification.name, classification.version, run.input_checksum, run.output_checksum, run.created_at,
    (select count(*) from public.result_calculation_sources source where source.calculation_run_id = run.id), (select count(*) from public.calculated_student_results student where student.calculation_run_id = run.id)
  from public.result_calculation_runs run join public.terms term on term.id = run.term_id join public.academic_years year on year.id = term.academic_year_id join public.grade_levels grade on grade.id = run.grade_level_id join public.grading_scales scale on scale.id = run.grading_scale_id join public.ranking_rules rule on rule.id = run.ranking_rule_id left join public.aggregate_classification_scales classification on classification.id = run.aggregate_classification_scale_id where run.id = target_run_id;
end;
$$;

create or replace function public.list_calculated_student_results(target_run_id uuid)
returns table(enrollment_id uuid, admission_number text, student_name text, class_section_id uuid, class_name text, subject_count integer, complete_subject_count integer, subjects_passed integer, overall_total numeric, overall_average numeric, overall_grade text, aggregate_total integer, aggregate_classification text, is_complete boolean, ranking_eligible boolean, ranking_metric numeric, class_position integer, grade_level_position integer, class_tie_size integer, grade_level_tie_size integer, class_is_tied boolean, grade_level_is_tied boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader(); perform internal.assert_result_run_readable(target_run_id, actor.school_id);
  return query select result.enrollment_id, student.admission_number, concat_ws(' ', student.first_name, student.middle_name, student.last_name), result.class_section_id, section.name, result.subject_count, result.complete_subject_count, result.subjects_passed, result.overall_total, result.overall_average, result.overall_grade, result.aggregate_total, result.aggregate_classification, result.is_complete, result.ranking_eligible, result.ranking_metric, result.class_position, result.grade_level_position, result.class_tie_size, result.grade_level_tie_size, result.class_is_tied, result.grade_level_is_tied
  from public.calculated_student_results result join public.enrollments enrollment on enrollment.id = result.enrollment_id join public.students student on student.id = enrollment.student_id join public.class_sections section on section.id = result.class_section_id where result.calculation_run_id = target_run_id order by section.name, student.admission_number;
end;
$$;

create or replace function public.get_calculated_student_result(target_run_id uuid, target_enrollment_id uuid)
returns table(enrollment_id uuid, admission_number text, student_name text, class_name text, term_name text, grade_name text, calculation_version integer, overall_total numeric, overall_average numeric, overall_grade text, aggregate_total integer, aggregate_classification text, class_position integer, grade_level_position integer, is_complete boolean, ranking_eligible boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader(); perform internal.assert_result_run_readable(target_run_id, actor.school_id);
  return query select result.enrollment_id, student.admission_number, concat_ws(' ', student.first_name, student.middle_name, student.last_name), section.name, term.name, grade.name, run.version, result.overall_total, result.overall_average, result.overall_grade, result.aggregate_total, result.aggregate_classification, result.class_position, result.grade_level_position, result.is_complete, result.ranking_eligible
  from public.calculated_student_results result join public.result_calculation_runs run on run.id = result.calculation_run_id join public.terms term on term.id = run.term_id join public.grade_levels grade on grade.id = run.grade_level_id join public.enrollments enrollment on enrollment.id = result.enrollment_id join public.students student on student.id = enrollment.student_id join public.class_sections section on section.id = result.class_section_id where result.calculation_run_id = target_run_id and result.enrollment_id = target_enrollment_id;
end;
$$;

create or replace function public.list_calculated_subject_results(target_run_id uuid, target_enrollment_id uuid)
returns table(subject_id uuid, subject_name text, subject_score numeric, grade text, aggregate_points integer, is_pass boolean, subject_status public.calculated_subject_status, assessed_weight numeric, has_absence boolean, has_exemption boolean, subject_position integer, subject_tie_size integer, subject_is_tied boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader(); perform internal.assert_result_run_readable(target_run_id, actor.school_id);
  return query select result.subject_id, subject.name, result.subject_score, result.grade, result.aggregate_points, result.is_pass, result.subject_status, result.assessed_weight, result.has_absence, result.has_exemption, result.subject_position, result.subject_tie_size, result.subject_is_tied
  from public.calculated_subject_results result join public.subjects subject on subject.id = result.subject_id where result.calculation_run_id = target_run_id and result.enrollment_id = target_enrollment_id order by subject.sort_order, subject.id;
end;
$$;

create or replace function public.list_result_component_explanations(target_run_id uuid, target_enrollment_id uuid)
returns table(subject_id uuid, subject_name text, component_name text, attendance_status public.assessment_attendance_status, entered_score numeric, maximum_score numeric, weight_percentage numeric, included_weight numeric, weighted_contribution numeric)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader(); perform internal.assert_result_run_readable(target_run_id, actor.school_id);
  return query select explanation.subject_id, subject.name, explanation.component_name, explanation.attendance_status, explanation.entered_score, explanation.maximum_score, explanation.weight_percentage, explanation.included_weight, explanation.weighted_contribution
  from public.calculated_component_explanations explanation join public.subjects subject on subject.id = explanation.subject_id where explanation.calculation_run_id = target_run_id and explanation.enrollment_id = target_enrollment_id order by subject.sort_order, explanation.component_name;
end;
$$;

create or replace function public.list_result_subject_performance(target_run_id uuid)
returns table(class_section_id uuid, class_name text, subject_id uuid, subject_name text, mean_score numeric, minimum_score numeric, maximum_score numeric, pass_rate numeric, complete_count integer, incomplete_count integer, exempted_count integer, grade_distribution jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader(); perform internal.assert_result_run_readable(target_run_id, actor.school_id);
  return query select performance.class_section_id, section.name, performance.subject_id, subject.name, performance.mean_score, performance.minimum_score, performance.maximum_score, performance.pass_rate, performance.complete_count, performance.incomplete_count, performance.exempted_count, performance.grade_distribution
  from public.calculated_subject_performance performance join public.class_sections section on section.id = performance.class_section_id join public.subjects subject on subject.id = performance.subject_id where performance.calculation_run_id = target_run_id order by section.name, subject.sort_order;
end;
$$;

create index result_calculation_term_grade_idx on public.result_calculation_runs(term_id, grade_level_id, version desc);
create index result_calculation_sources_run_idx on public.result_calculation_sources(calculation_run_id, class_section_id, subject_id);
create index calculated_student_results_run_class_idx on public.calculated_student_results(calculation_run_id, class_section_id, ranking_eligible, ranking_metric);
create index calculated_subject_results_run_subject_idx on public.calculated_subject_results(calculation_run_id, subject_id, subject_score);
create index calculated_component_explanations_lookup_idx on public.calculated_component_explanations(calculation_run_id, enrollment_id, subject_id);

drop trigger if exists result_calculation_runs_append_only on public.result_calculation_runs;
create trigger result_calculation_runs_append_only before update or delete on public.result_calculation_runs for each row execute function internal.prevent_mutation();
drop trigger if exists result_calculation_sources_append_only on public.result_calculation_sources;
create trigger result_calculation_sources_append_only before update or delete on public.result_calculation_sources for each row execute function internal.prevent_mutation();
drop trigger if exists calculated_student_results_append_only on public.calculated_student_results;
create trigger calculated_student_results_append_only before update or delete on public.calculated_student_results for each row execute function internal.prevent_mutation();
drop trigger if exists calculated_subject_results_append_only on public.calculated_subject_results;
create trigger calculated_subject_results_append_only before update or delete on public.calculated_subject_results for each row execute function internal.prevent_mutation();
drop trigger if exists calculated_component_explanations_append_only on public.calculated_component_explanations;
create trigger calculated_component_explanations_append_only before update or delete on public.calculated_component_explanations for each row execute function internal.prevent_mutation();
drop trigger if exists calculated_subject_performance_append_only on public.calculated_subject_performance;
create trigger calculated_subject_performance_append_only before update or delete on public.calculated_subject_performance for each row execute function internal.prevent_mutation();

alter table public.aggregate_classification_scales enable row level security;
alter table public.aggregate_classification_scales force row level security;
alter table public.aggregate_classification_bands enable row level security;
alter table public.aggregate_classification_bands force row level security;
alter table public.result_calculation_runs enable row level security;
alter table public.result_calculation_runs force row level security;
alter table public.result_calculation_sources enable row level security;
alter table public.result_calculation_sources force row level security;
alter table public.calculated_student_results enable row level security;
alter table public.calculated_student_results force row level security;
alter table public.calculated_subject_results enable row level security;
alter table public.calculated_subject_results force row level security;
alter table public.calculated_component_explanations enable row level security;
alter table public.calculated_component_explanations force row level security;
alter table public.calculated_subject_performance enable row level security;
alter table public.calculated_subject_performance force row level security;

revoke all on public.aggregate_classification_scales, public.aggregate_classification_bands, public.result_calculation_runs, public.result_calculation_sources, public.calculated_student_results, public.calculated_subject_results, public.calculated_component_explanations, public.calculated_subject_performance from public, anon, authenticated;
revoke all on function internal.current_results_actor(), internal.require_results_actor(), internal.current_results_reader(), internal.require_results_reader(), internal.current_academic_configuration_reader(), internal.validate_results_grading_scale(uuid,uuid,uuid,uuid,boolean), internal.validate_results_ranking_rule(uuid,uuid,uuid,uuid,boolean), internal.validate_results_classification_scale(uuid,uuid,uuid,uuid,boolean), internal.assert_result_run_readable(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid), public.save_aggregate_classification_scale(uuid,timestamptz,uuid,uuid,text,jsonb), public.create_aggregate_classification_scale_version(uuid,timestamptz,text,jsonb), public.activate_aggregate_classification_scale(uuid,timestamptz), public.deactivate_aggregate_classification_scale(uuid,timestamptz), public.list_aggregate_classification_scales(), public.list_result_calculation_terms(), public.list_result_calculation_options(uuid,uuid), public.get_result_calculation_run(uuid), public.list_calculated_student_results(uuid), public.get_calculated_student_result(uuid,uuid), public.list_calculated_subject_results(uuid,uuid), public.list_result_component_explanations(uuid,uuid), public.list_result_subject_performance(uuid) from public, anon;
grant execute on function public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid), public.save_aggregate_classification_scale(uuid,timestamptz,uuid,uuid,text,jsonb), public.create_aggregate_classification_scale_version(uuid,timestamptz,text,jsonb), public.activate_aggregate_classification_scale(uuid,timestamptz), public.deactivate_aggregate_classification_scale(uuid,timestamptz), public.list_aggregate_classification_scales(), public.list_result_calculation_terms(), public.list_result_calculation_options(uuid,uuid), public.get_result_calculation_run(uuid), public.list_calculated_student_results(uuid), public.get_calculated_student_result(uuid,uuid), public.list_calculated_subject_results(uuid,uuid), public.list_result_component_explanations(uuid,uuid), public.list_result_subject_performance(uuid) to authenticated;

revoke all on function internal.protect_aggregate_classification_lifecycle(), internal.protect_aggregate_classification_bands(), internal.validate_aggregate_classification_scope() from public, anon, authenticated;

comment on table public.result_calculation_runs is 'Immutable, versioned academic calculation outputs created only from locked latest mark-sheet revisions.';
comment on table public.result_calculation_sources is 'Exact source manifest for a calculation run; historical predecessors are never substituted.';
comment on table public.calculated_component_explanations is 'Non-audit calculation trace used to explain normalized and renormalized subject scores.';
comment on function public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid) is 'Calculates one term and grade from the database-authoritative latest locked mark sheets. Caller-supplied totals and sheets are never trusted.';
