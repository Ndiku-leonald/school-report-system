-- Stage 6 corrective migration: preserve historical academic configuration
-- semantics even for privileged direct writes. This migration intentionally
-- extends migrations 1-13 without changing reviewed migration history.

do $$
begin
  if exists (
    select 1
    from public.mark_sheets sheet
    join public.assessment_schemes scheme on scheme.id = sheet.assessment_scheme_id
    where scheme.status <> 'ACTIVE'
  ) then
    raise exception
      'Cannot require active assessment schemes: existing mark sheets reference draft or retired schemes.'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function internal.assessment_scheme_has_dependencies(
  target_scheme_id uuid
)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.mark_sheets
    where assessment_scheme_id = target_scheme_id
  )
  or exists (
    select 1
    from public.marks mark
    join public.mark_sheets sheet on sheet.id = mark.mark_sheet_id
    where sheet.assessment_scheme_id = target_scheme_id
  )
  or exists (
    select 1
    from public.marks mark
    join public.assessment_components component
      on component.id = mark.assessment_component_id
    where component.assessment_scheme_id = target_scheme_id
  );
$$;

revoke execute on function internal.assessment_scheme_has_dependencies(uuid)
  from public, anon, authenticated;

create or replace function internal.validate_mark_sheet_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  section_year_id uuid;
  section_grade_id uuid;
  scheme_term_id uuid;
  scheme_grade_id uuid;
  scheme_subject_id uuid;
  scheme_status public.assessment_scheme_status;
  assignment_term_id uuid;
  assignment_section_id uuid;
  assignment_subject_id uuid;
begin
  select academic_year_id into term_year_id
  from public.terms where id = new.term_id;

  select academic_year_id, grade_level_id
    into section_year_id, section_grade_id
  from public.class_sections where id = new.class_section_id;

  select term_id, grade_level_id, subject_id, status
    into scheme_term_id, scheme_grade_id, scheme_subject_id, scheme_status
  from public.assessment_schemes where id = new.assessment_scheme_id;

  select term_id, class_section_id, subject_id
    into assignment_term_id, assignment_section_id, assignment_subject_id
  from public.teaching_assignments where id = new.teaching_assignment_id;

  if scheme_status is distinct from 'ACTIVE' then
    raise exception 'A mark sheet must reference an active assessment scheme.'
      using errcode = '23514';
  end if;

  if section_year_id is distinct from term_year_id
     or scheme_term_id is distinct from new.term_id
     or scheme_grade_id is distinct from section_grade_id
     or scheme_subject_id is distinct from new.subject_id
     or assignment_term_id is distinct from new.term_id
     or assignment_section_id is distinct from new.class_section_id
     or assignment_subject_id is distinct from new.subject_id then
    raise exception 'Mark sheet references do not agree on term, class, grade, subject, and teaching assignment.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.protect_assessment_scheme_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT'
       or internal.assessment_scheme_has_dependencies(old.id) then
      raise exception 'Referenced, active, or retired assessment schemes are immutable.'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if old.id is distinct from new.id
     or old.created_at is distinct from new.created_at
     or old.created_by is distinct from new.created_by then
    raise exception 'Assessment scheme identity and creator are immutable.'
      using errcode = '55000';
  end if;

  if old.status = 'DRAFT' then
    if new.status = 'DRAFT' then
      if internal.assessment_scheme_has_dependencies(old.id) then
        raise exception 'Referenced assessment schemes are immutable.'
          using errcode = '55000';
      end if;
      return new;
    end if;

    if new.status = 'ACTIVE'
       and (to_jsonb(new) - array['status', 'updated_at']::text[])
           = (to_jsonb(old) - array['status', 'updated_at']::text[]) then
      return new;
    end if;

    raise exception 'Assessment schemes may only transition from draft to active without definition changes.'
      using errcode = '55000';
  end if;

  if old.status = 'ACTIVE'
     and new.status = 'RETIRED'
     and (to_jsonb(new) - array['status', 'updated_at']::text[])
         = (to_jsonb(old) - array['status', 'updated_at']::text[]) then
    return new;
  end if;

  raise exception 'Active and retired assessment schemes are immutable.'
    using errcode = '55000';
end;
$$;

create or replace function internal.protect_non_draft_assessment_components()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  source_scheme_id uuid;
  target_scheme_id uuid;
begin
  source_scheme_id := case when tg_op = 'INSERT' then null else old.assessment_scheme_id end;
  target_scheme_id := case when tg_op = 'DELETE' then null else new.assessment_scheme_id end;

  if exists (
    select 1
    from public.assessment_schemes scheme
    where scheme.id in (source_scheme_id, target_scheme_id)
      and (
        scheme.status <> 'DRAFT'
        or internal.assessment_scheme_has_dependencies(scheme.id)
      )
  ) then
    raise exception 'Components of referenced, active, or retired assessment schemes are immutable.'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists assessment_schemes_protect_lifecycle on public.assessment_schemes;
