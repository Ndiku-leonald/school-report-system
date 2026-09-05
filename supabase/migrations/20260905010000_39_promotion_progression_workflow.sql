-- Stage 17: secure promotion recommendations, decisions, repetition, and
-- explicit progression.  This migration consumes only current Stage 11
-- calculation output; it never calculates results as a side effect.

create table public.promotion_recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  calculation_run_id uuid not null references public.result_calculation_runs(id) on delete restrict,
  promotion_rule_id uuid not null references public.promotion_rules(id) on delete restrict,
  schema_version integer not null default 1 check (schema_version > 0),
  snapshot_data jsonb not null check (jsonb_typeof(snapshot_data) = 'object'),
  snapshot_checksum text not null check (snapshot_checksum ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint promotion_snapshot_term_enrollment_run_unique
    unique (term_id, enrollment_id, calculation_run_id, promotion_rule_id, snapshot_checksum)
);

alter table public.promotion_decisions
  add column if not exists version integer,
  add column if not exists recommendation_snapshot_id uuid,
  add column if not exists superseded_by uuid;

update public.promotion_decisions set version = 1 where version is null;

alter table public.promotion_decisions
  alter column version set default 1,
  alter column version set not null;

alter table public.promotion_decisions
  drop constraint if exists promotion_decision_term_enrollment_unique;

alter table public.promotion_decisions
  add constraint promotion_decision_term_enrollment_version_unique
  unique (term_id, enrollment_id, version);

alter table public.promotion_decisions
  add constraint promotion_decision_snapshot_fk
  foreign key (recommendation_snapshot_id)
  references public.promotion_recommendation_snapshots(id)
  on delete restrict;

alter table public.promotion_decisions
  add constraint promotion_decision_superseded_by_fk
  foreign key (superseded_by)
  references public.promotion_decisions(id)
  on delete restrict;

create unique index if not exists promotion_decision_one_current_idx
  on public.promotion_decisions (term_id, enrollment_id)
  where superseded_by is null;

create index if not exists promotion_decisions_term_grade_idx
  on public.promotion_decisions (term_id, enrollment_id, version desc);

create table public.student_progressions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  source_decision_id uuid not null references public.promotion_decisions(id) on delete restrict,
  source_enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  target_academic_year_id uuid references public.academic_years(id) on delete restrict,
  target_grade_level_id uuid references public.grade_levels(id) on delete restrict,
  target_class_section_id uuid references public.class_sections(id) on delete restrict,
  target_enrollment_id uuid references public.enrollments(id) on delete restrict,
  outcome public.promotion_outcome not null,
  application_checksum text not null check (application_checksum ~ '^[0-9a-f]{64}$'),
  applied_by uuid not null references public.school_staff_memberships(id) on delete restrict,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint student_progression_source_unique unique (source_decision_id),
  constraint student_progression_target_consistent check (
    (outcome = 'COMPLETED' and target_academic_year_id is null
      and target_grade_level_id is null and target_class_section_id is null
      and target_enrollment_id is null)
    or (outcome in ('PROMOTED', 'PROMOTED_WITH_SUPPORT', 'REPEAT_CONFIRMED')
      and target_academic_year_id is not null and target_grade_level_id is not null
      and target_class_section_id is not null and target_enrollment_id is not null)
  )
);

alter table public.promotion_recommendation_snapshots enable row level security;
alter table public.promotion_recommendation_snapshots force row level security;
alter table public.student_progressions enable row level security;
alter table public.student_progressions force row level security;
revoke all privileges on table public.promotion_recommendation_snapshots from anon, authenticated;
revoke all privileges on table public.student_progressions from anon, authenticated;

create or replace function internal.current_promotion_reader()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select membership.profile_id, membership.id, membership.school_id
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id
   and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  where auth.uid() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE'
    and school.is_active
    and internal.current_user_has_permission(membership.school_id, 'PROMOTION_VIEW');
$$;

create or replace function internal.require_promotion_reader()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query select * from internal.current_promotion_reader();
  if not found then raise exception 'PROMOTION_FORBIDDEN' using errcode = '42501'; end if;
end;
$$;

create or replace function internal.current_promotion_actor()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select reader.profile_id, reader.membership_id, reader.school_id
  from internal.current_promotion_reader() reader
  where internal.current_user_has_permission(reader.school_id, 'PROMOTION_CONFIRM');
$$;

create or replace function internal.require_promotion_actor()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query select * from internal.current_promotion_actor();
  if not found then raise exception 'PROMOTION_CONFIRM_FORBIDDEN' using errcode = '42501'; end if;
end;
$$;

create or replace function internal.resolve_promotion_rule(
  target_school_id uuid,
  target_academic_year_id uuid,
  target_grade_level_id uuid
)
returns public.promotion_rules
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare resolved public.promotion_rules%rowtype;
begin
  select rule.* into resolved
  from public.promotion_rules rule
  where rule.school_id = target_school_id
    and rule.is_active
    and rule.retired_at is null
    and (rule.academic_year_id is null or rule.academic_year_id = target_academic_year_id)
    and (rule.grade_level_id is null or rule.grade_level_id = target_grade_level_id)
  order by
    case when rule.academic_year_id is not null and rule.grade_level_id is not null then 3
         when rule.academic_year_id is not null then 2
         when rule.grade_level_id is not null then 1 else 0 end desc,
    rule.version desc, rule.id desc
  limit 1;
  if resolved.id is null then raise exception 'PROMOTION_RULE_UNAVAILABLE' using errcode = 'P0002'; end if;
  return resolved;
end;
$$;

