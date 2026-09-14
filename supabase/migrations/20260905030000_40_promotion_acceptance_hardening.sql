-- Stage 17 acceptance hardening.
-- Migration 39 remains immutable. This migration replaces only the exposed
-- promotion helpers/RPCs and adds the immutable progression application proof.

alter table public.student_progressions
  add column if not exists application_snapshot jsonb;

alter table public.student_progressions
  add constraint student_progression_application_snapshot_object
  check (application_snapshot is null or jsonb_typeof(application_snapshot) = 'object');

-- Migration 13 temporarily required an array-shaped value. Preserve any
-- existing array entries while moving them to the explicit Stage 17 object
-- envelope before tightening the table contract.
update public.promotion_rules
set required_subject_rules = jsonb_build_object(
  'schema_version', 1, 'subjects', required_subject_rules)
where jsonb_typeof(required_subject_rules) = 'array';

alter table public.promotion_rules
  drop constraint promotion_rules_required_subject_rules_check,
  add constraint promotion_rules_required_subject_rules_check
  check (
    required_subject_rules = '{}'::jsonb
    or (
      jsonb_typeof(required_subject_rules) = 'object'
      and required_subject_rules ?& array['schema_version', 'subjects']
      and required_subject_rules - array['schema_version', 'subjects'] = '{}'::jsonb
      and jsonb_typeof(required_subject_rules->'schema_version') = 'number'
      and required_subject_rules->>'schema_version' = '1'
      and jsonb_typeof(required_subject_rules->'subjects') = 'array'
    )
  );

create index if not exists student_progressions_decision_school_idx
  on public.student_progressions (source_decision_id, school_id);

-- Progression is the one authorized workflow that closes a locked source
-- enrollment after its evidence has been consumed. Keep the Stage 10 guard for
-- every ordinary roster writer, but allow only this exact status-only transition
-- while the Stage 17 RPC holds the source locks.
create or replace function internal.lock_enrollment_terms_for_marks_workflow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_year_id uuid;
  new_year_id uuid;
  old_class_section_id uuid;
  new_class_section_id uuid;
  roster_identity_changed boolean;
  frozen_term_id uuid;
begin
  old_year_id := case when tg_op in ('UPDATE', 'DELETE') then old.academic_year_id end;
  new_year_id := case when tg_op in ('INSERT', 'UPDATE') then new.academic_year_id end;
  old_class_section_id := case when tg_op in ('UPDATE', 'DELETE') then old.class_section_id end;
  new_class_section_id := case when tg_op in ('INSERT', 'UPDATE') then new.class_section_id end;

  roster_identity_changed := case
    when tg_op <> 'UPDATE' then true
    else row(old.student_id, old.academic_year_id, old.class_section_id,
      old.enrolled_on, old.exited_on) is distinct from row(new.student_id,
      new.academic_year_id, new.class_section_id, new.enrolled_on, new.exited_on)
  end;
  if not roster_identity_changed then return new; end if;

  if current_setting('app.promotion_progression_transition', true) = 'allowed'
     and tg_op = 'UPDATE'
     and old.student_id = new.student_id
     and old.academic_year_id = new.academic_year_id
     and old.class_section_id = new.class_section_id
     and old.enrolled_on = new.enrolled_on
     and old.status in ('ACTIVE', 'REPEATING')
     and new.status = 'COMPLETED'
     and new.exited_on is not null then
    return new;
  end if;

  begin
    perform term.id
    from public.terms term
    where term.academic_year_id in (old_year_id, new_year_id)
    order by term.id
    for update nowait;
  exception when lock_not_available then
    raise exception 'ENROLLMENT_MARKS_WORKFLOW_CONFLICT' using errcode = 'PT409';
  end;

  select term.id into frozen_term_id
  from public.terms term
  where term.academic_year_id in (old_year_id, new_year_id)
    and ((tg_op in ('UPDATE', 'DELETE') and term.academic_year_id = old_year_id
      and old.enrolled_on <= term.ends_on
      and (old.exited_on is null or old.exited_on >= term.starts_on))
      or (tg_op in ('INSERT', 'UPDATE') and term.academic_year_id = new_year_id
      and new.enrolled_on <= term.ends_on
      and (new.exited_on is null or new.exited_on >= term.starts_on)))
    and (term.status in ('REVIEW', 'LOCKED') or exists (
      select 1 from public.mark_sheets sheet
      where sheet.term_id = term.id
        and sheet.workflow_status in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'LOCKED')
        and sheet.class_section_id in (old_class_section_id, new_class_section_id)))
  order by term.id limit 1;
  if frozen_term_id is not null then
    raise exception 'ENROLLMENT_MARKS_WORKFLOW_FROZEN' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- Align the configuration write path with the same explicit schemas consumed by
