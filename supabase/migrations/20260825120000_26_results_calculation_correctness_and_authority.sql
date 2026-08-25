-- Stage 11 final correctness and authority corrections. Migrations 23-25 remain unchanged.

create or replace function internal.lock_and_require_results_authority()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language plpgsql volatile security definer
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
    raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501';
  end if;

  select selection.* into selected_selection
  from internal.staff_session_active_memberships selection
  where selection.session_id = current_session_id
    and selection.profile_id = current_profile_id
  for update;
  if not found then
    raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501';
  end if;

  select membership.* into selected_membership
  from public.school_staff_memberships membership
  where membership.id = selected_selection.membership_id
  for update;
  if not found or selected_membership.profile_id is distinct from current_profile_id
     or selected_membership.status <> 'ACTIVE' then
    raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501';
  end if;

  select school.* into selected_school
  from public.schools school
  where school.id = selected_membership.school_id
  for update;
  if not found or not selected_school.is_active then
    raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501';
  end if;

  perform assignment.id
  from public.staff_role_assignments assignment
  where assignment.membership_id = selected_membership.id
  order by assignment.id
  for update;

  perform mapping.id
  from public.role_permissions mapping
  where mapping.role in (
    select assignment.role
    from public.staff_role_assignments assignment
    where assignment.membership_id = selected_membership.id
      and assignment.granted_at <= now()
      and assignment.revoked_at is null
  )
  order by mapping.id
  for update;

  select coalesce(array_agg(distinct assignment.role order by assignment.role), '{}'::public.staff_role[])
    into locked_roles
  from public.staff_role_assignments assignment
  where assignment.membership_id = selected_membership.id
    and assignment.granted_at <= now()
    and assignment.revoked_at is null;

  select coalesce(array_agg(distinct mapping.permission order by mapping.permission), '{}'::public.app_permission[])
    into locked_permissions
  from public.staff_role_assignments assignment
  join public.role_permissions mapping on mapping.role = assignment.role
  where assignment.membership_id = selected_membership.id
    and assignment.granted_at <= now()
    and assignment.revoked_at is null;

  if not ('REPORTS_GENERATE'::public.app_permission = any(locked_permissions)) then
    raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501';
  end if;

  return query select current_profile_id, selected_membership.id,
    selected_school.id, locked_roles, locked_permissions;
end;
$$;

alter table public.result_calculation_sources
  add column if not exists grade_level_subject_id uuid,
  add column if not exists curriculum_is_required boolean,
  add column if not exists curriculum_contributes_to_aggregate boolean,
  add column if not exists curriculum_sort_order integer;

update public.result_calculation_sources source
set grade_level_subject_id = mapping.id,
    curriculum_is_required = mapping.is_required,
    curriculum_contributes_to_aggregate = mapping.contributes_to_aggregate,
    curriculum_sort_order = mapping.sort_order
from public.mark_sheets sheet
join public.class_sections section on section.id = sheet.class_section_id
join public.grade_level_subjects mapping
  on mapping.grade_level_id = section.grade_level_id
 and mapping.subject_id = sheet.subject_id
where source.mark_sheet_id = sheet.id
  and source.grade_level_subject_id is null;

alter table public.result_calculation_sources
  add constraint result_calculation_source_curriculum_fk
    foreign key (grade_level_subject_id) references public.grade_level_subjects(id) on delete restrict,
  alter column grade_level_subject_id set not null,
  alter column curriculum_is_required set not null,
  alter column curriculum_contributes_to_aggregate set not null,
  alter column curriculum_sort_order set not null;

create table if not exists public.calculated_grade_subject_performance (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.result_calculation_runs(id) on delete restrict,
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
  constraint calculated_grade_subject_performance_unique unique (calculation_run_id, subject_id)
);

create index if not exists calculated_grade_subject_performance_run_idx
  on public.calculated_grade_subject_performance(calculation_run_id, subject_id);

drop trigger if exists calculated_grade_subject_performance_append_only
  on public.calculated_grade_subject_performance;
create trigger calculated_grade_subject_performance_append_only
before update or delete on public.calculated_grade_subject_performance
for each row execute function internal.prevent_mutation();

alter table public.calculated_grade_subject_performance enable row level security;
alter table public.calculated_grade_subject_performance force row level security;
revoke all on public.result_calculation_sources, public.calculated_grade_subject_performance
  from public, anon, authenticated;