create or replace function internal.validate_promotion_required_subjects(
  target_rule public.promotion_rules,
  target_school_id uuid,
  target_grade_level_id uuid
)
returns boolean
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare item jsonb; required_subject_id_local uuid; requirement text;
begin
  if target_rule.required_subject_rules = '{}'::jsonb then return true; end if;
  if target_rule.required_subject_rules->>'schema_version' <> '1'
     or jsonb_typeof(target_rule.required_subject_rules->'subjects') <> 'array' then
    return false;
  end if;
  for item in select value from jsonb_array_elements(target_rule.required_subject_rules->'subjects')
  loop
    if jsonb_typeof(item) <> 'object'
       or not (item ? 'subject_id') or not (item ? 'require') then return false; end if;
    begin required_subject_id_local := (item->>'subject_id')::uuid; exception when invalid_text_representation then return false; end;
    requirement := item->>'require';
    if requirement not in ('PASS', 'COMPLETE') then return false; end if;
    if not exists (
      select 1 from public.grade_level_subjects mapping
      join public.subjects subject on subject.id = mapping.subject_id
      where mapping.grade_level_id = target_grade_level_id
        and mapping.subject_id = required_subject_id_local and subject.school_id = target_school_id
    ) then return false; end if;
    if (select count(*) from jsonb_array_elements(target_rule.required_subject_rules->'subjects') duplicate_item
        where duplicate_item->>'subject_id' = item->>'subject_id') <> 1 then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function internal.validate_promotion_additional_rules(target_rule public.promotion_rules)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select target_rule.additional_rules = '{}'::jsonb
    or (jsonb_typeof(target_rule.additional_rules) = 'object'
      and target_rule.additional_rules->>'schema_version' = '1'
      and (not (target_rule.additional_rules ? 'require_all_required_subjects')
        or jsonb_typeof(target_rule.additional_rules->'require_all_required_subjects') = 'boolean')
      and (not (target_rule.additional_rules ? 'allow_manual_review')
        or jsonb_typeof(target_rule.additional_rules->'allow_manual_review') = 'boolean'));
$$;