-- promotion generation. This replaces the pre-Stage-17 boolean-only contract.
create or replace function internal.assert_promotion_configuration(
  actor_school_id uuid,
  target_grade_level_id uuid,
  rule_required_subjects jsonb,
  rule_additional_configuration jsonb
)
returns void
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  if jsonb_typeof(rule_required_subjects) <> 'object'
     or (rule_required_subjects <> '{}'::jsonb and not (
       rule_required_subjects ?& array['schema_version', 'subjects']
       and rule_required_subjects - array['schema_version', 'subjects'] = '{}'::jsonb
       and jsonb_typeof(rule_required_subjects->'schema_version') = 'number'
       and rule_required_subjects->>'schema_version' = '1'
       and jsonb_typeof(rule_required_subjects->'subjects') = 'array')) then
    raise exception 'ACADEMIC_CONFIGURATION_PROMOTION_RULE_INVALID' using errcode = '22023';
  end if;

  if rule_required_subjects <> '{}'::jsonb and exists (
    select 1 from jsonb_array_elements(rule_required_subjects->'subjects') item
    where jsonb_typeof(item) <> 'object'
      or item - array['subject_id', 'require'] <> '{}'::jsonb
      or jsonb_typeof(item->'subject_id') <> 'string'
      or item->>'subject_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(item->'require') <> 'string'
      or item->>'require' not in ('PASS', 'COMPLETE')
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_PROMOTION_RULE_INVALID' using errcode = '22023';
  end if;
  if rule_required_subjects <> '{}'::jsonb and (
    select count(*) from jsonb_array_elements(rule_required_subjects->'subjects')
  ) <> (
    select count(distinct item->>'subject_id')
    from jsonb_array_elements(rule_required_subjects->'subjects') item
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_PROMOTION_RULE_INVALID' using errcode = '22023';
  end if;
  if rule_required_subjects <> '{}'::jsonb and exists (
    select 1 from jsonb_array_elements(rule_required_subjects->'subjects') item
    left join public.subjects subject
      on subject.id = (item->>'subject_id')::uuid and subject.school_id = actor_school_id
    where subject.id is null or (target_grade_level_id is not null and not exists (
      select 1 from public.grade_level_subjects mapping
      where mapping.grade_level_id = target_grade_level_id and mapping.subject_id = subject.id
    ))
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_SCOPE_INVALID' using errcode = '23514';
  end if;

  if rule_additional_configuration <> '{}'::jsonb and (
    jsonb_typeof(rule_additional_configuration) <> 'object'
    or not (rule_additional_configuration ?& array[
      'schema_version', 'require_complete_result', 'success_outcome',
      'failure_outcome', 'incomplete_outcome'])
    or rule_additional_configuration - array[
      'schema_version', 'require_complete_result', 'success_outcome',
      'failure_outcome', 'incomplete_outcome'] <> '{}'::jsonb
    or jsonb_typeof(rule_additional_configuration->'schema_version') <> 'number'
    or rule_additional_configuration->>'schema_version' <> '1'
    or jsonb_typeof(rule_additional_configuration->'require_complete_result') <> 'boolean'
    or rule_additional_configuration->>'success_outcome' not in ('PROMOTED', 'PROMOTED_WITH_SUPPORT')
    or rule_additional_configuration->>'failure_outcome' not in ('ACADEMIC_REVIEW', 'REPEAT_RECOMMENDED')
    or rule_additional_configuration->>'incomplete_outcome' not in ('ACADEMIC_REVIEW', 'REPEAT_RECOMMENDED')
  ) then
    raise exception 'ACADEMIC_CONFIGURATION_PROMOTION_RULE_INVALID' using errcode = '22023';
  end if;
end;
$$;

create or replace function internal.validate_promotion_additional_rules(
  target_rule public.promotion_rules
)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select target_rule.additional_rules = '{}'::jsonb
    or (
      jsonb_typeof(target_rule.additional_rules) = 'object'
      and target_rule.additional_rules ?& array[
        'schema_version', 'require_complete_result', 'success_outcome',
        'failure_outcome', 'incomplete_outcome'
      ]
      and target_rule.additional_rules - array[
        'schema_version', 'require_complete_result', 'success_outcome',
        'failure_outcome', 'incomplete_outcome'
      ] = '{}'::jsonb
      and target_rule.additional_rules->>'schema_version' = '1'
      and jsonb_typeof(target_rule.additional_rules->'require_complete_result') = 'boolean'
      and jsonb_typeof(target_rule.additional_rules->'success_outcome') = 'string'
      and target_rule.additional_rules->>'success_outcome' in ('PROMOTED', 'PROMOTED_WITH_SUPPORT')
      and jsonb_typeof(target_rule.additional_rules->'failure_outcome') = 'string'
      and target_rule.additional_rules->>'failure_outcome' in ('ACADEMIC_REVIEW', 'REPEAT_RECOMMENDED')
      and jsonb_typeof(target_rule.additional_rules->'incomplete_outcome') = 'string'
      and target_rule.additional_rules->>'incomplete_outcome' in ('ACADEMIC_REVIEW', 'REPEAT_RECOMMENDED')
    );
$$;

create or replace function internal.promotion_additional_rule_values(
  target_rule public.promotion_rules
)
returns table(
  require_complete_result boolean,
  success_outcome public.promotion_outcome,
  failure_outcome public.promotion_outcome,
  incomplete_outcome public.promotion_outcome
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  if not internal.validate_promotion_additional_rules(target_rule) then
    raise exception 'PROMOTION_RULE_UNSUPPORTED' using errcode = 'P0001';
  end if;
  if target_rule.additional_rules = '{}'::jsonb then
    return query select true, 'PROMOTED'::public.promotion_outcome,
      'ACADEMIC_REVIEW'::public.promotion_outcome,
      'ACADEMIC_REVIEW'::public.promotion_outcome;
    return;
  end if;
  return query select
    (target_rule.additional_rules->>'require_complete_result')::boolean,
    (target_rule.additional_rules->>'success_outcome')::public.promotion_outcome,
    (target_rule.additional_rules->>'failure_outcome')::public.promotion_outcome,
    (target_rule.additional_rules->>'incomplete_outcome')::public.promotion_outcome;
end;
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
  enrollment_row public.enrollments%rowtype; student_row public.students%rowtype;
  section_row public.class_sections%rowtype; grade_row public.grade_levels%rowtype;
  rule_row public.promotion_rules%rowtype;
  run_row public.result_calculation_runs%rowtype;
  result_row public.calculated_student_results%rowtype;
  attendance_row public.term_attendance%rowtype;
  subject_json jsonb; criteria jsonb; required jsonb; criterion jsonb;
  has_not_met boolean := false; has_unavailable boolean := false;
  attendance_percentage numeric; recommendation public.promotion_outcome;
  data jsonb; required_subject_id uuid; requirement text;
  subject_status text; subject_pass boolean;
  require_complete_result boolean; success_outcome public.promotion_outcome;
  failure_outcome public.promotion_outcome; incomplete_outcome public.promotion_outcome;
begin
  select term.* into term_row
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id
    and year.school_id = target_school_id;
  if not found or not term_row.is_promotion_term then
    raise exception 'PROMOTION_TERM_REQUIRED' using errcode = '23514';
  end if;

  select year.* into year_row
  from public.academic_years year
  where year.id = term_row.academic_year_id;

  select student.* into student_row
  from public.students student
  join public.enrollments enrollment on enrollment.student_id = student.id
  where enrollment.id = target_enrollment_id;
  if not found
     or student_row.school_id is distinct from target_school_id
     or student_row.status <> 'ACTIVE' then
    raise exception 'PROMOTION_LIFECYCLE_INVALID' using errcode = '23514';
  end if;

  select enrollment.* into enrollment_row
  from public.enrollments enrollment
  where enrollment.id = target_enrollment_id
    and enrollment.status in ('ACTIVE', 'REPEATING');
  if not found then
    raise exception 'PROMOTION_LIFECYCLE_INVALID' using errcode = '23514';
  end if;

  select section.* into section_row
  from public.class_sections section
  where section.id = enrollment_row.class_section_id;
  select grade.* into grade_row
  from public.grade_levels grade
  where grade.id = section_row.grade_level_id;
  if enrollment_row.academic_year_id is distinct from year_row.id
     or section_row.grade_level_id is null
     or grade_row.school_id is distinct from target_school_id then
    raise exception 'PROMOTION_SCOPE_INVALID' using errcode = '23514';
  end if;

  rule_row := internal.resolve_promotion_rule(target_school_id, year_row.id, grade_row.id);
  if not internal.validate_promotion_required_subjects(
    rule_row, target_school_id, grade_row.id)
    or not internal.validate_promotion_additional_rules(rule_row) then
    raise exception 'PROMOTION_RULE_UNSUPPORTED' using errcode = 'P0001';
  end if;
  select additional_values.* into require_complete_result, success_outcome,
    failure_outcome, incomplete_outcome
  from internal.promotion_additional_rule_values(rule_row) additional_values;

  select run.* into run_row
  from public.result_calculation_runs run
  where run.term_id = term_row.id and run.grade_level_id = grade_row.id
  order by run.version desc, run.id desc limit 1;
  if run_row.id is null
     or not internal.promotion_analytics_run_is_current(run_row.id, target_school_id) then
    raise exception 'PROMOTION_RESULTS_UNAVAILABLE' using errcode = 'P0002';
  end if;

  select result.* into result_row
  from public.calculated_student_results result
  where result.calculation_run_id = run_row.id
    and result.enrollment_id = enrollment_row.id;
  if not found then
    raise exception 'PROMOTION_RESULTS_UNAVAILABLE' using errcode = 'P0002';
  end if;

  select attendance.* into attendance_row
  from public.term_attendance attendance
  where attendance.term_id = term_row.id
    and attendance.enrollment_id = enrollment_row.id;
  if found and attendance_row.days_open > 0 then
    attendance_percentage := round(attendance_row.days_present * 100.0 / attendance_row.days_open, 2);
  else
    -- Missing attendance and zero days-open are both unavailable evidence.
    attendance_percentage := null;
  end if;

  subject_json := coalesce((select jsonb_agg(jsonb_build_object(
    'subject_id', subject.id, 'subject_code', subject.code, 'subject_name', subject.name,
    'subject_status', result.subject_status, 'is_pass', result.is_pass,
    'score', result.subject_score, 'grade', result.grade
  ) order by mapping.sort_order, subject.id)
  from public.calculated_subject_results result
  join public.subjects subject on subject.id = result.subject_id
  join public.grade_level_subjects mapping
    on mapping.grade_level_id = grade_row.id and mapping.subject_id = result.subject_id
  where result.calculation_run_id = run_row.id
    and result.enrollment_id = enrollment_row.id), '[]'::jsonb);

  criteria := '[]'::jsonb;
  if rule_row.minimum_average is not null then
    criterion := jsonb_build_object(
      'criterion', 'minimum_average', 'threshold', rule_row.minimum_average,
      'actual', result_row.overall_average,
      'state', case when result_row.overall_average is null then 'UNAVAILABLE'
        when result_row.overall_average >= rule_row.minimum_average then 'MET'
        else 'NOT_MET' end);
    criteria := criteria || jsonb_build_array(criterion);
  end if;
  if rule_row.maximum_aggregate is not null then
    criterion := jsonb_build_object(
      'criterion', 'maximum_aggregate', 'threshold', rule_row.maximum_aggregate,
      'actual', result_row.aggregate_total,
      'state', case when result_row.aggregate_total is null then 'UNAVAILABLE'
        when result_row.aggregate_total <= rule_row.maximum_aggregate then 'MET'
        else 'NOT_MET' end);
    criteria := criteria || jsonb_build_array(criterion);
  end if;
  if rule_row.minimum_subjects_passed is not null then
    criterion := jsonb_build_object(
      'criterion', 'minimum_subjects_passed', 'threshold', rule_row.minimum_subjects_passed,
      'actual', result_row.subjects_passed,
      'state', case when result_row.subjects_passed is null then 'UNAVAILABLE'
        when result_row.subjects_passed >= rule_row.minimum_subjects_passed then 'MET'
        else 'NOT_MET' end);
    criteria := criteria || jsonb_build_array(criterion);
  end if;
  if rule_row.minimum_attendance_percentage is not null then
    criterion := jsonb_build_object(
      'criterion', 'minimum_attendance_percentage',
      'threshold', rule_row.minimum_attendance_percentage,
      'actual', attendance_percentage,
      'state', case when attendance_percentage is null then 'UNAVAILABLE'
        when attendance_percentage >= rule_row.minimum_attendance_percentage then 'MET'
        else 'NOT_MET' end);
    criteria := criteria || jsonb_build_array(criterion);
  end if;

  criterion := jsonb_build_object(
    'criterion', 'result_complete', 'threshold', require_complete_result,
    'actual', result_row.is_complete,
    'state', case when result_row.is_complete or not require_complete_result then 'MET'
      else 'NOT_MET' end);
  criteria := criteria || jsonb_build_array(criterion);

  required := rule_row.required_subject_rules;
  if required <> '{}'::jsonb then
    for required_subject_id, requirement in
      select (item->>'subject_id')::uuid, item->>'require'
      from jsonb_array_elements(required->'subjects') item
      order by item->>'subject_id'
    loop
      subject_status := null; subject_pass := null;
      select result.subject_status::text, result.is_pass
      into subject_status, subject_pass
      from public.calculated_subject_results result
      where result.calculation_run_id = run_row.id
        and result.enrollment_id = enrollment_row.id
        and result.subject_id = required_subject_id;
      criterion := jsonb_build_object(
        'criterion', 'required_subject', 'subject_id', required_subject_id,
        'require', requirement,
        'actual', case when subject_status is null then null else
          jsonb_build_object('subject_status', subject_status, 'is_pass', subject_pass) end,
        'state', case when subject_status is null then 'UNAVAILABLE'
          when requirement = 'COMPLETE' and subject_status = 'COMPLETE' then 'MET'
          when requirement = 'PASS' and subject_status = 'COMPLETE'
            and coalesce(subject_pass, false) then 'MET'
          else 'NOT_MET' end);
      criteria := criteria || jsonb_build_array(criterion);
    end loop;
  end if;

  select coalesce(bool_or((item->>'state') = 'NOT_MET'), false)
  into has_not_met from jsonb_array_elements(criteria) item;
  select coalesce(bool_or((item->>'state') = 'UNAVAILABLE'), false)
  into has_unavailable from jsonb_array_elements(criteria) item;

  if has_unavailable then
    recommendation := 'ACADEMIC_REVIEW';
  elsif not result_row.is_complete and require_complete_result then
    recommendation := incomplete_outcome;
  elsif has_not_met then
    recommendation := failure_outcome;
  elsif grade_row.is_final_grade then
    recommendation := 'COMPLETED';
  else
    recommendation := success_outcome;
  end if;

  data := jsonb_build_object(
    'schema_version', 1, 'academic_year_id', year_row.id, 'term_id', term_row.id,
    'grade_level_id', grade_row.id, 'class_section_id', section_row.id,
    'enrollment_id', enrollment_row.id, 'calculation_run_id', run_row.id,
    'calculation_version', run_row.version, 'result_input_checksum', run_row.input_checksum,
    'result_output_checksum', run_row.output_checksum,
    'student_result', jsonb_build_object(
      'overall_total', result_row.overall_total, 'overall_average', result_row.overall_average,
      'overall_grade', result_row.overall_grade, 'aggregate_total', result_row.aggregate_total,
      'aggregate_classification', result_row.aggregate_classification,
      'is_complete', result_row.is_complete, 'subjects_passed', result_row.subjects_passed),
    'subject_evidence', subject_json,
    'attendance', case when attendance_row.id is null then null else jsonb_build_object(
      'days_open', attendance_row.days_open, 'days_present', attendance_row.days_present,
      'days_absent', attendance_row.days_absent, 'times_late', attendance_row.times_late,
      'attendance_percentage', attendance_percentage) end,
    'promotion_rule', jsonb_build_object(
      'id', rule_row.id, 'version', rule_row.version, 'minimum_average', rule_row.minimum_average,
      'maximum_aggregate', rule_row.maximum_aggregate,
      'minimum_subjects_passed', rule_row.minimum_subjects_passed,
      'minimum_attendance_percentage', rule_row.minimum_attendance_percentage,
      'required_subject_rules', rule_row.required_subject_rules,
      'additional_rules', rule_row.additional_rules),
    'criteria', criteria, 'system_recommendation', recommendation);

  calculation_run_id := run_row.id; calculation_version := run_row.version;
  promotion_rule_id := rule_row.id; promotion_rule_version := rule_row.version;
  system_recommendation := recommendation; snapshot_data := data;
  snapshot_checksum := encode(extensions.digest(data::text, 'sha256'), 'hex');
  return next;
end;
$$;

-- Stage 11's input checksum intentionally follows the live ACTIVE/REPEATING
-- enrollment population. A successful Stage 17 application closes the source
-- enrollment, so promotion reads need the same authority check with that one
-- audited transition retained as evidence. Any other source/configuration
-- drift still makes the run unavailable.
create or replace function internal.promotion_results_input_checksum(
  target_term_id uuid,
  target_grade_level_id uuid,
  target_grading_scale_id uuid,
  target_ranking_rule_id uuid,
  target_classification_scale_id uuid default null
)
returns text
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
with latest as (
  select sheet.id as mark_sheet_id, sheet.class_section_id, sheet.subject_id,
    sheet.version as mark_sheet_version, sheet.assessment_scheme_id,
    sheet.workflow_status, mapping.id as grade_level_subject_id,
    mapping.is_required as curriculum_is_required,
    mapping.contributes_to_aggregate as curriculum_contributes_to_aggregate,
    mapping.sort_order as curriculum_sort_order,
    row_number() over (
      partition by sheet.class_section_id, sheet.subject_id
      order by sheet.version desc, sheet.id desc
    ) as source_rank
  from public.mark_sheets sheet
  join public.class_sections section on section.id = sheet.class_section_id
  join public.grade_level_subjects mapping
    on mapping.grade_level_id = target_grade_level_id
   and mapping.subject_id = sheet.subject_id
  where sheet.term_id = target_term_id
    and section.grade_level_id = target_grade_level_id
    and section.is_active
), selected_sources as (
  select * from latest where source_rank = 1
), component_context as (
  select string_agg(concat_ws('|', source.class_section_id, source.subject_id,
    enrollment.id, component.id, mark.id, mark.row_version,
    coalesce(mark.attendance_status::text, ''), coalesce(mark.score::text, ''),
    component.maximum_score, component.weight_percentage, component.is_required),
    ';' order by source.class_section_id, source.subject_id, enrollment.id,
      component.sort_order, component.id, mark.id) as value
  from selected_sources source
  join public.assessment_components component
    on component.assessment_scheme_id = source.assessment_scheme_id
  join public.enrollments enrollment
    on enrollment.class_section_id = source.class_section_id
   and (enrollment.status in ('ACTIVE', 'REPEATING') or exists (
     select 1 from public.student_progressions progression
     where progression.source_enrollment_id = enrollment.id
   ))
  left join public.marks mark
    on mark.mark_sheet_id = source.mark_sheet_id
   and mark.assessment_component_id = component.id
   and mark.enrollment_id = enrollment.id
), grading_context as (
  select concat_ws('|', scale.id, scale.version, coalesce((
    select string_agg(concat_ws('|', band.id, band.score_range::text,
      band.grade, band.aggregate_points, band.is_pass), ';' order by band.id)
    from public.grading_bands band where band.grading_scale_id = scale.id
  ), '')) as value
  from public.grading_scales scale where scale.id = target_grading_scale_id
), ranking_context as (
  select concat_ws('|', rule.id, rule.version, rule.ranking_basis::text,
    rule.tie_method::text, rule.configuration::text) as value
  from public.ranking_rules rule where rule.id = target_ranking_rule_id
), classification_context as (
  select concat_ws('|', scale.id, scale.version, coalesce((
    select string_agg(concat_ws('|', band.id, band.minimum_aggregate,
      band.maximum_aggregate, band.label), ';' order by band.id)
    from public.aggregate_classification_bands band where band.scale_id = scale.id
  ), '')) as value
  from public.aggregate_classification_scales scale
  where scale.id = target_classification_scale_id
)
select encode(extensions.digest(concat_ws(':', target_term_id,
  target_grade_level_id,
  coalesce((select string_agg(concat_ws('|', mark_sheet_id, class_section_id,
    subject_id, mark_sheet_version, assessment_scheme_id, workflow_status::text,
    grade_level_subject_id, curriculum_is_required,
    curriculum_contributes_to_aggregate, curriculum_sort_order), ';'
    order by class_section_id, subject_id, mark_sheet_version, mark_sheet_id)
    from selected_sources), ''),
  coalesce((select value from component_context), ''),
  coalesce((select value from grading_context), ''),
  coalesce((select value from ranking_context), ''),
  coalesce((select value from classification_context), '')), 'sha256'), 'hex');
$$;

create or replace function internal.promotion_analytics_run_is_current(
  target_run_id uuid,
  target_school_id uuid
)
returns boolean
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare run_row public.result_calculation_runs%rowtype;
  expected_count bigint; locked_latest_count bigint; latest_run_id uuid;
begin
  if internal.analytics_run_is_current(target_run_id, target_school_id) then
    return true;
  end if;
  select run.* into run_row
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.grade_levels grade on grade.id = run.grade_level_id
  where run.id = target_run_id and year.school_id = target_school_id
    and grade.school_id = target_school_id;
  if not found or not exists (
    select 1 from public.terms term
    where term.id = run_row.term_id and term.status = 'LOCKED') then
    return false;
  end if;
  select run.id into latest_run_id
  from public.result_calculation_runs run
  where run.term_id = run_row.term_id and run.grade_level_id = run_row.grade_level_id
  order by run.version desc, run.id desc limit 1;
  if latest_run_id is distinct from run_row.id then return false; end if;
  select count(*) into expected_count
  from public.class_sections section
  join public.grade_level_subjects mapping
    on mapping.grade_level_id = run_row.grade_level_id
  where section.academic_year_id = (select term.academic_year_id
    from public.terms term where term.id = run_row.term_id)
    and section.grade_level_id = run_row.grade_level_id and section.is_active;
  select count(*) into locked_latest_count
  from public.class_sections section
  join public.grade_level_subjects mapping
    on mapping.grade_level_id = run_row.grade_level_id
  join lateral (
    select sheet.workflow_status
    from public.mark_sheets sheet
    where sheet.term_id = run_row.term_id
      and sheet.class_section_id = section.id
      and sheet.subject_id = mapping.subject_id
    order by sheet.version desc, sheet.id desc limit 1
  ) latest on true
  where section.academic_year_id = (select term.academic_year_id
    from public.terms term where term.id = run_row.term_id)
    and section.grade_level_id = run_row.grade_level_id
    and section.is_active and latest.workflow_status = 'LOCKED';
  if expected_count = 0 or locked_latest_count <> expected_count then return false; end if;
  return run_row.input_checksum = internal.promotion_results_input_checksum(
    run_row.term_id, run_row.grade_level_id, run_row.grading_scale_id,
    run_row.ranking_rule_id, run_row.aggregate_classification_scale_id);
end;
$$;

create or replace function internal.validate_student_progression_application()
returns trigger
language plpgsql
set search_path = pg_catalog, public, internal
as $$
begin
  if new.application_snapshot is null
     or jsonb_typeof(new.application_snapshot) <> 'object'
     or not (new.application_snapshot ?& array[
       'schema_version', 'school_id', 'decision_id', 'decision_version',
       'recommendation_snapshot_id', 'source_enrollment_id', 'student_id',
       'source_academic_year_id', 'source_grade_level_id', 'source_class_section_id',
       'source_enrollment_status_before', 'student_status_before', 'final_decision',
       'target_academic_year_id', 'target_grade_level_id', 'target_class_section_id',
       'target_enrollment_id', 'target_enrollment_status',
       'source_enrollment_status_after', 'student_status_after'
     ]) then
    raise exception 'PROGRESSION_APPLICATION_SNAPSHOT_REQUIRED' using errcode = '23514';
  end if;
  if new.application_checksum <> encode(
    extensions.digest(new.application_snapshot::text, 'sha256'), 'hex') then
    raise exception 'PROGRESSION_APPLICATION_CHECKSUM_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger student_progressions_validate_application
before insert on public.student_progressions
for each row execute function internal.validate_student_progression_application();

create or replace function internal.validate_promotion_decision_stage17()
returns trigger
language plpgsql
set search_path = pg_catalog, public, internal
as $$
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
       or old.confirmed_by is distinct from new.confirmed_by
       or old.confirmed_at is distinct from new.confirmed_at) then
      raise exception 'PROMOTION_DECISION_CONFIRMED_IMMUTABLE' using errcode = '55000';
    end if;
    if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by
       and not (current_setting('app.promotion_decision_reopen_transition', true) = 'allowed'
         and new.superseded_by is null and new.version = old.version
         and new.term_id = old.term_id and new.enrollment_id = old.enrollment_id
         and new.final_decision is null) then
      raise exception 'PROMOTION_DECISION_HISTORY_IMMUTABLE' using errcode = '55000';
    end if;
  end if;
  if new.final_decision = 'REPEAT_RECOMMENDED'
     or new.final_decision is not null and new.final_decision not in (
       'PROMOTED', 'PROMOTED_WITH_SUPPORT', 'ACADEMIC_REVIEW',
       'REPEAT_CONFIRMED', 'COMPLETED') then
    raise exception 'FINAL_DECISION_OUTCOME_INVALID' using errcode = '22023';
  end if;
  if new.system_recommendation not in (
    'PROMOTED', 'PROMOTED_WITH_SUPPORT', 'ACADEMIC_REVIEW',
    'REPEAT_RECOMMENDED', 'COMPLETED') then
    raise exception 'SYSTEM_RECOMMENDATION_OUTCOME_INVALID' using errcode = '22023';
  end if;
  if new.was_overridden and (new.reason is null or length(btrim(new.reason)) < 3
    or length(btrim(new.reason)) > 2000) then
    raise exception 'PROMOTION_OVERRIDE_REASON_REQUIRED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.list_promotion_scopes()
returns table(academic_year_id uuid, academic_year_name text, term_id uuid, term_name text,
  is_promotion_term boolean, grade_level_id uuid, grade_name text, grade_is_final boolean,
  rule_id uuid, rule_version integer, rule_name text, current_run_id uuid,
  calculation_version integer, readiness_state text, learner_count bigint, decision_count bigint)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; item record; rule public.promotion_rules%rowtype;
  run_id uuid; run_version integer; state text;
begin
  select * into actor from internal.require_promotion_reader();
  for item in
    select year.id year_id, year.name year_name, term.id term_id, term.name term_name,
      term.is_promotion_term, grade.id grade_id, grade.name grade_name, grade.is_final_grade
    from public.academic_years year
    join public.terms term on term.academic_year_id = year.id
    join public.grade_levels grade
      on grade.school_id = actor.school_id and grade.is_active
    where year.school_id = actor.school_id
    order by year.starts_on desc, term.term_number, grade.sort_order, grade.id
  loop
    rule := null;
    begin
      rule := internal.resolve_promotion_rule(actor.school_id, item.year_id, item.grade_id);
    exception when others then null;
    end;
    select run.id, run.version into run_id, run_version
    from public.result_calculation_runs run
    where run.term_id = item.term_id and run.grade_level_id = item.grade_id
    order by run.version desc, run.id desc limit 1;
    if not item.is_promotion_term then state := 'TERM_NOT_CONFIGURED';
    elsif rule.id is null then state := 'NO_ACTIVE_RULE';
    elsif not internal.validate_promotion_required_subjects(rule, actor.school_id, item.grade_id)
      or not internal.validate_promotion_additional_rules(rule) then state := 'UNSUPPORTED_RULE';
    elsif run_id is null then state := 'NO_RUN';
    elsif not internal.promotion_analytics_run_is_current(run_id, actor.school_id) then state := 'STALE_RUN';
    else state := 'CURRENT'; end if;
    academic_year_id := item.year_id; academic_year_name := item.year_name;
    term_id := item.term_id; term_name := item.term_name;
    is_promotion_term := item.is_promotion_term; grade_level_id := item.grade_id;
    grade_name := item.grade_name; grade_is_final := item.is_final_grade;
    rule_id := rule.id; rule_version := rule.version; rule_name := rule.name;
    current_run_id := run_id; calculation_version := run_version; readiness_state := state;
    select count(*) into learner_count
    from public.enrollments enrollment
    join public.students student on student.id = enrollment.student_id
    join public.class_sections section on section.id = enrollment.class_section_id
    where enrollment.academic_year_id = item.year_id
      and section.grade_level_id = item.grade_id
      and enrollment.status in ('ACTIVE', 'REPEATING')
      and student.status = 'ACTIVE';
    select count(*) into decision_count
    from public.promotion_decisions decision
    join public.enrollments enrollment on enrollment.id = decision.enrollment_id
    join public.students student on student.id = enrollment.student_id
    join public.class_sections section on section.id = enrollment.class_section_id
    where decision.term_id = item.term_id and decision.superseded_by is null
      and enrollment.academic_year_id = item.year_id and section.grade_level_id = item.grade_id
      and student.status = 'ACTIVE'
      and enrollment.status in ('ACTIVE', 'REPEATING');
    return next;
  end loop;
end;
$$;

drop function if exists public.confirm_promotion_decision(uuid, public.promotion_outcome, text);
drop function if exists public.reopen_promotion_decision(uuid, text);
drop function if exists public.apply_student_progression(uuid, uuid, uuid);

create or replace function public.generate_promotion_recommendations(
  target_term_id uuid, target_grade_level_id uuid
)
returns table(enrollment_id uuid, decision_id uuid, decision_version integer, snapshot_id uuid,
  system_recommendation public.promotion_outcome, snapshot_checksum text, state text)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; scope record; built record; enrollment_row public.enrollments%rowtype;
  created_snapshot public.promotion_recommendation_snapshots%rowtype;
  created public.promotion_decisions%rowtype; old_decision_id uuid; next_version integer;
begin
  select * into actor from internal.require_promotion_actor();
  select term.id, term.academic_year_id, term.is_promotion_term, year.school_id into scope
  from public.terms term join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id and year.school_id = actor.school_id;
  if not found or not scope.is_promotion_term then
    raise exception 'PROMOTION_TERM_REQUIRED' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    target_term_id::text || ':' || target_grade_level_id::text, 11011));
  for enrollment_row in
    select enrollment.*
    from public.enrollments enrollment
    join public.students student on student.id = enrollment.student_id
    join public.class_sections section on section.id = enrollment.class_section_id
    where enrollment.academic_year_id = scope.academic_year_id
      and section.grade_level_id = target_grade_level_id
      and enrollment.status in ('ACTIVE', 'REPEATING')
      and student.status = 'ACTIVE'
    order by enrollment.id
  loop
    select * into built from internal.promotion_snapshot_for(
      actor.school_id, target_term_id, enrollment_row.id);
    select decision.* into created
    from public.promotion_decisions decision
    where decision.term_id = target_term_id
      and decision.enrollment_id = enrollment_row.id
      and decision.superseded_by is null
    for update;
    if found and created.final_decision is not null then
      enrollment_id := enrollment_row.id; decision_id := created.id;
      decision_version := created.version; snapshot_id := created.recommendation_snapshot_id;
      system_recommendation := created.system_recommendation;
      snapshot_checksum := coalesce((select snapshot.snapshot_checksum
        from public.promotion_recommendation_snapshots snapshot
        where snapshot.id = created.recommendation_snapshot_id), '');
      state := case when snapshot_checksum = built.snapshot_checksum
        then 'CONFIRMED' else 'CONFIRMED_STALE' end;
      return next; continue;
    end if;
    if found and created.recommendation_snapshot_id is not null
       and exists (select 1 from public.promotion_recommendation_snapshots snapshot
         where snapshot.id = created.recommendation_snapshot_id
           and snapshot.snapshot_checksum = built.snapshot_checksum) then
      enrollment_id := enrollment_row.id; decision_id := created.id;
      decision_version := created.version; snapshot_id := created.recommendation_snapshot_id;
      system_recommendation := created.system_recommendation;
      snapshot_checksum := built.snapshot_checksum; state := 'CURRENT'; return next; continue;
    end if;
    insert into public.promotion_recommendation_snapshots(
      school_id, term_id, enrollment_id, calculation_run_id, promotion_rule_id,
      schema_version, snapshot_data, snapshot_checksum, created_by)
    values(actor.school_id, target_term_id, enrollment_row.id, built.calculation_run_id,
      built.promotion_rule_id, 1, built.snapshot_data, built.snapshot_checksum,
      actor.membership_id)
    on conflict on constraint promotion_snapshot_term_enrollment_run_unique
    do nothing returning * into created_snapshot;
    if not found then
      select snapshot.* into created_snapshot
      from public.promotion_recommendation_snapshots snapshot
      where snapshot.term_id = target_term_id and snapshot.enrollment_id = enrollment_row.id
        and snapshot.calculation_run_id = built.calculation_run_id
        and snapshot.promotion_rule_id = built.promotion_rule_id
        and snapshot.snapshot_checksum = built.snapshot_checksum;
    end if;
    if created.id is not null then
      old_decision_id := created.id; next_version := created.version + 1;
      insert into public.promotion_decisions(
        term_id, enrollment_id, version, recommendation_snapshot_id, promotion_rule_id,
        system_recommendation, superseded_by)
      values(target_term_id, enrollment_row.id, next_version, created_snapshot.id,
        built.promotion_rule_id, built.system_recommendation, old_decision_id)
      returning * into created;
      update public.promotion_decisions set superseded_by = created.id
      where id = old_decision_id;
      perform set_config('app.promotion_decision_reopen_transition', 'allowed', true);
      update public.promotion_decisions set superseded_by = null where id = created.id;
    else
      insert into public.promotion_decisions(
        term_id, enrollment_id, version, recommendation_snapshot_id, promotion_rule_id,
        system_recommendation)
      values(target_term_id, enrollment_row.id, 1, created_snapshot.id,
        built.promotion_rule_id, built.system_recommendation)
      returning * into created;
    end if;
    enrollment_id := enrollment_row.id; decision_id := created.id;
    decision_version := created.version; snapshot_id := created_snapshot.id;
    system_recommendation := created.system_recommendation;
    snapshot_checksum := built.snapshot_checksum; state := 'GENERATED'; return next;
  end loop;
end;
$$;

create or replace function public.confirm_promotion_decision(
  target_decision_id uuid,
  expected_decision_version integer,
  target_final_decision public.promotion_outcome,
  decision_reason text default null
)
returns table(decision_id uuid, decision_version integer,
  final_decision public.promotion_outcome, was_overridden boolean, snapshot_checksum text)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; decision public.promotion_decisions%rowtype; built record;
  source_grade public.grade_levels%rowtype; override boolean;
begin
  select * into actor from internal.require_promotion_actor();
  select source_decision.* into decision
  from public.promotion_decisions source_decision
  join public.terms term on term.id = source_decision.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where source_decision.id = target_decision_id and year.school_id = actor.school_id
    and source_decision.superseded_by is null
  for update;
  if not found then raise exception 'PROMOTION_DECISION_NOT_FOUND' using errcode = 'P0002'; end if;
  if decision.version is distinct from expected_decision_version then
    raise exception 'PROMOTION_DECISION_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  if decision.final_decision is not null then
    raise exception 'PROMOTION_DECISION_CONFIRMED_IMMUTABLE' using errcode = '55000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    decision.term_id::text || ':' || (select section.grade_level_id::text
      from public.enrollments enrollment
      join public.class_sections section on section.id = enrollment.class_section_id
      where enrollment.id = decision.enrollment_id), 11011));
  select * into built from internal.promotion_snapshot_for(
    actor.school_id, decision.term_id, decision.enrollment_id);
  if decision.recommendation_snapshot_id is distinct from (
    select snapshot.id from public.promotion_recommendation_snapshots snapshot
    where snapshot.id = decision.recommendation_snapshot_id
      and snapshot.snapshot_checksum = built.snapshot_checksum) then
    raise exception 'PROMOTION_RECOMMENDATION_STALE' using errcode = 'PT409';
  end if;
  select grade.* into source_grade
  from public.enrollments enrollment
  join public.class_sections section on section.id = enrollment.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  where enrollment.id = decision.enrollment_id;
  if target_final_decision not in (
    'PROMOTED', 'PROMOTED_WITH_SUPPORT', 'ACADEMIC_REVIEW',
    'REPEAT_CONFIRMED', 'COMPLETED') then
    raise exception 'FINAL_DECISION_OUTCOME_INVALID' using errcode = '22023';
  end if;
  if source_grade.is_final_grade and target_final_decision in ('PROMOTED', 'PROMOTED_WITH_SUPPORT') then
    raise exception 'FINAL_GRADE_PROMOTION_INVALID' using errcode = '23514';
  end if;
  if not source_grade.is_final_grade and target_final_decision = 'COMPLETED' then
    raise exception 'FINAL_GRADE_COMPLETION_REQUIRED' using errcode = '23514';
  end if;
  override := not (decision.system_recommendation = target_final_decision
    or (decision.system_recommendation = 'REPEAT_RECOMMENDED'
      and target_final_decision = 'REPEAT_CONFIRMED'));
  if override and (decision_reason is null or length(btrim(decision_reason)) < 3
    or length(btrim(decision_reason)) > 2000) then
    raise exception 'PROMOTION_OVERRIDE_REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.promotion_decisions
  set final_decision = target_final_decision,
    reason = nullif(btrim(decision_reason), ''), was_overridden = override,
    confirmed_by = actor.membership_id, confirmed_at = now()
  where id = decision.id;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'PROMOTION_DECISION_CONFIRMED', 'promotion_decision', decision.id, null,
    jsonb_build_object('version', decision.version, 'system_recommendation', decision.system_recommendation,
      'final_decision', target_final_decision, 'was_overridden', override), decision_reason);
  decision_id := decision.id; decision_version := decision.version;
  final_decision := target_final_decision; was_overridden := override;
  snapshot_checksum := built.snapshot_checksum; return next;