create trigger assessment_schemes_protect_lifecycle
before update or delete on public.assessment_schemes
for each row execute function internal.protect_assessment_scheme_lifecycle();

revoke execute on function internal.protect_assessment_scheme_lifecycle()
  from public, anon, authenticated;
revoke execute on function internal.protect_non_draft_assessment_components()
  from public, anon, authenticated;

create or replace function internal.protect_grading_scale_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_active or old.retired_at is not null then
      raise exception 'Active and retired grading scales are immutable.' using errcode = '55000';
    end if;
    return old;
  end if;

  if old.is_active = false and old.retired_at is null then
    if new.is_active = false and new.retired_at is null then
      return new;
    end if;
    if new.is_active = true and new.retired_at is null
       and (to_jsonb(new) - array['is_active', 'updated_at']::text[])
           = (to_jsonb(old) - array['is_active', 'updated_at']::text[]) then
      return new;
    end if;
    raise exception 'A draft grading scale may only transition to active without definition changes.'
      using errcode = '55000';
  end if;

  if old.is_active = true and old.retired_at is null
     and new.is_active = false and new.retired_at is not null
     and (to_jsonb(new) - array['is_active', 'retired_at', 'updated_at']::text[])
         = (to_jsonb(old) - array['is_active', 'retired_at', 'updated_at']::text[]) then
    return new;
  end if;

  raise exception 'Active and retired grading scales are immutable.' using errcode = '55000';
end;
$$;

create or replace function internal.protect_grading_band_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  source_scale_id uuid;
  target_scale_id uuid;
begin
  source_scale_id := case when tg_op = 'INSERT' then null else old.grading_scale_id end;
  target_scale_id := case when tg_op = 'DELETE' then null else new.grading_scale_id end;

  if exists (
    select 1
    from public.grading_scales scale
    where scale.id in (source_scale_id, target_scale_id)
      and (scale.is_active or scale.retired_at is not null)
  ) then
    raise exception 'Bands of active or retired grading scales are immutable.'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists grading_scales_protect_lifecycle on public.grading_scales;
create trigger grading_scales_protect_lifecycle
before update or delete on public.grading_scales
for each row execute function internal.protect_grading_scale_lifecycle();

drop trigger if exists grading_bands_protect_lifecycle on public.grading_bands;
create trigger grading_bands_protect_lifecycle
before insert or update or delete on public.grading_bands
for each row execute function internal.protect_grading_band_lifecycle();

create or replace function internal.protect_versioned_rule_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  old_record jsonb;
  new_record jsonb;
  old_active boolean;
  old_retired boolean;
  new_active boolean;
  new_retired boolean;
begin
  old_record := to_jsonb(old);
  old_active := coalesce((old_record ->> 'is_active')::boolean, false);
  old_retired := old_record ->> 'retired_at' is not null;

  if tg_op = 'DELETE' then
    if old_active or old_retired then
      raise exception 'Active and retired versioned rules are immutable.' using errcode = '55000';
    end if;
    return old;
  end if;

  new_record := to_jsonb(new);
  new_active := coalesce((new_record ->> 'is_active')::boolean, false);
  new_retired := new_record ->> 'retired_at' is not null;

  if not old_active and not old_retired then
    if not new_active and not new_retired then
      return new;
    end if;
    if new_active and not new_retired
       and (new_record - array['is_active', 'updated_at']::text[])
           = (old_record - array['is_active', 'updated_at']::text[]) then
      return new;
    end if;
    raise exception 'A draft versioned rule may only transition to active without definition changes.'
      using errcode = '55000';
  end if;

  if old_active and not old_retired
     and not new_active and new_retired
     and (new_record - array['is_active', 'retired_at', 'updated_at']::text[])
         = (old_record - array['is_active', 'retired_at', 'updated_at']::text[]) then
    return new;
  end if;

  raise exception 'Active and retired versioned rules are immutable.' using errcode = '55000';
end;
$$;

drop trigger if exists ranking_rules_protect_lifecycle on public.ranking_rules;
create trigger ranking_rules_protect_lifecycle
before update or delete on public.ranking_rules
for each row execute function internal.protect_versioned_rule_lifecycle();

drop trigger if exists promotion_rules_protect_lifecycle on public.promotion_rules;
create trigger promotion_rules_protect_lifecycle
before update or delete on public.promotion_rules
for each row execute function internal.protect_versioned_rule_lifecycle();

create or replace function internal.validate_promotion_decision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  term_school_id uuid;
  promotion_term boolean;
  enrollment_year_id uuid;
  enrollment_class_id uuid;
  enrollment_grade_id uuid;
  rule_school_id uuid;
  rule_year_id uuid;
  rule_grade_id uuid;
  rule_is_active boolean;
  confirmer_school_id uuid;