create or replace function internal.promotion_snapshot_for(
  target_school_id uuid,
  target_term_id uuid,
  target_enrollment_id uuid
)
returns table(
  calculation_run_id uuid, calculation_version integer, promotion_rule_id uuid,
  promotion_rule_version integer, system_recommendation public.promotion_outcome,
  snapshot_data jsonb, snapshot_checksum text
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare
  term_row public.terms%rowtype; year_row public.academic_years%rowtype;
  enrollment_row public.enrollments%rowtype; section_row public.class_sections%rowtype;
  grade_row public.grade_levels%rowtype; rule_row public.promotion_rules%rowtype;
  run_row public.result_calculation_runs%rowtype; result_row public.calculated_student_results%rowtype;
  attendance_row public.term_attendance%rowtype; subject_json jsonb; criteria jsonb;
  required jsonb; criterion jsonb; all_met boolean := true; unavailable boolean := false;
  attendance_percentage numeric; recommendation public.promotion_outcome;
  data jsonb; subject_count integer; required_subject_id uuid; requirement text;
  subject_status text; subject_pass boolean;
begin
  select term.* into term_row from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id and year.school_id = target_school_id;
  if not found or not term_row.is_promotion_term then raise exception 'PROMOTION_TERM_REQUIRED' using errcode = '23514'; end if;

  select year.* into year_row from public.academic_years year where year.id = term_row.academic_year_id;
  select enrollment.* into enrollment_row from public.enrollments enrollment where enrollment.id = target_enrollment_id;
  select section.* into section_row from public.class_sections section where section.id = enrollment_row.class_section_id;
  select grade.* into grade_row from public.grade_levels grade where grade.id = section_row.grade_level_id;
  if enrollment_row.academic_year_id is distinct from year_row.id
     or section_row.grade_level_id is null or grade_row.school_id is distinct from target_school_id then
    raise exception 'PROMOTION_SCOPE_INVALID' using errcode = '23514';
  end if;

  rule_row := internal.resolve_promotion_rule(target_school_id, year_row.id, grade_row.id);
  if not internal.validate_promotion_required_subjects(rule_row, target_school_id, grade_row.id)
     or not internal.validate_promotion_additional_rules(rule_row) then
    raise exception 'PROMOTION_RULE_UNSUPPORTED' using errcode = 'P0001';
  end if;

  select run.* into run_row from public.result_calculation_runs run
  where run.term_id = term_row.id and run.grade_level_id = grade_row.id
  order by run.version desc, run.id desc limit 1;
  if run_row.id is null or not internal.analytics_run_is_current(run_row.id, target_school_id) then
    raise exception 'PROMOTION_RESULTS_UNAVAILABLE' using errcode = 'P0002';
  end if;
  select result.* into result_row from public.calculated_student_results result
  where result.calculation_run_id = run_row.id and result.enrollment_id = enrollment_row.id;
  if not found then raise exception 'PROMOTION_RESULTS_UNAVAILABLE' using errcode = 'P0002'; end if;
  select attendance.* into attendance_row from public.term_attendance attendance
  where attendance.term_id = term_row.id and attendance.enrollment_id = enrollment_row.id;
  if found and attendance_row.days_open > 0 then
    attendance_percentage := round(attendance_row.days_present * 100.0 / attendance_row.days_open, 2);
  elsif found and attendance_row.days_open = 0 then attendance_percentage := 100;
  else attendance_percentage := null;
  end if;

  subject_json := coalesce((select jsonb_agg(jsonb_build_object(
    'subject_id', subject.id, 'subject_code', subject.code, 'subject_name', subject.name,
    'subject_status', result.subject_status, 'is_pass', result.is_pass,
    'score', result.subject_score, 'grade', result.grade
  ) order by mapping.sort_order, subject.id)
  from public.calculated_subject_results result
  join public.subjects subject on subject.id = result.subject_id
  join public.grade_level_subjects mapping on mapping.grade_level_id = grade_row.id and mapping.subject_id = result.subject_id
  where result.calculation_run_id = run_row.id and result.enrollment_id = enrollment_row.id), '[]'::jsonb);

  criteria := '[]'::jsonb;
  if rule_row.minimum_average is not null then
    criterion := jsonb_build_object('criterion','minimum_average','threshold',rule_row.minimum_average,'actual',result_row.overall_average,
      'state',case when result_row.overall_average is null then 'UNAVAILABLE' when result_row.overall_average >= rule_row.minimum_average then 'MET' else 'NOT_MET' end);
    criteria := criteria || jsonb_build_array(criterion);
  end if;
  if rule_row.maximum_aggregate is not null then
    criterion := jsonb_build_object('criterion','maximum_aggregate','threshold',rule_row.maximum_aggregate,'actual',result_row.aggregate_total,
      'state',case when result_row.aggregate_total is null then 'UNAVAILABLE' when result_row.aggregate_total <= rule_row.maximum_aggregate then 'MET' else 'NOT_MET' end);
    criteria := criteria || jsonb_build_array(criterion);
  end if;
  if rule_row.minimum_subjects_passed is not null then
    criterion := jsonb_build_object('criterion','minimum_subjects_passed','threshold',rule_row.minimum_subjects_passed,'actual',result_row.subjects_passed,
      'state',case when result_row.subjects_passed is null then 'UNAVAILABLE' when result_row.subjects_passed >= rule_row.minimum_subjects_passed then 'MET' else 'NOT_MET' end);
    criteria := criteria || jsonb_build_array(criterion);
  end if;
  if rule_row.minimum_attendance_percentage is not null then
    criterion := jsonb_build_object('criterion','minimum_attendance_percentage','threshold',rule_row.minimum_attendance_percentage,'actual',attendance_percentage,
      'state',case when attendance_percentage is null then 'UNAVAILABLE' when attendance_percentage >= rule_row.minimum_attendance_percentage then 'MET' else 'NOT_MET' end);
    criteria := criteria || jsonb_build_array(criterion);
  end if;
  criterion := jsonb_build_object('criterion','result_complete','threshold',true,'actual',result_row.is_complete,
    'state',case when result_row.is_complete then 'MET' else 'NOT_MET' end);
  criteria := criteria || jsonb_build_array(criterion);
  required := rule_row.required_subject_rules;
  if required <> '{}'::jsonb then
    for required_subject_id, requirement in
      select (item->>'subject_id')::uuid, item->>'require' from jsonb_array_elements(required->'subjects') item order by item->>'subject_id'
    loop
      subject_status := null; subject_pass := null;
      select result.subject_status::text, result.is_pass into subject_status, subject_pass
      from public.calculated_subject_results result
      where result.calculation_run_id = run_row.id and result.enrollment_id = enrollment_row.id and result.subject_id = required_subject_id;
      criterion := jsonb_build_object('criterion','required_subject','subject_id',required_subject_id,'require',requirement,
        'actual',case when subject_status is null then null else jsonb_build_object('subject_status',subject_status,'is_pass',subject_pass) end,
        'state',case when subject_status is null then 'UNAVAILABLE'
          when (requirement = 'COMPLETE' and subject_status = 'COMPLETE')
            or (requirement = 'PASS' and subject_status = 'COMPLETE' and coalesce(subject_pass,false)) then 'MET' else 'NOT_MET' end);
      criteria := criteria || jsonb_build_array(criterion);
    end loop;
  end if;

  select bool_or((item->>'state') = 'NOT_MET') into all_met from jsonb_array_elements(criteria) item;
  select bool_or((item->>'state') = 'UNAVAILABLE') into unavailable from jsonb_array_elements(criteria) item;
  if coalesce(unavailable,false) then recommendation := 'ACADEMIC_REVIEW';
  elsif coalesce(all_met,false) then recommendation := case when grade_row.is_final_grade then 'COMPLETED' else 'REPEAT_RECOMMENDED' end;
  else recommendation := case when grade_row.is_final_grade then 'ACADEMIC_REVIEW' else 'PROMOTED' end;
  end if;
  -- The pass/fail criteria are deliberately evaluated as NOT_MET when a
  -- threshold fails. Re-evaluate the recommendation with that distinction.
  if not result_row.is_complete then recommendation := 'ACADEMIC_REVIEW';
  elsif not coalesce(unavailable,false) and exists (select 1 from jsonb_array_elements(criteria) item where item->>'state' = 'NOT_MET') then
    recommendation := case when grade_row.is_final_grade then 'ACADEMIC_REVIEW' else 'REPEAT_RECOMMENDED' end;
  elsif not coalesce(unavailable,false) and grade_row.is_final_grade then
    recommendation := 'COMPLETED';
  elsif not coalesce(unavailable,false) then recommendation := 'PROMOTED'; end if;

  data := jsonb_build_object(
    'schema_version',1,'academic_year_id',year_row.id,'term_id',term_row.id,'grade_level_id',grade_row.id,
    'class_section_id',section_row.id,'enrollment_id',enrollment_row.id,'calculation_run_id',run_row.id,
    'calculation_version',run_row.version,'result_input_checksum',run_row.input_checksum,'result_output_checksum',run_row.output_checksum,
    'student_result',jsonb_build_object('overall_total',result_row.overall_total,'overall_average',result_row.overall_average,
      'overall_grade',result_row.overall_grade,'aggregate_total',result_row.aggregate_total,'aggregate_classification',result_row.aggregate_classification,
      'is_complete',result_row.is_complete,'subjects_passed',result_row.subjects_passed),
    'subject_evidence',subject_json,'attendance',case when attendance_row.id is null then null else jsonb_build_object(
      'days_open',attendance_row.days_open,'days_present',attendance_row.days_present,'days_absent',attendance_row.days_absent,
      'times_late',attendance_row.times_late,'attendance_percentage',attendance_percentage) end,
    'promotion_rule',jsonb_build_object('id',rule_row.id,'version',rule_row.version,'minimum_average',rule_row.minimum_average,
      'maximum_aggregate',rule_row.maximum_aggregate,'minimum_subjects_passed',rule_row.minimum_subjects_passed,
      'minimum_attendance_percentage',rule_row.minimum_attendance_percentage,'required_subject_rules',rule_row.required_subject_rules,
      'additional_rules',rule_row.additional_rules), 'criteria',criteria, 'system_recommendation',recommendation);
  calculation_run_id := run_row.id; calculation_version := run_row.version; promotion_rule_id := rule_row.id;
  promotion_rule_version := rule_row.version; system_recommendation := recommendation; snapshot_data := data;
  snapshot_checksum := encode(extensions.digest(data::text, 'sha256'), 'hex');
  return next;
end;
$$;

create or replace function internal.validate_promotion_decision_stage17()
returns trigger language plpgsql set search_path = pg_catalog, public, internal as $$
begin
  if tg_op = 'UPDATE' then
    if old.term_id is distinct from new.term_id or old.enrollment_id is distinct from new.enrollment_id
       or old.version is distinct from new.version or old.promotion_rule_id is distinct from new.promotion_rule_id
       or old.recommendation_snapshot_id is distinct from new.recommendation_snapshot_id
       or old.system_recommendation is distinct from new.system_recommendation then
      raise exception 'PROMOTION_DECISION_SOURCE_IMMUTABLE' using errcode = '55000';
    end if;
    if old.final_decision is not null and (old.final_decision is distinct from new.final_decision
       or old.reason is distinct from new.reason or old.was_overridden is distinct from new.was_overridden
       or old.confirmed_by is distinct from new.confirmed_by or old.confirmed_at is distinct from new.confirmed_at) then
      raise exception 'PROMOTION_DECISION_CONFIRMED_IMMUTABLE' using errcode = '55000';
    end if;
    if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
      raise exception 'PROMOTION_DECISION_HISTORY_IMMUTABLE' using errcode = '55000';
    end if;
  end if;
  if new.final_decision = 'REPEAT_RECOMMENDED' then raise exception 'FINAL_DECISION_OUTCOME_INVALID' using errcode = '22023'; end if;
  if new.final_decision is not null and new.final_decision not in ('PROMOTED','PROMOTED_WITH_SUPPORT','ACADEMIC_REVIEW','REPEAT_CONFIRMED','COMPLETED') then
    raise exception 'FINAL_DECISION_OUTCOME_INVALID' using errcode = '22023';
  end if;
  if new.system_recommendation not in ('PROMOTED','PROMOTED_WITH_SUPPORT','ACADEMIC_REVIEW','REPEAT_RECOMMENDED','COMPLETED') then
    raise exception 'SYSTEM_RECOMMENDATION_OUTCOME_INVALID' using errcode = '22023';
  end if;
  if new.was_overridden and (new.reason is null or length(btrim(new.reason)) < 3 or length(btrim(new.reason)) > 2000) then
    raise exception 'PROMOTION_OVERRIDE_REASON_REQUIRED' using errcode = '23514';
  end if;
  return new;
end; $$;

create trigger promotion_decisions_stage17_validate
before insert or update on public.promotion_decisions
for each row execute function internal.validate_promotion_decision_stage17();

create trigger promotion_recommendation_snapshots_prevent_mutation
before update or delete on public.promotion_recommendation_snapshots
for each row execute function internal.prevent_mutation();

create or replace function internal.validate_promotion_snapshot_scope()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare term_school uuid; enrollment_school uuid; run_term uuid; run_grade uuid; rule_school uuid; creator_school uuid;
begin
  select year.school_id into term_school from public.terms term join public.academic_years year on year.id=term.academic_year_id where term.id=new.term_id;
  select student.school_id into enrollment_school from public.enrollments enrollment join public.students student on student.id=enrollment.student_id where enrollment.id=new.enrollment_id;
  select run.term_id,run.grade_level_id into run_term,run_grade from public.result_calculation_runs run where run.id=new.calculation_run_id;
  select school_id into rule_school from public.promotion_rules where id=new.promotion_rule_id;
  select school_id into creator_school from public.school_staff_memberships where id=new.created_by;
  if new.school_id is distinct from term_school or new.school_id is distinct from enrollment_school
     or run_term is distinct from new.term_id or rule_school is distinct from new.school_id
     or (new.created_by is not null and creator_school is distinct from new.school_id) then
    raise exception 'PROMOTION_SNAPSHOT_SCOPE_INVALID' using errcode='23514';
  end if;
  if not exists(select 1 from public.grade_levels grade join public.class_sections section on section.grade_level_id=grade.id join public.enrollments enrollment on enrollment.class_section_id=section.id where enrollment.id=new.enrollment_id and grade.id=run_grade) then
    raise exception 'PROMOTION_SNAPSHOT_GRADE_INVALID' using errcode='23514';
  end if;
  return new;
end; $$;

create trigger promotion_recommendation_snapshots_validate_scope
before insert on public.promotion_recommendation_snapshots
for each row execute function internal.validate_promotion_snapshot_scope();

create or replace function internal.validate_student_progression_scope()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare source_school uuid; actor_school uuid; target_year_school uuid; target_grade_school uuid; target_section_year uuid;
begin
  select school_id into source_school from public.students student join public.enrollments enrollment on enrollment.student_id=student.id where enrollment.id=new.source_enrollment_id;
  select school_id into actor_school from public.school_staff_memberships where id=new.applied_by;
  select school_id into target_year_school from public.academic_years where id=new.target_academic_year_id;
  select school_id into target_grade_school from public.grade_levels where id=new.target_grade_level_id;
  select academic_year_id into target_section_year from public.class_sections where id=new.target_class_section_id;
  if source_school is distinct from new.school_id or actor_school is distinct from new.school_id
     or (new.target_academic_year_id is not null and target_year_school is distinct from new.school_id)
     or (new.target_grade_level_id is not null and target_grade_school is distinct from new.school_id)
     or (new.target_class_section_id is not null and target_section_year is distinct from new.target_academic_year_id) then
    raise exception 'PROGRESSION_SCOPE_INVALID' using errcode = '23514';
  end if;
  return new;
end; $$;

create trigger student_progressions_validate_scope before insert on public.student_progressions
for each row execute function internal.validate_student_progression_scope();
create trigger student_progressions_prevent_mutation before update or delete on public.student_progressions
for each row execute function internal.prevent_mutation();

create or replace function public.list_promotion_scopes()
returns table(academic_year_id uuid, academic_year_name text, term_id uuid, term_name text, is_promotion_term boolean,
  grade_level_id uuid, grade_name text, grade_is_final boolean, rule_id uuid, rule_version integer, rule_name text,
  current_run_id uuid, calculation_version integer, readiness_state text, learner_count bigint, decision_count bigint)
language plpgsql stable security definer set search_path = pg_catalog, public, internal as $$
declare actor record; item record; rule public.promotion_rules%rowtype; run_id uuid; run_version integer; state text;
begin
  select * into actor from internal.require_promotion_reader();
  for item in select year.id year_id, year.name year_name, term.id term_id, term.name term_name, term.is_promotion_term,
      grade.id grade_id, grade.name grade_name, grade.is_final_grade
    from public.academic_years year join public.terms term on term.academic_year_id=year.id
    join public.grade_levels grade on grade.school_id=actor.school_id and grade.is_active where year.school_id=actor.school_id
    order by year.starts_on desc, term.term_number, grade.sort_order, grade.id loop
    rule := null; begin rule := internal.resolve_promotion_rule(actor.school_id,item.year_id,item.grade_id); exception when others then null; end;
    select run.id,run.version into run_id,run_version from public.result_calculation_runs run where run.term_id=item.term_id and run.grade_level_id=item.grade_id order by run.version desc,run.id desc limit 1;
    if not item.is_promotion_term then state := 'TERM_NOT_CONFIGURED';
    elsif rule.id is null then state := 'NO_ACTIVE_RULE';
    elsif not internal.validate_promotion_required_subjects(rule,actor.school_id,item.grade_id) or not internal.validate_promotion_additional_rules(rule) then state := 'UNSUPPORTED_RULE';
    elsif run_id is null then state := 'NO_RUN';
    elsif not internal.analytics_run_is_current(run_id,actor.school_id) then state := 'STALE_RUN'; else state := 'CURRENT'; end if;
    academic_year_id:=item.year_id;academic_year_name:=item.year_name;term_id:=item.term_id;term_name:=item.term_name;is_promotion_term:=item.is_promotion_term;grade_level_id:=item.grade_id;grade_name:=item.grade_name;grade_is_final:=item.is_final_grade;rule_id:=rule.id;rule_version:=rule.version;rule_name:=rule.name;current_run_id:=run_id;calculation_version:=run_version;readiness_state:=state;
    select count(*) into learner_count from public.enrollments e join public.class_sections s on s.id=e.class_section_id where e.academic_year_id=item.year_id and s.grade_level_id=item.grade_id and e.status in ('ACTIVE','REPEATING');
    select count(*) into decision_count from public.promotion_decisions d where d.term_id=item.term_id and d.superseded_by is null and d.enrollment_id in (select e.id from public.enrollments e join public.class_sections s on s.id=e.class_section_id where e.academic_year_id=item.year_id and s.grade_level_id=item.grade_id);
    return next;
  end loop;
end; $$;

create or replace function public.generate_promotion_recommendations(target_term_id uuid, target_grade_level_id uuid)
returns table(enrollment_id uuid, decision_id uuid, decision_version integer, snapshot_id uuid, system_recommendation public.promotion_outcome, snapshot_checksum text, state text)
language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare actor record; scope record; built record; enrollment_row public.enrollments%rowtype; created_snapshot public.promotion_recommendation_snapshots%rowtype; created public.promotion_decisions%rowtype; old_decision_id uuid; next_version integer;
begin
  select * into actor from internal.require_promotion_actor();
  select term.id,term.academic_year_id,term.is_promotion_term,year.school_id into scope from public.terms term join public.academic_years year on year.id=term.academic_year_id where term.id=target_term_id and year.school_id=actor.school_id;
  if not found or not scope.is_promotion_term then raise exception 'PROMOTION_TERM_REQUIRED' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_term_id::text || ':' || target_grade_level_id::text, 11011));
  for enrollment_row in select e.* from public.enrollments e join public.class_sections s on s.id=e.class_section_id where e.academic_year_id=scope.academic_year_id and s.grade_level_id=target_grade_level_id and e.status in ('ACTIVE','REPEATING') order by e.id loop
    begin select * into built from internal.promotion_snapshot_for(actor.school_id,target_term_id,enrollment_row.id); exception when others then raise; end;
    select d.* into created from public.promotion_decisions d where d.term_id=target_term_id and d.enrollment_id=enrollment_row.id and d.superseded_by is null for update;
    if found and created.final_decision is not null then
      enrollment_id:=enrollment_row.id;decision_id:=created.id;decision_version:=created.version;snapshot_id:=created.recommendation_snapshot_id;system_recommendation:=created.system_recommendation;snapshot_checksum:=coalesce((select snapshot.snapshot_checksum from public.promotion_recommendation_snapshots snapshot where snapshot.id=created.recommendation_snapshot_id),'');state:='CONFIRMED';return next;continue;
    end if;
    if found and created.recommendation_snapshot_id is not null and exists(select 1 from public.promotion_recommendation_snapshots s where s.id=created.recommendation_snapshot_id and s.snapshot_checksum=built.snapshot_checksum) then
      enrollment_id:=enrollment_row.id;decision_id:=created.id;decision_version:=created.version;snapshot_id:=created.recommendation_snapshot_id;system_recommendation:=created.system_recommendation;snapshot_checksum:=built.snapshot_checksum;state:='CURRENT';return next;continue;
    end if;
    insert into public.promotion_recommendation_snapshots(school_id,term_id,enrollment_id,calculation_run_id,promotion_rule_id,schema_version,snapshot_data,snapshot_checksum,created_by)
      values(actor.school_id,target_term_id,enrollment_row.id,built.calculation_run_id,built.promotion_rule_id,1,built.snapshot_data,built.snapshot_checksum,actor.membership_id)
      on conflict on constraint promotion_snapshot_term_enrollment_run_unique do nothing returning * into created_snapshot;
    if not found then select * into created_snapshot from public.promotion_recommendation_snapshots s where s.term_id=target_term_id and s.enrollment_id=enrollment_row.id and s.calculation_run_id=built.calculation_run_id and s.promotion_rule_id=built.promotion_rule_id and s.snapshot_checksum=built.snapshot_checksum; end if;
    if created.id is not null then
      old_decision_id := created.id;
      next_version:=created.version+1;
      insert into public.promotion_decisions(term_id,enrollment_id,version,recommendation_snapshot_id,promotion_rule_id,system_recommendation,superseded_by) values(target_term_id,enrollment_row.id,next_version,created_snapshot.id,built.promotion_rule_id,built.system_recommendation,old_decision_id) returning * into created;
      update public.promotion_decisions set superseded_by=created.id where id=old_decision_id;
      update public.promotion_decisions set superseded_by=null where id=created.id;
    else
      insert into public.promotion_decisions(term_id,enrollment_id,version,recommendation_snapshot_id,promotion_rule_id,system_recommendation) values(target_term_id,enrollment_row.id,1,created_snapshot.id,built.promotion_rule_id,built.system_recommendation) returning * into created;
    end if;
    enrollment_id:=enrollment_row.id;decision_id:=created.id;decision_version:=created.version;snapshot_id:=created_snapshot.id;system_recommendation:=created.system_recommendation;snapshot_checksum:=built.snapshot_checksum;state:='GENERATED';return next;
  end loop;