end;
$$;

create or replace function public.reopen_promotion_decision(
  target_decision_id uuid,
  expected_decision_version integer,
  reopen_reason text
)
returns table(decision_id uuid, decision_version integer, snapshot_id uuid,
  system_recommendation public.promotion_outcome, snapshot_checksum text)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; old public.promotion_decisions%rowtype; built record;
  snap public.promotion_recommendation_snapshots%rowtype;
  created public.promotion_decisions%rowtype;
begin
  select * into actor from internal.require_promotion_actor();
  if reopen_reason is null or length(btrim(reopen_reason)) < 3
    or length(btrim(reopen_reason)) > 2000 then
    raise exception 'PROMOTION_REOPEN_REASON_REQUIRED' using errcode = '22023';
  end if;
  select decision.* into old
  from public.promotion_decisions decision
  join public.terms term on term.id = decision.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where decision.id = target_decision_id and year.school_id = actor.school_id
    and decision.superseded_by is null
  for update;
  if not found then raise exception 'PROMOTION_REOPEN_REQUIRES_CONFIRMED' using errcode = '23514'; end if;
  if old.version is distinct from expected_decision_version then
    raise exception 'PROMOTION_DECISION_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  if old.final_decision is null then
    raise exception 'PROMOTION_REOPEN_REQUIRES_CONFIRMED' using errcode = '23514';
  end if;
  if exists(select 1 from public.student_progressions progression
    where progression.source_decision_id = old.id) then
    raise exception 'PROMOTION_ALREADY_PROGRESSED' using errcode = '55006';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    old.term_id::text || ':' || (select section.grade_level_id::text
      from public.enrollments enrollment
      join public.class_sections section on section.id = enrollment.class_section_id
      where enrollment.id = old.enrollment_id), 11011));
  select * into built from internal.promotion_snapshot_for(
    actor.school_id, old.term_id, old.enrollment_id);
  insert into public.promotion_recommendation_snapshots(
    school_id, term_id, enrollment_id, calculation_run_id, promotion_rule_id,
    schema_version, snapshot_data, snapshot_checksum, created_by)
  values(actor.school_id, old.term_id, old.enrollment_id, built.calculation_run_id,
    built.promotion_rule_id, 1, built.snapshot_data, built.snapshot_checksum,
    actor.membership_id)
  on conflict on constraint promotion_snapshot_term_enrollment_run_unique
  do nothing returning * into snap;
  if not found then
    select snapshot.* into snap
    from public.promotion_recommendation_snapshots snapshot
    where snapshot.term_id = old.term_id and snapshot.enrollment_id = old.enrollment_id
      and snapshot.calculation_run_id = built.calculation_run_id
      and snapshot.promotion_rule_id = built.promotion_rule_id
      and snapshot.snapshot_checksum = built.snapshot_checksum;
  end if;
  insert into public.promotion_decisions(
    term_id, enrollment_id, version, recommendation_snapshot_id, promotion_rule_id,
    system_recommendation, superseded_by)
  values(old.term_id, old.enrollment_id, old.version + 1, snap.id,
    built.promotion_rule_id, built.system_recommendation, old.id)
  returning * into created;
  update public.promotion_decisions set superseded_by = created.id where id = old.id;
  perform set_config('app.promotion_decision_reopen_transition', 'allowed', true);
  update public.promotion_decisions set superseded_by = null where id = created.id;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'PROMOTION_DECISION_REOPENED', 'promotion_decision', created.id,
    jsonb_build_object('superseded_decision_id', old.id, 'version', old.version),
    jsonb_build_object('version', created.version, 'system_recommendation', created.system_recommendation),
    reopen_reason);
  decision_id := created.id; decision_version := created.version; snapshot_id := snap.id;
  system_recommendation := created.system_recommendation;
  snapshot_checksum := built.snapshot_checksum; return next;