begin
  select terms.academic_year_id, academic_years.school_id, terms.is_promotion_term
    into term_year_id, term_school_id, promotion_term
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  select enrollments.academic_year_id, enrollments.class_section_id, class_sections.grade_level_id
    into enrollment_year_id, enrollment_class_id, enrollment_grade_id
  from public.enrollments
  join public.class_sections on class_sections.id = enrollments.class_section_id
  where enrollments.id = new.enrollment_id;

  if new.promotion_rule_id is not null then
    select school_id, academic_year_id, grade_level_id, is_active
      into rule_school_id, rule_year_id, rule_grade_id, rule_is_active
    from public.promotion_rules where id = new.promotion_rule_id;
  end if;

  if new.confirmed_by is not null then
    select school_id into confirmer_school_id
    from public.school_staff_memberships where id = new.confirmed_by;
  end if;

  if enrollment_year_id is distinct from term_year_id
     or (
       new.promotion_rule_id is not null
       and (
         rule_school_id is distinct from term_school_id
         or (rule_year_id is not null and rule_year_id is distinct from term_year_id)
         or (rule_grade_id is not null and rule_grade_id is distinct from enrollment_grade_id)
       )
     )
     or (
       new.confirmed_by is not null
       and confirmer_school_id is distinct from term_school_id
     ) then
    raise exception 'Promotion decision references must share one school and academic scope.'
      using errcode = '23514';
  end if;

  if new.promotion_rule_id is not null
     and (tg_op = 'INSERT' or old.promotion_rule_id is distinct from new.promotion_rule_id)
     and rule_is_active is not true then
    raise exception 'A promotion decision must select an active promotion rule.'
      using errcode = '23514';
  end if;

  if new.final_decision is not null and not promotion_term then
    raise exception 'A final promotion decision requires a promotion term.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.set_grade_level_active(
  target_grade_level_id uuid, expected_updated_at timestamptz, target_active boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.grade_levels%rowtype; changed public.grade_levels%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select * into existing from public.grade_levels where id = target_grade_level_id and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  if existing.is_active is not distinct from target_active then raise exception 'ACADEMIC_CONFIGURATION_LIFECYCLE_NO_CHANGE' using errcode = '55000'; end if;
  update public.grade_levels set is_active = target_active where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    case when target_active then 'ACADEMIC_CONFIGURATION_ACTIVATED' else 'ACADEMIC_CONFIGURATION_DEACTIVATED' end,
    'grade_level', changed.id, jsonb_build_object('is_active', existing.is_active), jsonb_build_object('is_active', changed.is_active));
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end;
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
  select * into existing from public.subjects where id = target_subject_id and school_id = actor.school_id for update;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  if existing.is_active is not distinct from target_active then raise exception 'ACADEMIC_CONFIGURATION_LIFECYCLE_NO_CHANGE' using errcode = '55000'; end if;
  update public.subjects set is_active = target_active where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    case when target_active then 'ACADEMIC_CONFIGURATION_ACTIVATED' else 'ACADEMIC_CONFIGURATION_DEACTIVATED' end,
    'subject', changed.id, jsonb_build_object('is_active', existing.is_active), jsonb_build_object('is_active', changed.is_active));
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end;
$$;

create or replace function public.set_class_section_active(
  target_class_section_id uuid, expected_updated_at timestamptz, target_active boolean
)
returns table (entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.class_sections%rowtype; changed public.class_sections%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  select section.* into existing from public.class_sections section
  join public.academic_years year on year.id = section.academic_year_id
  where section.id = target_class_section_id and year.school_id = actor.school_id for update of section;
  if not found then raise exception 'ACADEMIC_CONFIGURATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.academic_years where id = existing.academic_year_id and status in ('DRAFT', 'ACTIVE')) then
    raise exception 'ACADEMIC_CONFIGURATION_YEAR_UNAVAILABLE' using errcode = '55000';
  end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  if existing.is_active is not distinct from target_active then raise exception 'ACADEMIC_CONFIGURATION_LIFECYCLE_NO_CHANGE' using errcode = '55000'; end if;
  update public.class_sections set is_active = target_active where id = existing.id returning * into changed;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id,
    case when target_active then 'ACADEMIC_CONFIGURATION_ACTIVATED' else 'ACADEMIC_CONFIGURATION_DEACTIVATED' end,
    'class_section', changed.id, jsonb_build_object('is_active', existing.is_active), jsonb_build_object('is_active', changed.is_active));
  return query select changed.id, case when changed.is_active then 'ACTIVE' else 'INACTIVE' end, changed.updated_at;
end;
$$;