end; $$;

create or replace function public.confirm_promotion_decision(target_decision_id uuid, target_final_decision public.promotion_outcome, decision_reason text default null)
returns table(decision_id uuid, decision_version integer, final_decision public.promotion_outcome, was_overridden boolean, snapshot_checksum text)
language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare actor record; decision public.promotion_decisions%rowtype; built record; override boolean;
begin
  select * into actor from internal.require_promotion_actor();
  select d.* into decision from public.promotion_decisions d join public.terms term on term.id=d.term_id join public.academic_years year on year.id=term.academic_year_id where d.id=target_decision_id and year.school_id=actor.school_id and d.superseded_by is null for update;
  if not found then raise exception 'PROMOTION_DECISION_NOT_FOUND' using errcode='P0002'; end if;
  if decision.final_decision is not null then raise exception 'PROMOTION_DECISION_CONFIRMED_IMMUTABLE' using errcode='55000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(decision.term_id::text || ':' || (select section.grade_level_id::text from public.enrollments e join public.class_sections section on section.id=e.class_section_id where e.id=decision.enrollment_id), 11011));
  select * into built from internal.promotion_snapshot_for(actor.school_id,decision.term_id,decision.enrollment_id);
  if decision.recommendation_snapshot_id is distinct from (select s.id from public.promotion_recommendation_snapshots s where s.snapshot_checksum=built.snapshot_checksum and s.id=decision.recommendation_snapshot_id) then raise exception 'PROMOTION_RECOMMENDATION_STALE' using errcode='40001'; end if;
  if target_final_decision not in ('PROMOTED','PROMOTED_WITH_SUPPORT','ACADEMIC_REVIEW','REPEAT_CONFIRMED','COMPLETED') then raise exception 'FINAL_DECISION_OUTCOME_INVALID' using errcode='22023'; end if;
  if target_final_decision='COMPLETED' and not exists (
    select 1 from public.enrollments e join public.class_sections section on section.id=e.class_section_id
    join public.grade_levels grade on grade.id=section.grade_level_id
    where e.id=decision.enrollment_id and grade.is_final_grade
  ) then raise exception 'FINAL_GRADE_COMPLETION_REQUIRED' using errcode='23514'; end if;
  override := not (decision.system_recommendation=target_final_decision or (decision.system_recommendation='REPEAT_RECOMMENDED' and target_final_decision='REPEAT_CONFIRMED'));
  if override and (decision_reason is null or length(btrim(decision_reason))<3 or length(btrim(decision_reason))>2000) then raise exception 'PROMOTION_OVERRIDE_REASON_REQUIRED' using errcode='22023'; end if;
  update public.promotion_decisions set final_decision=target_final_decision,reason=nullif(btrim(decision_reason),''),was_overridden=override,confirmed_by=actor.membership_id,confirmed_at=now() where id=decision.id;
  perform internal.record_student_audit(actor.profile_id,actor.membership_id,actor.school_id,'PROMOTION_DECISION_CONFIRMED','promotion_decision',decision.id,null,jsonb_build_object('version',decision.version,'system_recommendation',decision.system_recommendation,'final_decision',target_final_decision,'was_overridden',override),decision_reason);
  decision_id:=decision.id;decision_version:=decision.version;final_decision:=target_final_decision;was_overridden:=override;snapshot_checksum:=built.snapshot_checksum;return next;