end;
$$;

create or replace function public.apply_student_progression(
  target_decision_id uuid,
  expected_decision_version integer,
  target_academic_year_id uuid default null,
  target_class_section_id uuid default null
)
returns table(progression_id uuid, target_enrollment_id uuid,
  outcome public.promotion_outcome, target_grade_level_id uuid, idempotent boolean)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; decision public.promotion_decisions%rowtype;
  enrollment_row public.enrollments%rowtype; student_row public.students%rowtype;
  source_section public.class_sections%rowtype; source_grade public.grade_levels%rowtype;
  source_year public.academic_years%rowtype; target_year public.academic_years%rowtype;
  target_grade public.grade_levels%rowtype; destination public.class_sections%rowtype;
  progression public.student_progressions%rowtype; built record;
  target_status public.enrollment_status; capacity integer; occupied bigint;
  application_snapshot jsonb; checksum text; supplied_conflict boolean;
begin
  -- The decision is scoped and locked before the idempotency lookup. This is
  -- the cross-school leak prevention boundary.
  select * into actor from internal.require_promotion_actor();
  -- Resolve an already-applied source decision before requiring the decision to
  -- remain current. This is safe across tenants because the immutable source
  -- decision is joined through its term and school, and it supports retries
  -- after a lifecycle transition closes the source enrollment.
  select source_progression.* into progression
  from public.student_progressions source_progression
  where source_progression.source_decision_id = target_decision_id;
  if found then
    select source_decision.* into decision
    from public.promotion_decisions source_decision
    join public.terms source_term on source_term.id = source_decision.term_id
    join public.academic_years source_year_scope
      on source_year_scope.id = source_term.academic_year_id
    where source_decision.id = target_decision_id
      and source_year_scope.school_id = actor.school_id;
    if not found then
      raise exception 'PROMOTION_DECISION_NOT_FOUND' using errcode = 'P0002';
    end if;
    if decision.version is distinct from expected_decision_version then
      raise exception 'PROMOTION_DECISION_VERSION_CONFLICT' using errcode = 'PT409';
    end if;
    supplied_conflict := progression.target_academic_year_id is distinct from target_academic_year_id
      or progression.target_class_section_id is distinct from target_class_section_id;
    if supplied_conflict then
      raise exception 'PROMOTION_PROGRESSION_RETRY_CONFLICT' using errcode = 'PT409';
    end if;
    progression_id := progression.id; target_enrollment_id := progression.target_enrollment_id;
    outcome := progression.outcome; target_grade_level_id := progression.target_grade_level_id;
    idempotent := true; return next; return;
  end if;
  select source_decision.* into decision
  from public.promotion_decisions source_decision
  join public.terms term on term.id = source_decision.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where source_decision.id = target_decision_id and year.school_id = actor.school_id
    and source_decision.superseded_by is null
  for update;
  if not found then raise exception 'PROMOTION_DECISION_NOT_FOUND' using errcode = 'P0002'; end if;
  if decision.version is distinct from expected_decision_version then
    raise exception 'PROMOTION_DECISION_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  if decision.final_decision is null then
    raise exception 'PROMOTION_DECISION_CONFIRMATION_REQUIRED' using errcode = '23514';
  end if;
  if decision.final_decision = 'ACADEMIC_REVIEW' then
    raise exception 'PROMOTION_PROGRESSION_OUTCOME_INVALID' using errcode = '23514';
  end if;
  if decision.final_decision not in (
    'PROMOTED', 'PROMOTED_WITH_SUPPORT', 'REPEAT_CONFIRMED', 'COMPLETED') then
    raise exception 'PROMOTION_PROGRESSION_OUTCOME_INVALID' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    decision.term_id::text || ':' || (select section.grade_level_id::text
      from public.enrollments enrollment
      join public.class_sections section on section.id = enrollment.class_section_id
      where enrollment.id = decision.enrollment_id), 11011));
  select * into built from internal.promotion_snapshot_for(
    actor.school_id, decision.term_id, decision.enrollment_id);
  if (select snapshot.snapshot_checksum from public.promotion_recommendation_snapshots snapshot
      where snapshot.id = decision.recommendation_snapshot_id)
      is distinct from built.snapshot_checksum then
    raise exception 'PROMOTION_RECOMMENDATION_STALE' using errcode = 'PT409';
  end if;

  -- Lock the student first and the source enrollment second, consistently
  -- with lifecycle mutations, then validate both live states.
  select student.* into student_row
  from public.students student
  join public.enrollments enrollment on enrollment.student_id = student.id
  where enrollment.id = decision.enrollment_id
  for update of student;
  select enrollment.* into enrollment_row
  from public.enrollments enrollment
  where enrollment.id = decision.enrollment_id
  for update;
  if student_row.status <> 'ACTIVE' then
    raise exception 'PROMOTION_STUDENT_LIFECYCLE_INVALID' using errcode = '23514';
  end if;
  if enrollment_row.status not in ('ACTIVE', 'REPEATING') then
    raise exception 'PROMOTION_ENROLLMENT_LIFECYCLE_INVALID' using errcode = '23514';
  end if;
  select section.* into source_section from public.class_sections section
  where section.id = enrollment_row.class_section_id;
  select grade.* into source_grade from public.grade_levels grade
  where grade.id = source_section.grade_level_id;
  select year.* into source_year from public.academic_years year
  where year.id = enrollment_row.academic_year_id;
  if source_grade.is_final_grade
     and decision.final_decision in ('PROMOTED', 'PROMOTED_WITH_SUPPORT') then
    raise exception 'FINAL_GRADE_PROMOTION_INVALID' using errcode = '23514';
  end if;

  if decision.final_decision = 'COMPLETED' then
    if not source_grade.is_final_grade then
      raise exception 'FINAL_GRADE_COMPLETION_REQUIRED' using errcode = '23514';
    end if;
    perform set_config('app.promotion_progression_transition', 'allowed', true);
    update public.enrollments
    set status = 'COMPLETED', exited_on = source_year.ends_on
    where id = enrollment_row.id;
    update public.students set status = 'COMPLETED' where id = enrollment_row.student_id;
    application_snapshot := jsonb_build_object(
      'schema_version', 1, 'school_id', actor.school_id, 'decision_id', decision.id,
      'decision_version', decision.version, 'recommendation_snapshot_id', decision.recommendation_snapshot_id,
      'source_enrollment_id', enrollment_row.id, 'student_id', enrollment_row.student_id,
      'source_academic_year_id', source_year.id, 'source_grade_level_id', source_grade.id,
      'source_class_section_id', source_section.id,
      'source_enrollment_status_before', enrollment_row.status,
      'student_status_before', student_row.status, 'final_decision', decision.final_decision,
      'target_academic_year_id', null, 'target_grade_level_id', null,
      'target_class_section_id', null, 'target_enrollment_id', null,
      'target_enrollment_status', null, 'source_enrollment_status_after', 'COMPLETED',
      'student_status_after', 'COMPLETED');
  elsif decision.final_decision in ('PROMOTED', 'PROMOTED_WITH_SUPPORT', 'REPEAT_CONFIRMED') then
    select year.* into target_year
    from public.academic_years year
    where year.school_id = actor.school_id
      and year.ends_on > source_year.ends_on
      and year.starts_on > source_year.ends_on
      and year.status in ('ACTIVE', 'DRAFT')
    order by year.starts_on, year.id limit 1;
    if target_year.id is null
       or (target_academic_year_id is not null
         and target_academic_year_id is distinct from target_year.id) then
      raise exception 'PROMOTION_TARGET_YEAR_INVALID' using errcode = '23514';
    end if;
    if decision.final_decision = 'REPEAT_CONFIRMED' then
      target_grade := source_grade; target_status := 'REPEATING';
    elsif decision.final_decision in ('PROMOTED', 'PROMOTED_WITH_SUPPORT') then
      select grade.* into target_grade from public.grade_levels grade
      where grade.school_id = actor.school_id and grade.is_active
        and grade.sort_order > source_grade.sort_order
      order by grade.sort_order, grade.id limit 1;
      target_status := 'ACTIVE';
    else
      raise exception 'PROMOTION_PROGRESSION_OUTCOME_INVALID' using errcode = '23514';
    end if;
    if target_grade.id is null then
      raise exception 'PROMOTION_TARGET_GRADE_INVALID' using errcode = '23514';
    end if;
    if target_class_section_id is null then
      raise exception 'PROMOTION_TARGET_CLASS_REQUIRED' using errcode = '22023';
    end if;
    select section.* into destination from public.class_sections section
    where section.id = target_class_section_id and section.academic_year_id = target_year.id
      and section.grade_level_id = target_grade.id and section.is_active
    for update;
    if not found then raise exception 'PROMOTION_TARGET_CLASS_INVALID' using errcode = '23514'; end if;
    capacity := destination.capacity;
    select count(*) into occupied from public.enrollments enrollment
    where enrollment.class_section_id = destination.id
      and enrollment.status in ('ACTIVE', 'REPEATING');
    if capacity is not null and occupied >= capacity then
      raise exception 'CLASS_CAPACITY_REACHED' using errcode = '23514';
    end if;
    perform set_config('app.promotion_progression_transition', 'allowed', true);
    update public.enrollments
    set status = 'COMPLETED', exited_on = source_year.ends_on
    where id = enrollment_row.id;
    insert into public.enrollments(
      student_id, academic_year_id, class_section_id, status, enrolled_on)
    values(enrollment_row.student_id, target_year.id, destination.id,
      target_status, target_year.starts_on)
    returning id into target_enrollment_id;
    update public.students set status = 'ACTIVE' where id = enrollment_row.student_id;
    application_snapshot := jsonb_build_object(
      'schema_version', 1, 'school_id', actor.school_id, 'decision_id', decision.id,
      'decision_version', decision.version, 'recommendation_snapshot_id', decision.recommendation_snapshot_id,
      'source_enrollment_id', enrollment_row.id, 'student_id', enrollment_row.student_id,
      'source_academic_year_id', source_year.id, 'source_grade_level_id', source_grade.id,
      'source_class_section_id', source_section.id,
      'source_enrollment_status_before', enrollment_row.status,
      'student_status_before', student_row.status, 'final_decision', decision.final_decision,
      'target_academic_year_id', target_year.id, 'target_grade_level_id', target_grade.id,
      'target_class_section_id', destination.id, 'target_enrollment_id', target_enrollment_id,
      'target_enrollment_status', target_status, 'source_enrollment_status_after', 'COMPLETED',
      'student_status_after', 'ACTIVE');
  else
    raise exception 'PROMOTION_PROGRESSION_OUTCOME_INVALID' using errcode = '23514';
  end if;

  checksum := encode(extensions.digest(application_snapshot::text, 'sha256'), 'hex');
  insert into public.student_progressions(
    school_id, source_decision_id, source_enrollment_id, target_academic_year_id,
    target_grade_level_id, target_class_section_id, target_enrollment_id, outcome,
    application_checksum, application_snapshot, applied_by)
  values(actor.school_id, decision.id, enrollment_row.id, 
    (application_snapshot->>'target_academic_year_id')::uuid,
    (application_snapshot->>'target_grade_level_id')::uuid,
    (application_snapshot->>'target_class_section_id')::uuid,
    (application_snapshot->>'target_enrollment_id')::uuid, decision.final_decision,
    checksum, application_snapshot, actor.membership_id)
  returning * into progression;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_PROGRESSION_APPLIED', 'student_progression', progression.id, null,
    jsonb_build_object('source_decision_id', decision.id, 'source_enrollment_id', enrollment_row.id,
      'outcome', progression.outcome, 'target_enrollment_id', progression.target_enrollment_id), null);
  progression_id := progression.id; outcome := progression.outcome;
  target_grade_level_id := progression.target_grade_level_id; idempotent := false; return next;