create or replace function internal.results_input_checksum(
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
  join public.assessment_components component on component.assessment_scheme_id = source.assessment_scheme_id
  join public.enrollments enrollment on enrollment.class_section_id = source.class_section_id
    and enrollment.status in ('ACTIVE', 'REPEATING')
  left join public.marks mark on mark.mark_sheet_id = source.mark_sheet_id
    and mark.assessment_component_id = component.id and mark.enrollment_id = enrollment.id
), grading_context as (
  select concat_ws('|', scale.id, scale.version, coalesce((
    select string_agg(concat_ws('|', band.id, band.score_range::text, band.grade,
      band.aggregate_points, band.is_pass), ';' order by band.id)
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
  from public.aggregate_classification_scales scale where scale.id = target_classification_scale_id
)
select encode(extensions.digest(concat_ws(':', target_term_id, target_grade_level_id,
  coalesce((select string_agg(concat_ws('|', mark_sheet_id, class_section_id,
    subject_id, mark_sheet_version, assessment_scheme_id, workflow_status::text,
    grade_level_subject_id, curriculum_is_required,
    curriculum_contributes_to_aggregate, curriculum_sort_order), ';'
    order by class_section_id, subject_id, mark_sheet_version, mark_sheet_id)
    from selected_sources), ''), coalesce((select value from component_context), ''),
  coalesce((select value from grading_context), ''),
  coalesce((select value from ranking_context), ''),
  coalesce((select value from classification_context), '')), 'sha256'), 'hex');
$$;

revoke all on function internal.lock_and_require_results_authority(),
  internal.results_input_checksum(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

-- Keep the deterministic calculation algorithm from migrations 23/24, but
-- execute statements that reference transaction-local tables dynamically.
-- This is required because the schema linter parses PL/pgSQL statements before
-- the function's CREATE TEMP TABLE statements have executed.

create or replace function public.calculate_grade_results(
  target_term_id uuid, target_grade_level_id uuid, target_grading_scale_id uuid,
  target_ranking_rule_id uuid, target_aggregate_classification_scale_id uuid default null
)
returns table(calculation_run_id uuid, calculation_version integer, reused boolean, input_checksum text, output_checksum text)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; term_row public.terms%rowtype; year_row public.academic_years%rowtype; grade_row public.grade_levels%rowtype;
  previous public.result_calculation_runs%rowtype; scale_id uuid; rule_id uuid; classification_id uuid; new_version integer; run_id uuid;
  input_hash text; output_hash text; direction text; tie_method public.ranking_tie_method; selected_ranking_basis public.ranking_basis;
  include_incomplete boolean; minimum_subjects integer; has_scope_issue boolean; has_unlocked_source boolean;
  has_invalid_band boolean; has_curriculum_drift boolean; source_count integer; source_table text; explanation_table text; subject_table text; student_table text;
begin
  source_table := 'tmp_result_sources_' || replace(gen_random_uuid()::text, '-', '');
  explanation_table := 'tmp_result_explanations_' || replace(gen_random_uuid()::text, '-', '');
  subject_table := 'tmp_result_subjects_' || replace(gen_random_uuid()::text, '-', '');
  student_table := 'tmp_result_students_' || replace(gen_random_uuid()::text, '-', '');
  select * into actor from internal.lock_and_require_results_authority();
  perform pg_advisory_xact_lock(hashtextextended(target_term_id::text || ':' || target_grade_level_id::text, 11011));
  -- Stage 10's lock order is assignment -> term -> sheet. This calculation
  -- extends the same authority prefix before locking academic state.
  perform assignment.id from public.teaching_assignments assignment
    where assignment.term_id = target_term_id order by assignment.id for update;
  select term.* into term_row from public.terms term where term.id = target_term_id for update;
  if term_row.id is null then raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501'; end if;
  select year.* into year_row from public.academic_years year where year.id = term_row.academic_year_id for update;
  if year_row.id is null or year_row.school_id is distinct from actor.school_id then raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501'; end if;
  if term_row.status <> 'LOCKED' then raise exception 'RESULT_TERM_NOT_LOCKED' using errcode = '23514'; end if;
  select grade.* into grade_row from public.grade_levels grade where grade.id = target_grade_level_id and grade.school_id = actor.school_id and grade.is_active for update;
  if grade_row.id is null then raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514'; end if;
  perform mapping.id from public.grade_level_subjects mapping where mapping.grade_level_id = target_grade_level_id order by mapping.id for update;
  perform section.id from public.class_sections section where section.academic_year_id = year_row.id and section.grade_level_id = target_grade_level_id and section.is_active order by section.id for update;
  perform sheet.id from public.mark_sheets sheet join public.class_sections section on section.id = sheet.class_section_id where sheet.term_id = target_term_id and section.academic_year_id = year_row.id and section.grade_level_id = target_grade_level_id order by sheet.id for update;
  select * into previous from public.result_calculation_runs where term_id = target_term_id and grade_level_id = target_grade_level_id order by version desc limit 1 for update;
  if previous.id is not null then scale_id := previous.grading_scale_id; rule_id := previous.ranking_rule_id; classification_id := previous.aggregate_classification_scale_id;
  else
    if target_grading_scale_id is null or target_ranking_rule_id is null then raise exception 'RESULT_GRADING_SCALE_INVALID' using errcode = '22023'; end if;
    scale_id := target_grading_scale_id; rule_id := target_ranking_rule_id; classification_id := target_aggregate_classification_scale_id;
  end if;
  perform scale.id from public.grading_scales scale where scale.id = scale_id order by scale.id for update;
  perform band.id from public.grading_bands band where band.grading_scale_id = scale_id order by band.id for update;
  perform rule.id from public.ranking_rules rule where rule.id = rule_id order by rule.id for update;
  if classification_id is not null then
    perform classification.id from public.aggregate_classification_scales classification where classification.id = classification_id order by classification.id for update;
    perform band.id from public.aggregate_classification_bands band where band.scale_id = classification_id order by band.id for update;
  end if;
  perform internal.validate_results_grading_scale(scale_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  perform internal.validate_results_ranking_rule(rule_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  perform internal.validate_results_classification_scale(classification_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  select rules.ranking_basis, rules.tie_method, rules.configuration ->> 'direction', coalesce((rules.configuration ->> 'include_incomplete')::boolean, false), coalesce(nullif(rules.configuration ->> 'minimum_subjects','')::integer, 0)
    into selected_ranking_basis, tie_method, direction, include_incomplete, minimum_subjects from public.ranking_rules rules where rules.id = rule_id;

  execute format($sql$create temporary table %I(mark_sheet_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_version integer, assessment_scheme_id uuid, workflow_status public.mark_sheet_status, grade_level_subject_id uuid, curriculum_is_required boolean, curriculum_contributes_to_aggregate boolean, curriculum_sort_order integer) on commit drop$sql$, source_table);
  if not exists (select 1 from public.class_sections where academic_year_id = year_row.id and grade_level_id = target_grade_level_id and is_active) or not exists (select 1 from public.grade_level_subjects where grade_level_id = target_grade_level_id) then raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514'; end if;
  execute format($sql$
    insert into %I
    select latest.id, latest.class_section_id, latest.subject_id, latest.version, latest.assessment_scheme_id, latest.workflow_status,
      latest.mapping_id, latest.curriculum_is_required, latest.curriculum_contributes_to_aggregate, latest.curriculum_sort_order
    from (
      select sheet.id, sheet.class_section_id, sheet.subject_id, sheet.version,
        sheet.assessment_scheme_id, sheet.workflow_status, mapping.id as mapping_id,
        mapping.is_required as curriculum_is_required,
        mapping.contributes_to_aggregate as curriculum_contributes_to_aggregate,
        mapping.sort_order as curriculum_sort_order,
        row_number() over(partition by sheet.term_id, sheet.class_section_id, sheet.subject_id order by sheet.version desc, sheet.id desc) as source_rank
      from public.mark_sheets sheet
      join public.class_sections section on section.id = sheet.class_section_id
      join public.grade_level_subjects mapping on mapping.grade_level_id = $2 and mapping.subject_id = sheet.subject_id
      where sheet.term_id = $1 and section.grade_level_id = $2 and section.academic_year_id = $3 and section.is_active
    ) latest where latest.source_rank = 1
  $sql$, source_table) using target_term_id, target_grade_level_id, year_row.id;
  execute format($sql$
    select exists (select 1 from public.class_sections section cross join public.grade_level_subjects mapping
      where section.academic_year_id = $1 and section.grade_level_id = $2 and section.is_active
        and mapping.grade_level_id = $2 and not exists (select 1 from %I source where source.class_section_id = section.id and source.subject_id = mapping.subject_id))
  $sql$, source_table) into has_scope_issue using year_row.id, target_grade_level_id;
  if has_scope_issue then raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514'; end if;
  execute format('select exists (select 1 from %I where workflow_status <> ''LOCKED''::public.mark_sheet_status)', source_table) into has_unlocked_source;
  if has_unlocked_source then raise exception 'RESULT_SOURCE_NOT_LOCKED' using errcode = '23514'; end if;

  execute format($sql$create temporary table %I(enrollment_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_id uuid, mark_id uuid, mark_row_version integer, assessment_component_id uuid, component_name text, attendance_status public.assessment_attendance_status, entered_score numeric, maximum_score numeric, weight_percentage numeric, is_required boolean, included_weight numeric, weighted_contribution numeric) on commit drop$sql$, explanation_table);
  execute format($sql$
    insert into %I
    select enrollment.id, source.class_section_id, source.subject_id, source.mark_sheet_id, mark.id, mark.row_version, component.id, component.name, mark.attendance_status, mark.score, component.maximum_score, component.weight_percentage, component.is_required,
      case when mark.attendance_status in ('PRESENT','ABSENT') then component.weight_percentage else 0 end,
      case when mark.attendance_status = 'PRESENT' then (mark.score / component.maximum_score) * component.weight_percentage else 0 end
    from %I source join public.assessment_components component on component.assessment_scheme_id = source.assessment_scheme_id join public.enrollments enrollment on enrollment.class_section_id = source.class_section_id and enrollment.academic_year_id = $1 and enrollment.status in ('ACTIVE','REPEATING') left join public.marks mark on mark.mark_sheet_id = source.mark_sheet_id and mark.assessment_component_id = component.id and mark.enrollment_id = enrollment.id
  $sql$, explanation_table, source_table) using year_row.id;

  execute format($sql$create temporary table %I(enrollment_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_id uuid, subject_status public.calculated_subject_status, subject_score numeric, grade text, aggregate_points integer, is_pass boolean, assessed_weight numeric, has_absence boolean, has_exemption boolean, subject_position integer, subject_tie_size integer default 0, subject_is_tied boolean default false, contributes_to_aggregate boolean, is_required boolean) on commit drop$sql$, subject_table);
  execute format($sql$
    insert into %I
    select explanation.enrollment_id, explanation.class_section_id, explanation.subject_id, explanation.mark_sheet_id,
      case when bool_or(explanation.is_required and (explanation.attendance_status is null or explanation.attendance_status = 'NOT_ASSESSED')) then 'INCOMPLETE'::public.calculated_subject_status when coalesce(sum(explanation.included_weight),0) = 0 then 'EXEMPTED'::public.calculated_subject_status else 'COMPLETE'::public.calculated_subject_status end,
      case when coalesce(sum(explanation.included_weight),0) > 0 and not bool_or(explanation.is_required and (explanation.attendance_status is null or explanation.attendance_status = 'NOT_ASSESSED')) then round(sum(explanation.weighted_contribution) * 100 / sum(explanation.included_weight), 2) end,
      null, null, null, coalesce(sum(explanation.included_weight),0), coalesce(bool_or(explanation.attendance_status = 'ABSENT'),false), coalesce(bool_or(explanation.attendance_status = 'EXEMPTED'),false), null, 0, false, mapping.contributes_to_aggregate, mapping.is_required
    from %I explanation join public.grade_level_subjects mapping on mapping.grade_level_id = $1 and mapping.subject_id = explanation.subject_id
    group by explanation.enrollment_id, explanation.class_section_id, explanation.subject_id, explanation.mark_sheet_id, mapping.contributes_to_aggregate, mapping.is_required
  $sql$, subject_table, explanation_table) using target_grade_level_id;
  execute format($sql$
    select exists (select 1 from %I subject where subject.subject_status = 'COMPLETE' and (select count(*) from public.grading_bands band where band.grading_scale_id = $1 and subject.subject_score <@ band.score_range) <> 1)
  $sql$, subject_table) into has_invalid_band using scale_id;
  if has_invalid_band then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;
  execute format($sql$
    update %I subject set grade = band.grade, aggregate_points = band.aggregate_points, is_pass = band.is_pass from public.grading_bands band where band.grading_scale_id = $1 and subject.subject_status = 'COMPLETE' and subject.subject_score <@ band.score_range
  $sql$, subject_table) using scale_id;
  execute format($sql$
    select exists (select 1 from %I subject where subject.subject_status = 'COMPLETE' and subject.contributes_to_aggregate and subject.aggregate_points is null)
  $sql$, subject_table) into has_invalid_band;
  if has_invalid_band then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;

  execute format($sql$create temporary table %I(enrollment_id uuid, class_section_id uuid, subject_count integer, complete_subject_count integer, subjects_passed integer, overall_total numeric, overall_average numeric, overall_grade text, aggregate_total integer, aggregate_classification text, is_complete boolean, ranking_eligible boolean, ranking_metric numeric, class_position integer, grade_level_position integer, class_tie_size integer default 0, grade_level_tie_size integer default 0, class_is_tied boolean default false, grade_level_is_tied boolean default false) on commit drop$sql$, student_table);
  execute format($sql$
    insert into %I
    select enrollment_id, class_section_id, count(*)::integer, count(*) filter(where subject_status='COMPLETE')::integer, count(*) filter(where subject_status='COMPLETE' and is_pass)::integer, sum(subject_score) filter(where subject_status='COMPLETE'), round(sum(subject_score) filter(where subject_status='COMPLETE') / nullif(count(*) filter(where subject_status='COMPLETE'),0), 2), null,
      case when count(*) filter(where contributes_to_aggregate) > 0 and bool_and(subject_status='COMPLETE' and aggregate_points is not null) filter(where contributes_to_aggregate) then sum(aggregate_points) filter(where contributes_to_aggregate)::integer end, null, coalesce(bool_and(subject_status in ('COMPLETE','EXEMPTED')) filter(where is_required), true), false, null, null, null, 0, 0, false, false
    from %I group by enrollment_id, class_section_id
  $sql$, student_table, subject_table);
  if classification_id is not null then
    execute format($sql$
      update %I student set aggregate_classification = band.label from public.aggregate_classification_bands band where band.scale_id = $1 and student.aggregate_total is not null and student.aggregate_total between band.minimum_aggregate and band.maximum_aggregate
    $sql$, student_table) using classification_id;
    execute format($sql$ select exists (select 1 from %I where aggregate_total is not null and aggregate_classification is null) $sql$, student_table) into has_invalid_band;
    if has_invalid_band then raise exception 'RESULT_CLASSIFICATION_UNMATCHED' using errcode = '23514'; end if;
  end if;
  execute format($sql$
    update %I student set overall_grade = band.grade from public.grading_bands band where band.grading_scale_id = $1 and student.overall_average is not null and student.overall_average <@ band.score_range
  $sql$, student_table) using scale_id;
  execute format($sql$
    select exists (select 1 from %I student where student.overall_average is not null and (select count(*) from public.grading_bands band where band.grading_scale_id = $1 and student.overall_average <@ band.score_range) <> 1)
  $sql$, student_table) into has_invalid_band using scale_id;
  if has_invalid_band then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;
  execute format($sql$
    update %I set ranking_metric = case $1::text when 'TOTAL' then overall_total when 'AVERAGE' then overall_average when 'AGGREGATE' then aggregate_total else case (select rules.configuration ->> 'configured_metric' from public.ranking_rules rules where rules.id = $2) when 'TOTAL' then overall_total when 'AVERAGE' then overall_average when 'AGGREGATE' then aggregate_total end end
  $sql$, student_table) using selected_ranking_basis, rule_id;
  execute format($sql$ update %I set ranking_eligible = ranking_metric is not null and complete_subject_count >= $1 and ($2 or is_complete) $sql$, student_table) using minimum_subjects, include_incomplete;
  execute format($sql$
    with ranked as (select student.*, count(*) over(partition by class_section_id, ranking_metric)::integer class_ties, count(*) over(partition by ranking_metric)::integer grade_ties, dense_rank() over(partition by class_section_id order by (case when $1::text='DESC' then ranking_metric end) desc nulls last, (case when $1::text='ASC' then ranking_metric end) asc nulls last) class_dense, rank() over(partition by class_section_id order by (case when $1::text='DESC' then ranking_metric end) desc nulls last, (case when $1::text='ASC' then ranking_metric end) asc nulls last) class_competition, row_number() over(partition by class_section_id order by (case when $1::text='DESC' then ranking_metric end) desc nulls last, (case when $1::text='ASC' then ranking_metric end) asc nulls last, enrollment_id) class_ordinal, dense_rank() over(order by (case when $1::text='DESC' then ranking_metric end) desc nulls last, (case when $1::text='ASC' then ranking_metric end) asc nulls last) grade_dense, rank() over(order by (case when $1::text='DESC' then ranking_metric end) desc nulls last, (case when $1::text='ASC' then ranking_metric end) asc nulls last) grade_competition, row_number() over(order by (case when $1::text='DESC' then ranking_metric end) desc nulls last, (case when $1::text='ASC' then ranking_metric end) asc nulls last, enrollment_id) grade_ordinal from %I student where ranking_eligible)
    update %I target set class_position = case $2::text when 'DENSE' then ranked.class_dense when 'COMPETITION' then ranked.class_competition when 'ORDINAL' then ranked.class_ordinal else ranked.class_competition end, grade_level_position = case $2::text when 'DENSE' then ranked.grade_dense when 'COMPETITION' then ranked.grade_competition when 'ORDINAL' then ranked.grade_ordinal else ranked.grade_competition end, class_tie_size = ranked.class_ties, grade_level_tie_size = ranked.grade_ties, class_is_tied = ranked.class_ties > 1, grade_level_is_tied = ranked.grade_ties > 1 from ranked where target.enrollment_id = ranked.enrollment_id
  $sql$, student_table, student_table) using direction, tie_method;
  execute format($sql$
    with ranked as (
      select subject.enrollment_id, subject.class_section_id, subject.subject_id,
        count(*) over(partition by subject.class_section_id, subject.subject_id, subject.subject_score)::integer ties,
        dense_rank() over(partition by subject.class_section_id, subject.subject_id order by subject.subject_score desc) dense_position,
        rank() over(partition by subject.class_section_id, subject.subject_id order by subject.subject_score desc) competition_position,
        row_number() over(partition by subject.class_section_id, subject.subject_id order by subject.subject_score desc, subject.enrollment_id) ordinal_position
      from %I subject
      where subject.subject_status='COMPLETE' and subject.subject_score is not null
    )
    update %I target
    set subject_position = case $1::text when 'DENSE' then ranked.dense_position when 'ORDINAL' then ranked.ordinal_position when 'COMPETITION' then ranked.competition_position else ranked.competition_position end,
      subject_tie_size = ranked.ties,
      subject_is_tied = ranked.ties > 1
    from ranked
    where target.enrollment_id = ranked.enrollment_id
      and target.class_section_id = ranked.class_section_id
      and target.subject_id = ranked.subject_id
  $sql$, subject_table, subject_table) using tie_method;
  select internal.results_input_checksum(target_term_id, target_grade_level_id, scale_id, rule_id, classification_id)
    into input_hash;
  if previous.id is not null then
    execute format($sql$
      select exists (
        select grade_level_subject_id, curriculum_is_required,
          curriculum_contributes_to_aggregate, curriculum_sort_order
        from public.result_calculation_sources
        where calculation_run_id = $1
        except
        select grade_level_subject_id, curriculum_is_required,
          curriculum_contributes_to_aggregate, curriculum_sort_order
        from %I
      ) or exists (
        select grade_level_subject_id, curriculum_is_required,
          curriculum_contributes_to_aggregate, curriculum_sort_order
        from %I
        except
        select grade_level_subject_id, curriculum_is_required,
          curriculum_contributes_to_aggregate, curriculum_sort_order
        from public.result_calculation_sources
        where calculation_run_id = $1
      )
    $sql$, source_table, source_table) into has_curriculum_drift using previous.id;
    if has_curriculum_drift then
      raise exception 'RESULT_RULE_CONTEXT_CHANGED' using errcode = '23514';
    end if;
    if previous.input_checksum = input_hash then
      return query select previous.id, previous.version, true, previous.input_checksum, previous.output_checksum;
      return;
    end if;
  end if;
  execute format($sql$
    select encode(extensions.digest(
      coalesce((select string_agg(concat_ws('|', enrollment_id, class_section_id,
        subject_count, complete_subject_count, subjects_passed,
        coalesce(overall_total::text,''), coalesce(overall_average::text,''),
        coalesce(overall_grade,''), coalesce(aggregate_total::text,''),
        coalesce(aggregate_classification,''), is_complete, ranking_eligible,
        coalesce(ranking_metric::text,''), coalesce(class_position::text,''),
        coalesce(grade_level_position::text,''), class_tie_size,
        grade_level_tie_size, class_is_tied, grade_level_is_tied),
        ';' order by class_section_id, enrollment_id) from %I),'') || ':' ||
      coalesce((select string_agg(concat_ws('|', enrollment_id, class_section_id,
        subject_id, mark_sheet_id, subject_status::text,
        coalesce(subject_score::text,''), coalesce(grade,''),
        coalesce(aggregate_points::text,''), coalesce(is_pass::text,''),
        assessed_weight, has_absence, has_exemption,
        coalesce(subject_position::text,''), subject_tie_size, subject_is_tied),
        ';' order by class_section_id, subject_id, enrollment_id) from %I),''),
      'sha256'), 'hex')
  $sql$, student_table, subject_table) into output_hash;
  new_version := coalesce(previous.version, 0) + 1;
  insert into public.result_calculation_runs(term_id, grade_level_id, version, supersedes_run_id, grading_scale_id, ranking_rule_id, aggregate_classification_scale_id, input_checksum, output_checksum, created_by) values(target_term_id, target_grade_level_id, new_version, previous.id, scale_id, rule_id, classification_id, input_hash, output_hash, actor.membership_id) returning id into run_id;
  execute format($sql$insert into public.result_calculation_sources(calculation_run_id, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id, grade_level_subject_id, curriculum_is_required, curriculum_contributes_to_aggregate, curriculum_sort_order) select $1, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id, grade_level_subject_id, curriculum_is_required, curriculum_contributes_to_aggregate, curriculum_sort_order from %I$sql$, source_table) using run_id;
  execute format($sql$insert into public.calculated_student_results(calculation_run_id, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied) select $1, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied from %I$sql$, student_table) using run_id;
  execute format($sql$insert into public.calculated_subject_results(calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied) select $1, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied from %I$sql$, subject_table) using run_id;
  execute format($sql$insert into public.calculated_component_explanations(calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, assessment_component_id, component_name, attendance_status, entered_score, maximum_score, weight_percentage, included_weight, weighted_contribution) select $1, enrollment_id, class_section_id, subject_id, mark_sheet_id, assessment_component_id, component_name, attendance_status, entered_score, maximum_score, weight_percentage, included_weight, weighted_contribution from %I$sql$, explanation_table) using run_id;
  execute format($sql$insert into public.calculated_subject_performance(calculation_run_id, class_section_id, subject_id, mean_score, minimum_score, maximum_score, pass_rate, complete_count, incomplete_count, exempted_count, grade_distribution) select $1, class_section_id, subject_id, round(avg(subject_score) filter(where subject_status='COMPLETE'),2), min(subject_score) filter(where subject_status='COMPLETE'), max(subject_score) filter(where subject_status='COMPLETE'), round(100 * avg(case when is_pass then 1.0 else 0.0 end) filter(where subject_status='COMPLETE'),2), count(*) filter(where subject_status='COMPLETE'), count(*) filter(where subject_status='INCOMPLETE'), count(*) filter(where subject_status='EXEMPTED'), coalesce(jsonb_object_agg(grade, grade_count) filter(where grade is not null), '{}'::jsonb) from (select class_section_id, subject_id, subject_status, subject_score, is_pass, grade, count(*) over(partition by class_section_id, subject_id, grade) as grade_count from %I) distribution group by class_section_id, subject_id$sql$, subject_table) using run_id;
  execute format($sql$insert into public.calculated_grade_subject_performance(calculation_run_id, subject_id, mean_score, minimum_score, maximum_score, pass_rate, complete_count, incomplete_count, exempted_count, grade_distribution) select $1, subject_id, round(avg(subject_score) filter(where subject_status='COMPLETE'),2), min(subject_score) filter(where subject_status='COMPLETE'), max(subject_score) filter(where subject_status='COMPLETE'), round(100 * avg(case when is_pass then 1.0 else 0.0 end) filter(where subject_status='COMPLETE'),2), count(*) filter(where subject_status='COMPLETE'), count(*) filter(where subject_status='INCOMPLETE'), count(*) filter(where subject_status='EXEMPTED'), coalesce(jsonb_object_agg(grade, grade_count) filter(where grade is not null), '{}'::jsonb) from (select subject_id, subject_status, subject_score, is_pass, grade, count(*) over(partition by subject_id, grade) as grade_count from %I) distribution group by subject_id$sql$, subject_table) using run_id;
  execute format('select count(*) from %I', source_table) into source_count;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id, 'RESULT_CALCULATION_CREATED', 'result_calculation_run', run_id, null, jsonb_build_object('version', new_version, 'term_id', target_term_id, 'grade_level_id', target_grade_level_id, 'input_checksum', input_hash, 'output_checksum', output_hash, 'source_count', source_count));
  return query select run_id, new_version, false, input_hash, output_hash;
end;
$$;

create or replace function public.get_results_calculation_readiness(
  target_term_id uuid,
  target_grade_level_id uuid
)
returns table(
  term_id uuid,
  term_status public.term_status,
  term_name text,
  academic_year_name text,
  grade_level_id uuid,
  grade_name text,
  class_count bigint,
  student_population bigint,
  expected_class_subject_scopes bigint,
  source_sheet_count bigint,
  missing_source_scopes bigint,
  non_locked_latest_scopes bigint,
  latest_run_id uuid,
  latest_version integer,
  calculation_present boolean,
  applicable_grading_scale_count bigint,
  applicable_ranking_rule_count bigint,
  applicable_classification_scale_count bigint,
  current_authoritative_input_checksum text,
  latest_run_input_checksum text,
  up_to_date boolean
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_term public.terms%rowtype;
  selected_year public.academic_years%rowtype;
  selected_grade public.grade_levels%rowtype;
  scale_count bigint;
  ranking_count bigint;
  classification_count bigint;
  selected_scale_id uuid;
  selected_rule_id uuid;
  selected_classification_id uuid;
  current_checksum text;
  latest_run public.result_calculation_runs%rowtype;
  expected_scopes bigint;
  sources bigint;
  missing bigint;
  unlocked bigint;
begin
  select * into actor from internal.require_results_reader();
  select term.* into selected_term
  from public.terms term join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id and year.school_id = actor.school_id;
  if not found then raise exception 'RESULT_CALCULATION_FORBIDDEN' using errcode = '42501'; end if;
  select year.* into selected_year from public.academic_years year where year.id = selected_term.academic_year_id;
  select grade.* into selected_grade from public.grade_levels grade
  where grade.id = target_grade_level_id and grade.school_id = actor.school_id and grade.is_active;
  if not found then raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514'; end if;

  select count(*) into class_count from public.class_sections section
  where section.academic_year_id = selected_year.id and section.grade_level_id = selected_grade.id and section.is_active;
  select count(*) into student_population from public.enrollments enrollment
  join public.class_sections section on section.id = enrollment.class_section_id
  where enrollment.academic_year_id = selected_year.id and enrollment.status in ('ACTIVE', 'REPEATING')
    and section.academic_year_id = selected_year.id and section.grade_level_id = selected_grade.id and section.is_active;
  select class_count * count(*) into expected_scopes from public.grade_level_subjects mapping
  where mapping.grade_level_id = selected_grade.id;

  with latest as (
    select sheet.class_section_id, sheet.subject_id, sheet.workflow_status,
      row_number() over(partition by sheet.class_section_id, sheet.subject_id order by sheet.version desc, sheet.id desc) source_rank
    from public.mark_sheets sheet join public.class_sections section on section.id = sheet.class_section_id
    where sheet.term_id = target_term_id and section.academic_year_id = selected_year.id
      and section.grade_level_id = selected_grade.id and section.is_active
  )
  select count(*) filter(where source_rank = 1), count(*) filter(where source_rank = 1 and workflow_status <> 'LOCKED'),
    expected_scopes - count(*) filter(where source_rank = 1)
  into sources, unlocked, missing from latest;

  select count(*) into scale_count from public.grading_scales scale
  where scale.school_id = actor.school_id and (scale.academic_year_id is null or scale.academic_year_id = selected_year.id)
    and (scale.grade_level_id is null or scale.grade_level_id = selected_grade.id) and scale.is_active and scale.retired_at is null;
  select count(*) into ranking_count from public.ranking_rules rule
  where rule.school_id = actor.school_id and (rule.academic_year_id is null or rule.academic_year_id = selected_year.id)
    and (rule.grade_level_id is null or rule.grade_level_id = selected_grade.id) and rule.is_active and rule.retired_at is null;
  select count(*) into classification_count from public.aggregate_classification_scales scale
  where scale.school_id = actor.school_id and (scale.academic_year_id is null or scale.academic_year_id = selected_year.id)
    and (scale.grade_level_id is null or scale.grade_level_id = selected_grade.id) and scale.is_active and scale.retired_at is null;
  select * into latest_run from public.result_calculation_runs run
  where run.term_id = target_term_id and run.grade_level_id = target_grade_level_id
  order by run.version desc limit 1;
  if scale_count = 1 and ranking_count = 1 then
    select scale.id into selected_scale_id from public.grading_scales scale
    where scale.school_id = actor.school_id and (scale.academic_year_id is null or scale.academic_year_id = selected_year.id)
      and (scale.grade_level_id is null or scale.grade_level_id = selected_grade.id) and scale.is_active and scale.retired_at is null
    order by scale.version desc, scale.id desc limit 1;
    select rule.id into selected_rule_id from public.ranking_rules rule
    where rule.school_id = actor.school_id and (rule.academic_year_id is null or rule.academic_year_id = selected_year.id)
      and (rule.grade_level_id is null or rule.grade_level_id = selected_grade.id) and rule.is_active and rule.retired_at is null
    order by rule.version desc, rule.id desc limit 1;
    selected_classification_id := latest_run.aggregate_classification_scale_id;
    current_checksum := internal.results_input_checksum(target_term_id, target_grade_level_id, selected_scale_id, selected_rule_id, selected_classification_id);
  end if;

  term_id := selected_term.id; term_status := selected_term.status; term_name := selected_term.name;
  academic_year_name := selected_year.name; grade_level_id := selected_grade.id; grade_name := selected_grade.name;
  expected_class_subject_scopes := expected_scopes; source_sheet_count := sources;
  missing_source_scopes := greatest(missing, 0); non_locked_latest_scopes := unlocked;
  latest_run_id := latest_run.id; latest_version := latest_run.version; calculation_present := latest_run.id is not null;
  applicable_grading_scale_count := scale_count; applicable_ranking_rule_count := ranking_count;
  applicable_classification_scale_count := classification_count; current_authoritative_input_checksum := current_checksum;
  latest_run_input_checksum := latest_run.input_checksum;
  up_to_date := current_checksum is not null and latest_run.input_checksum = current_checksum and missing = 0 and unlocked = 0;
  return next;
end;
$$;

create or replace function public.list_result_grade_subject_performance(target_run_id uuid)
returns table(subject_id uuid, subject_name text, mean_score numeric, minimum_score numeric, maximum_score numeric, pass_rate numeric, complete_count integer, incomplete_count integer, exempted_count integer, grade_distribution jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_results_reader();
  perform internal.assert_result_run_readable(target_run_id, actor.school_id);
  return query select performance.subject_id, subject.name, performance.mean_score, performance.minimum_score,
    performance.maximum_score, performance.pass_rate, performance.complete_count, performance.incomplete_count,
    performance.exempted_count, performance.grade_distribution
  from public.calculated_grade_subject_performance performance join public.subjects subject on subject.id = performance.subject_id
  where performance.calculation_run_id = target_run_id order by subject.sort_order, subject.id;
end;
$$;

grant execute on function public.get_results_calculation_readiness(uuid, uuid), public.list_result_grade_subject_performance(uuid) to authenticated;

revoke execute on function public.get_results_calculation_readiness(uuid, uuid), public.list_result_grade_subject_performance(uuid)
  from public, anon;
revoke all on function internal.lock_and_require_results_authority(),
  internal.results_input_checksum(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