end; $$;

create or replace function public.reopen_promotion_decision(target_decision_id uuid, reopen_reason text)
returns table(decision_id uuid, decision_version integer, snapshot_id uuid, system_recommendation public.promotion_outcome, snapshot_checksum text)
language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare actor record; old public.promotion_decisions%rowtype; built record; snap public.promotion_recommendation_snapshots%rowtype; created public.promotion_decisions%rowtype;
begin
  select * into actor from internal.require_promotion_actor(); if reopen_reason is null or length(btrim(reopen_reason))<3 or length(btrim(reopen_reason))>2000 then raise exception 'PROMOTION_REOPEN_REASON_REQUIRED' using errcode='22023'; end if;
  select d.* into old from public.promotion_decisions d join public.terms term on term.id=d.term_id join public.academic_years year on year.id=term.academic_year_id where d.id=target_decision_id and year.school_id=actor.school_id and d.superseded_by is null for update;
  if not found or old.final_decision is null then raise exception 'PROMOTION_REOPEN_REQUIRES_CONFIRMED' using errcode='23514'; end if;
  if exists(select 1 from public.student_progressions p where p.source_decision_id=old.id) then raise exception 'PROMOTION_ALREADY_PROGRESSED' using errcode='55006'; end if;
  perform pg_advisory_xact_lock(hashtextextended(old.term_id::text || ':' || (select section.grade_level_id::text from public.enrollments e join public.class_sections section on section.id=e.class_section_id where e.id=old.enrollment_id), 11011));
  select * into built from internal.promotion_snapshot_for(actor.school_id,old.term_id,old.enrollment_id);
  insert into public.promotion_recommendation_snapshots(school_id,term_id,enrollment_id,calculation_run_id,promotion_rule_id,schema_version,snapshot_data,snapshot_checksum,created_by)
    values(actor.school_id,old.term_id,old.enrollment_id,built.calculation_run_id,built.promotion_rule_id,1,built.snapshot_data,built.snapshot_checksum,actor.membership_id)
    on conflict on constraint promotion_snapshot_term_enrollment_run_unique do nothing returning * into snap;
  if not found then select * into snap from public.promotion_recommendation_snapshots s where s.term_id=old.term_id and s.enrollment_id=old.enrollment_id and s.calculation_run_id=built.calculation_run_id and s.promotion_rule_id=built.promotion_rule_id and s.snapshot_checksum=built.snapshot_checksum; end if;
  insert into public.promotion_decisions(term_id,enrollment_id,version,recommendation_snapshot_id,promotion_rule_id,system_recommendation,superseded_by) values(old.term_id,old.enrollment_id,old.version+1,snap.id,built.promotion_rule_id,built.system_recommendation,old.id) returning * into created;
  update public.promotion_decisions set superseded_by=created.id where id=old.id;
  update public.promotion_decisions set superseded_by=null where id=created.id;
  perform internal.record_student_audit(actor.profile_id,actor.membership_id,actor.school_id,'PROMOTION_DECISION_REOPENED','promotion_decision',created.id,jsonb_build_object('superseded_decision_id',old.id,'version',old.version),jsonb_build_object('version',created.version,'system_recommendation',created.system_recommendation),reopen_reason);
  decision_id:=created.id;decision_version:=created.version;snapshot_id:=snap.id;system_recommendation:=created.system_recommendation;snapshot_checksum:=built.snapshot_checksum;return next;