end;
$$;

drop function if exists public.list_promotion_recommendations(uuid, uuid);

create or replace function public.list_promotion_recommendations(
  target_term_id uuid, target_grade_level_id uuid
)
returns table(enrollment_id uuid, decision_id uuid, decision_version integer, snapshot_id uuid,
  system_recommendation public.promotion_outcome, final_decision public.promotion_outcome,
  reason text, was_overridden boolean, snapshot_checksum text, snapshot_data jsonb,
  state text, progression_id uuid, progression_application_checksum text)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; scope_school uuid; item record; current_state text; built record;
begin
  select * into actor from internal.require_promotion_reader();
  select year.school_id into scope_school
  from public.terms term join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id;
  if scope_school is distinct from actor.school_id then return; end if;
  for item in
    select decision.*, snapshot.snapshot_checksum stored_checksum, snapshot.snapshot_data,
      progression.id applied_progression_id,
      progression.application_checksum applied_application_checksum
    from public.promotion_decisions decision
    join public.enrollments enrollment on enrollment.id = decision.enrollment_id
    join public.students student on student.id = enrollment.student_id
    join public.class_sections section
      on section.id = enrollment.class_section_id and section.grade_level_id = target_grade_level_id
    left join public.promotion_recommendation_snapshots snapshot
      on snapshot.id = decision.recommendation_snapshot_id
    left join public.student_progressions progression
      on progression.source_decision_id = decision.id
    where decision.term_id = target_term_id and decision.superseded_by is null
      and student.school_id = actor.school_id
    order by decision.enrollment_id
  loop
    if item.applied_progression_id is not null then
      current_state := 'PROGRESSED';
    elsif item.final_decision is not null then
      begin
        select * into built from internal.promotion_snapshot_for(
          actor.school_id, target_term_id, item.enrollment_id);
        current_state := case when item.stored_checksum = built.snapshot_checksum
          then 'CONFIRMED' else 'CONFIRMED_STALE' end;
      exception when others then current_state := 'CONFIRMED_STALE';
      end;
    elsif item.stored_checksum is null then
      current_state := 'RECOMMENDED';
    else
      current_state := 'RECOMMENDED';
    end if;
    enrollment_id := item.enrollment_id; decision_id := item.id; decision_version := item.version;
    snapshot_id := item.recommendation_snapshot_id; system_recommendation := item.system_recommendation;
    final_decision := item.final_decision; reason := item.reason; was_overridden := item.was_overridden;
    snapshot_checksum := item.stored_checksum; snapshot_data := item.snapshot_data;
    state := current_state; progression_id := item.applied_progression_id;
    progression_application_checksum := item.applied_application_checksum; return next;
  end loop;
end;
$$;

create or replace function public.list_promotion_target_classes(target_decision_id uuid)
returns table(academic_year_id uuid, academic_year_name text, grade_level_id uuid, grade_name text,
  class_section_id uuid, class_name text, capacity integer, occupied bigint, is_available boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; decision public.promotion_decisions%rowtype;
  enrollment_row public.enrollments%rowtype; source_section public.class_sections%rowtype;
  source_grade public.grade_levels%rowtype; source_year public.academic_years%rowtype;
  next_year public.academic_years%rowtype; target_grade public.grade_levels%rowtype; built record;
begin
  select * into actor from internal.require_promotion_reader();
  select source_decision.* into decision
  from public.promotion_decisions source_decision
  join public.terms term on term.id = source_decision.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where source_decision.id = target_decision_id and source_decision.superseded_by is null
    and year.school_id = actor.school_id;
  if not found or decision.final_decision not in (
    'PROMOTED', 'PROMOTED_WITH_SUPPORT', 'REPEAT_CONFIRMED') then return; end if;
  begin
    select * into built from internal.promotion_snapshot_for(
      actor.school_id, decision.term_id, decision.enrollment_id);
    if (select snapshot.snapshot_checksum from public.promotion_recommendation_snapshots snapshot
        where snapshot.id = decision.recommendation_snapshot_id)
        is distinct from built.snapshot_checksum then return; end if;
  exception when others then return;
  end;
  select * into enrollment_row from public.enrollments enrollment
  where enrollment.id = decision.enrollment_id;
  select * into source_section from public.class_sections section
  where section.id = enrollment_row.class_section_id;
  select * into source_grade from public.grade_levels grade
  where grade.id = source_section.grade_level_id;
  select * into source_year from public.academic_years year
  where year.id = enrollment_row.academic_year_id;
  select * into next_year from public.academic_years year
  where year.school_id = actor.school_id and year.starts_on > source_year.ends_on
    and year.ends_on > source_year.ends_on and year.status in ('ACTIVE', 'DRAFT')
  order by year.starts_on, year.id limit 1;
  if decision.final_decision = 'REPEAT_CONFIRMED' then
    target_grade := source_grade;
  else
    select * into target_grade from public.grade_levels grade
    where grade.school_id = actor.school_id and grade.is_active
      and grade.sort_order > source_grade.sort_order
    order by grade.sort_order, grade.id limit 1;
  end if;
  if next_year.id is null or target_grade.id is null then return; end if;
  return query select next_year.id, next_year.name, target_grade.id, target_grade.name,
    section.id, section.name, section.capacity,
    (select count(*) from public.enrollments enrollment
      where enrollment.class_section_id = section.id
        and enrollment.status in ('ACTIVE', 'REPEATING'))::bigint,
    section.capacity is null or (select count(*) from public.enrollments enrollment
      where enrollment.class_section_id = section.id
        and enrollment.status in ('ACTIVE', 'REPEATING')) < section.capacity
  from public.class_sections section
  where section.academic_year_id = next_year.id and section.grade_level_id = target_grade.id
    and section.is_active
  order by section.class_code, section.id;
end;
$$;

revoke all on function internal.promotion_additional_rule_values(public.promotion_rules)
  from public, anon, authenticated;
revoke all on function internal.promotion_results_input_checksum(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function internal.promotion_analytics_run_is_current(uuid, uuid)
  from public, anon, authenticated;
revoke all on function internal.validate_promotion_additional_rules(public.promotion_rules)
  from public, anon, authenticated;
revoke all on function internal.promotion_snapshot_for(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function internal.validate_student_progression_application()
  from public, anon, authenticated;
revoke execute on function public.confirm_promotion_decision(uuid, integer, public.promotion_outcome, text)
  from public, anon;
revoke execute on function public.reopen_promotion_decision(uuid, integer, text)
  from public, anon;
revoke execute on function public.apply_student_progression(uuid, integer, uuid, uuid)
  from public, anon;
grant execute on function public.generate_promotion_recommendations(uuid, uuid) to authenticated;
grant execute on function public.confirm_promotion_decision(uuid, integer, public.promotion_outcome, text) to authenticated;
grant execute on function public.reopen_promotion_decision(uuid, integer, text) to authenticated;
grant execute on function public.apply_student_progression(uuid, integer, uuid, uuid) to authenticated;

comment on column public.student_progressions.application_snapshot is
  'Immutable canonical evidence frozen when explicit progression is applied.';