end; $$;

create or replace function public.apply_student_progression(target_decision_id uuid, target_academic_year_id uuid default null, target_class_section_id uuid default null)
returns table(progression_id uuid, target_enrollment_id uuid, outcome public.promotion_outcome, target_grade_level_id uuid, idempotent boolean)
language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare actor record; decision public.promotion_decisions%rowtype; enrollment_row public.enrollments%rowtype; source_section public.class_sections%rowtype; source_grade public.grade_levels%rowtype; source_year public.academic_years%rowtype; target_year public.academic_years%rowtype; target_grade public.grade_levels%rowtype; destination public.class_sections%rowtype; progression public.student_progressions%rowtype; built record; target_status public.enrollment_status; capacity integer; occupied integer; checksum text;
begin
  select * into actor from internal.require_promotion_actor();
  select p.* into progression from public.student_progressions p where p.source_decision_id=target_decision_id; if found then progression_id:=progression.id;target_enrollment_id:=progression.target_enrollment_id;outcome:=progression.outcome;target_grade_level_id:=progression.target_grade_level_id;idempotent:=true;return next;end if;
  select d.* into decision from public.promotion_decisions d join public.terms term on term.id=d.term_id join public.academic_years year on year.id=term.academic_year_id where d.id=target_decision_id and year.school_id=actor.school_id and d.superseded_by is null for update;
  if not found or decision.final_decision is null then raise exception 'PROMOTION_DECISION_CONFIRMATION_REQUIRED' using errcode='23514'; end if;
  select p.* into progression from public.student_progressions p where p.source_decision_id=decision.id;
  if found then progression_id:=progression.id;target_enrollment_id:=progression.target_enrollment_id;outcome:=progression.outcome;target_grade_level_id:=progression.target_grade_level_id;idempotent:=true;return next;end if;
  perform pg_advisory_xact_lock(hashtextextended(decision.term_id::text || ':' || (select section.grade_level_id::text from public.enrollments e join public.class_sections section on section.id=e.class_section_id where e.id=decision.enrollment_id), 11011));
  select * into built from internal.promotion_snapshot_for(actor.school_id,decision.term_id,decision.enrollment_id);
  if (select snapshot_checksum from public.promotion_recommendation_snapshots where id=decision.recommendation_snapshot_id) is distinct from built.snapshot_checksum then raise exception 'PROMOTION_RECOMMENDATION_STALE' using errcode='40001'; end if;
  select e.* into enrollment_row from public.enrollments e where e.id=decision.enrollment_id for update;
  select s.* into source_section from public.class_sections s where s.id=enrollment_row.class_section_id;
  select g.* into source_grade from public.grade_levels g where g.id=source_section.grade_level_id;
  select y.* into source_year from public.academic_years y where y.id=enrollment_row.academic_year_id;
  if decision.final_decision='COMPLETED' then
    update public.enrollments set status='COMPLETED',exited_on=current_date where id=enrollment_row.id;
    update public.students set status='COMPLETED' where id=enrollment_row.student_id;
    checksum:=encode(extensions.digest(concat_ws('|',decision.id,decision.version,'COMPLETED'), 'sha256'),'hex');
    insert into public.student_progressions(school_id,source_decision_id,source_enrollment_id,outcome,application_checksum,applied_by) values(actor.school_id,decision.id,enrollment_row.id,'COMPLETED',checksum,actor.membership_id) returning * into progression;
  else
    select y.* into target_year from public.academic_years y where y.school_id=actor.school_id and y.starts_on>source_year.starts_on and y.status in ('ACTIVE','DRAFT','CLOSED') order by y.starts_on asc,y.id limit 1;
    if target_year.id is null or (target_academic_year_id is not null and target_academic_year_id is distinct from target_year.id) then raise exception 'PROMOTION_TARGET_YEAR_INVALID' using errcode='23514'; end if;
    if decision.final_decision='REPEAT_CONFIRMED' then target_grade:=source_grade; target_status:='REPEATING'; else select g.* into target_grade from public.grade_levels g where g.school_id=actor.school_id and g.is_active and g.sort_order>source_grade.sort_order order by g.sort_order,g.id limit 1; target_status:='ACTIVE'; end if;
    if target_grade.id is null then raise exception 'PROMOTION_TARGET_GRADE_INVALID' using errcode='23514'; end if;
    if target_class_section_id is null then raise exception 'PROMOTION_TARGET_CLASS_REQUIRED' using errcode='22023'; end if;
    select s.* into destination from public.class_sections s where s.id=target_class_section_id and s.academic_year_id=target_year.id and s.grade_level_id=target_grade.id and s.is_active for update;
    if not found then raise exception 'PROMOTION_TARGET_CLASS_INVALID' using errcode='23514'; end if;
    capacity:=destination.capacity; select count(*) into occupied from public.enrollments e where e.class_section_id=destination.id and e.status in ('ACTIVE','REPEATING'); if capacity is not null and occupied>=capacity then raise exception 'CLASS_CAPACITY_REACHED' using errcode='23514'; end if;
    update public.enrollments set status='COMPLETED',exited_on=current_date where id=enrollment_row.id;
    insert into public.enrollments(student_id,academic_year_id,class_section_id,status,enrolled_on) values(enrollment_row.student_id,target_year.id,destination.id,target_status,target_year.starts_on) returning id into target_enrollment_id;
    update public.students set status='ACTIVE' where id=enrollment_row.student_id;
    checksum:=encode(extensions.digest(concat_ws('|',decision.id,decision.version,target_year.id,target_grade.id,destination.id,target_enrollment_id), 'sha256'),'hex');
    insert into public.student_progressions(school_id,source_decision_id,source_enrollment_id,target_academic_year_id,target_grade_level_id,target_class_section_id,target_enrollment_id,outcome,application_checksum,applied_by) values(actor.school_id,decision.id,enrollment_row.id,target_year.id,target_grade.id,destination.id,target_enrollment_id,decision.final_decision,checksum,actor.membership_id) returning * into progression;
  end if;
  perform internal.record_student_audit(actor.profile_id,actor.membership_id,actor.school_id,'STUDENT_PROGRESSION_APPLIED','student_progression',progression.id,null,jsonb_build_object('source_decision_id',decision.id,'source_enrollment_id',enrollment_row.id,'outcome',progression.outcome,'target_enrollment_id',progression.target_enrollment_id),null);
  progression_id:=progression.id;outcome:=progression.outcome;target_grade_level_id:=progression.target_grade_level_id;idempotent:=false;return next;
end; $$;

create or replace function public.list_promotion_decision_history(target_enrollment_id_arg uuid)
returns table(decision_id uuid, version integer, recommendation_snapshot_id uuid, system_recommendation public.promotion_outcome, final_decision public.promotion_outcome, reason text, was_overridden boolean, confirmed_at timestamptz, superseded_by uuid, progression_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, public, internal as $$
declare actor record;
begin
  select * into actor from internal.require_promotion_reader();
  return query select d.id,d.version,d.recommendation_snapshot_id,d.system_recommendation,d.final_decision,d.reason,d.was_overridden,d.confirmed_at,d.superseded_by,p.id
    from public.promotion_decisions d join public.enrollments e on e.id=d.enrollment_id join public.students s on s.id=e.student_id left join public.student_progressions p on p.source_decision_id=d.id where d.enrollment_id=target_enrollment_id_arg and s.school_id=actor.school_id order by d.version;
end; $$;

create or replace function public.list_promotion_recommendations(target_term_id uuid, target_grade_level_id uuid)
returns table(enrollment_id uuid, decision_id uuid, decision_version integer, snapshot_id uuid,
  system_recommendation public.promotion_outcome, final_decision public.promotion_outcome,
  reason text, was_overridden boolean, snapshot_checksum text, snapshot_data jsonb, state text, progression_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, public, internal as $$
declare actor record; school_id uuid; item record; current_state text;
begin
  select * into actor from internal.require_promotion_reader();
  select year.school_id into school_id from public.terms term join public.academic_years year on year.id=term.academic_year_id where term.id=target_term_id;
  if school_id is distinct from actor.school_id then return; end if;
  for item in
    select d.*, snapshot.snapshot_checksum as stored_checksum, snapshot.snapshot_data, progression.id as applied_progression_id
    from public.promotion_decisions d
    join public.enrollments e on e.id=d.enrollment_id
    join public.class_sections section on section.id=e.class_section_id and section.grade_level_id=target_grade_level_id
    left join public.promotion_recommendation_snapshots snapshot on snapshot.id=d.recommendation_snapshot_id
    left join public.student_progressions progression on progression.source_decision_id=d.id
    where d.term_id=target_term_id and d.superseded_by is null
    order by d.enrollment_id
  loop
    current_state := case when item.applied_progression_id is not null then 'PROGRESSED' when item.final_decision is not null then 'CONFIRMED' else 'RECOMMENDED' end;
    enrollment_id:=item.enrollment_id; decision_id:=item.id; decision_version:=item.version; snapshot_id:=item.recommendation_snapshot_id;
    system_recommendation:=item.system_recommendation; final_decision:=item.final_decision; reason:=item.reason; was_overridden:=item.was_overridden;
    snapshot_checksum:=item.stored_checksum; snapshot_data:=item.snapshot_data; state:=current_state; progression_id:=item.applied_progression_id; return next;
  end loop;
end; $$;

create or replace function public.list_promotion_target_classes(target_decision_id uuid)
returns table(academic_year_id uuid, academic_year_name text, grade_level_id uuid, grade_name text,
  class_section_id uuid, class_name text, capacity integer, occupied bigint, is_available boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, internal as $$
declare actor record; decision public.promotion_decisions%rowtype; enrollment_row public.enrollments%rowtype; source_section public.class_sections%rowtype; source_grade public.grade_levels%rowtype; source_year public.academic_years%rowtype; next_year public.academic_years%rowtype; target_grade public.grade_levels%rowtype;
begin
  select * into actor from internal.require_promotion_reader();
  select d.* into decision from public.promotion_decisions d join public.terms term on term.id=d.term_id join public.academic_years year on year.id=term.academic_year_id where d.id=target_decision_id and d.superseded_by is null and year.school_id=actor.school_id;
  if not found or decision.final_decision not in ('PROMOTED','PROMOTED_WITH_SUPPORT','REPEAT_CONFIRMED') then return; end if;
  select * into enrollment_row from public.enrollments where id=decision.enrollment_id;
  select * into source_section from public.class_sections where id=enrollment_row.class_section_id;
  select * into source_grade from public.grade_levels where id=source_section.grade_level_id;
  select * into source_year from public.academic_years where id=enrollment_row.academic_year_id;
  select * into next_year from public.academic_years y where y.school_id=actor.school_id and y.starts_on>source_year.starts_on and y.status in ('ACTIVE','DRAFT','CLOSED') order by y.starts_on,y.id limit 1;
  if decision.final_decision='REPEAT_CONFIRMED' then target_grade:=source_grade; else select * into target_grade from public.grade_levels g where g.school_id=actor.school_id and g.is_active and g.sort_order>source_grade.sort_order order by g.sort_order,g.id limit 1; end if;
  if next_year.id is null or target_grade.id is null then return; end if;
  return query select next_year.id,next_year.name,target_grade.id,target_grade.name,section.id,section.name,section.capacity,
    (select count(*) from public.enrollments e where e.class_section_id=section.id and e.status in ('ACTIVE','REPEATING'))::bigint,
    section.capacity is null or (select count(*) from public.enrollments e where e.class_section_id=section.id and e.status in ('ACTIVE','REPEATING')) < section.capacity
    from public.class_sections section where section.academic_year_id=next_year.id and section.grade_level_id=target_grade.id and section.is_active order by section.class_code,section.id;
end; $$;

revoke all on function internal.current_promotion_reader() from public, anon, authenticated;
revoke all on function internal.require_promotion_reader() from public, anon, authenticated;
revoke all on function internal.current_promotion_actor() from public, anon, authenticated;
revoke all on function internal.require_promotion_actor() from public, anon, authenticated;
revoke all on function internal.resolve_promotion_rule(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function internal.validate_promotion_required_subjects(public.promotion_rules,uuid,uuid) from public, anon, authenticated;
revoke all on function internal.validate_promotion_additional_rules(public.promotion_rules) from public, anon, authenticated;
revoke all on function internal.promotion_snapshot_for(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function internal.validate_promotion_decision_stage17() from public, anon, authenticated;
revoke all on function internal.validate_student_progression_scope() from public, anon, authenticated;
revoke all on function internal.validate_promotion_snapshot_scope() from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.list_promotion_scopes() to authenticated;
grant execute on function public.generate_promotion_recommendations(uuid,uuid) to authenticated;
grant execute on function public.confirm_promotion_decision(uuid,public.promotion_outcome,text) to authenticated;
grant execute on function public.reopen_promotion_decision(uuid,text) to authenticated;
grant execute on function public.apply_student_progression(uuid,uuid,uuid) to authenticated;
grant execute on function public.list_promotion_decision_history(uuid) to authenticated;
grant execute on function public.list_promotion_recommendations(uuid,uuid) to authenticated;
grant execute on function public.list_promotion_target_classes(uuid) to authenticated;

comment on table public.promotion_recommendation_snapshots is 'Immutable, deterministic evidence for one Stage 17 recommendation.';
comment on table public.student_progressions is 'Explicit, idempotent next-year enrollment applications. Confirmation alone never creates a row here.';
