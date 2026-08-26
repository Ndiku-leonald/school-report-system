-- Corrective migration for Stage 11. Migration 23 remains unchanged so its
-- history is reproducible; these replacements resolve PostgreSQL lint findings
-- and make the supplied classification version bands authoritative.

create or replace function public.activate_aggregate_classification_scale(target_scale_id uuid, expected_updated_at timestamptz)
returns table(entity_id uuid, entity_status text, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, internal
as $$
declare actor record; changed public.aggregate_classification_scales%rowtype;
begin
  select * into actor from internal.require_configuration_actor();
  update public.aggregate_classification_scales scale
  set is_active = true
  where scale.id = target_scale_id and scale.school_id = actor.school_id and not scale.is_active and scale.retired_at is null and scale.updated_at = expected_updated_at
  returning scale.* into changed;
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
  update public.aggregate_classification_scales scale
  set is_active = false, retired_at = now()
  where scale.id = target_scale_id and scale.school_id = actor.school_id and scale.is_active and scale.retired_at is null and scale.updated_at = expected_updated_at
  returning scale.* into changed;
  if not found then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '55000'; end if;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id, 'ACADEMIC_CONFIGURATION_DEACTIVATED', 'aggregate_classification_scale', changed.id, null, jsonb_build_object('version', changed.version));
  return query select changed.id, 'RETIRED', changed.updated_at;
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
  if jsonb_typeof(scale_bands) <> 'array' or jsonb_array_length(scale_bands) = 0 then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '22023'; end if;
  select * into source from public.aggregate_classification_scales where id = source_scale_id and school_id = actor.school_id for update;
  if not found or (not source.is_active and source.retired_at is null) then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '55000'; end if;
  if source.updated_at is distinct from expected_updated_at then perform internal.raise_configuration_conflict(); end if;
  select coalesce(max(version), 0) + 1 into next_version from public.aggregate_classification_scales
  where school_id = actor.school_id and academic_year_id is not distinct from source.academic_year_id and grade_level_id is not distinct from source.grade_level_id;
  insert into public.aggregate_classification_scales(school_id, academic_year_id, grade_level_id, name, version, created_by)
  values(actor.school_id, source.academic_year_id, source.grade_level_id, btrim(scale_name), next_version, actor.membership_id) returning * into created;
  insert into public.aggregate_classification_bands(scale_id, minimum_aggregate, maximum_aggregate, label, description, sort_order)
  select created.id, row_item.minimum_aggregate, row_item.maximum_aggregate, btrim(row_item.label), nullif(btrim(row_item.description), ''), row_item.sort_order
  from jsonb_to_recordset(scale_bands) as row_item(minimum_aggregate integer, maximum_aggregate integer, label text, description text, sort_order integer);
  if exists (select 1 from jsonb_to_recordset(scale_bands) as row_item(minimum_aggregate integer, maximum_aggregate integer, label text, description text, sort_order integer) where row_item.minimum_aggregate < 0 or row_item.maximum_aggregate < row_item.minimum_aggregate or row_item.sort_order <= 0 or length(btrim(coalesce(row_item.label, ''))) = 0) then raise exception 'RESULT_AGGREGATE_CONFIGURATION_INVALID' using errcode = '22023'; end if;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id, 'ACADEMIC_CONFIGURATION_VERSION_CREATED', 'aggregate_classification_scale', created.id, null, jsonb_build_object('source_record_id', source.id, 'version', created.version));
  return query select created.id, 'DRAFT', created.updated_at;
end;
$$;

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
  include_incomplete boolean; minimum_subjects integer;
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
  if previous.id is not null then scale_id := previous.grading_scale_id; rule_id := previous.ranking_rule_id; classification_id := previous.aggregate_classification_scale_id;
  else
    if target_grading_scale_id is null or target_ranking_rule_id is null then raise exception 'RESULT_GRADING_SCALE_INVALID' using errcode = '22023'; end if;
    scale_id := target_grading_scale_id; rule_id := target_ranking_rule_id; classification_id := target_aggregate_classification_scale_id;
  end if;
  perform internal.validate_results_grading_scale(scale_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  perform internal.validate_results_ranking_rule(rule_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  perform internal.validate_results_classification_scale(classification_id, actor.school_id, year_row.id, grade_row.id, previous.id is null);
  select rules.ranking_basis, rules.tie_method, rules.configuration ->> 'direction', coalesce((rules.configuration ->> 'include_incomplete')::boolean, false), coalesce(nullif(rules.configuration ->> 'minimum_subjects','')::integer, 0)
    into selected_ranking_basis, tie_method, direction, include_incomplete, minimum_subjects from public.ranking_rules rules where rules.id = rule_id;

  create temporary table tmp_result_sources(mark_sheet_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_version integer, assessment_scheme_id uuid, workflow_status public.mark_sheet_status) on commit drop;
  if not exists (select 1 from public.class_sections where academic_year_id = year_row.id and grade_level_id = target_grade_level_id and is_active) or not exists (select 1 from public.grade_level_subjects where grade_level_id = target_grade_level_id) then raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514'; end if;
  insert into tmp_result_sources
  select latest.id, latest.class_section_id, latest.subject_id, latest.version, latest.assessment_scheme_id, latest.workflow_status
  from (select sheet.*, row_number() over(partition by sheet.term_id, sheet.class_section_id, sheet.subject_id order by sheet.version desc, sheet.id desc) as source_rank
    from public.mark_sheets sheet join public.class_sections section on section.id = sheet.class_section_id
    where sheet.term_id = target_term_id and section.grade_level_id = target_grade_level_id and section.academic_year_id = year_row.id and section.is_active
      and exists (select 1 from public.grade_level_subjects mapping where mapping.grade_level_id = target_grade_level_id and mapping.subject_id = sheet.subject_id)) latest where latest.source_rank = 1;
  if exists (select 1 from public.class_sections section cross join public.grade_level_subjects mapping where section.academic_year_id = year_row.id and section.grade_level_id = target_grade_level_id and section.is_active and mapping.grade_level_id = target_grade_level_id and not exists (select 1 from tmp_result_sources source where source.class_section_id = section.id and source.subject_id = mapping.subject_id)) then raise exception 'RESULT_SCOPE_INCOMPLETE' using errcode = '23514'; end if;
  if exists (select 1 from tmp_result_sources where workflow_status <> 'LOCKED') then raise exception 'RESULT_SOURCE_NOT_LOCKED' using errcode = '23514'; end if;

  create temporary table tmp_result_explanations(enrollment_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_id uuid, assessment_component_id uuid, component_name text, attendance_status public.assessment_attendance_status, entered_score numeric, maximum_score numeric, weight_percentage numeric, is_required boolean, included_weight numeric, weighted_contribution numeric) on commit drop;
  insert into tmp_result_explanations
  select enrollment.id, source.class_section_id, source.subject_id, source.mark_sheet_id, component.id, component.name, mark.attendance_status, mark.score, component.maximum_score, component.weight_percentage, component.is_required,
    case when mark.attendance_status in ('PRESENT','ABSENT') then component.weight_percentage else 0 end,
    case when mark.attendance_status = 'PRESENT' then (mark.score / component.maximum_score) * component.weight_percentage else 0 end
  from tmp_result_sources source join public.assessment_components component on component.assessment_scheme_id = source.assessment_scheme_id join public.enrollments enrollment on enrollment.class_section_id = source.class_section_id and enrollment.academic_year_id = year_row.id and enrollment.status in ('ACTIVE','REPEATING') left join public.marks mark on mark.mark_sheet_id = source.mark_sheet_id and mark.assessment_component_id = component.id and mark.enrollment_id = enrollment.id;

  create temporary table tmp_result_subjects(enrollment_id uuid, class_section_id uuid, subject_id uuid, mark_sheet_id uuid, subject_status public.calculated_subject_status, subject_score numeric, grade text, aggregate_points integer, is_pass boolean, assessed_weight numeric, has_absence boolean, has_exemption boolean, subject_position integer, subject_tie_size integer default 0, subject_is_tied boolean default false, contributes_to_aggregate boolean, is_required boolean) on commit drop;
  insert into tmp_result_subjects
  select explanation.enrollment_id, explanation.class_section_id, explanation.subject_id, explanation.mark_sheet_id,
    case when bool_or(explanation.is_required and (explanation.attendance_status is null or explanation.attendance_status = 'NOT_ASSESSED')) then 'INCOMPLETE'::public.calculated_subject_status when coalesce(sum(explanation.included_weight),0) = 0 then 'EXEMPTED'::public.calculated_subject_status else 'COMPLETE'::public.calculated_subject_status end,
    case when coalesce(sum(explanation.included_weight),0) > 0 and not bool_or(explanation.is_required and (explanation.attendance_status is null or explanation.attendance_status = 'NOT_ASSESSED')) then round(sum(explanation.weighted_contribution) * 100 / sum(explanation.included_weight), 2) end,
    null, null, null, coalesce(sum(explanation.included_weight),0), coalesce(bool_or(explanation.attendance_status = 'ABSENT'),false), coalesce(bool_or(explanation.attendance_status = 'EXEMPTED'),false), null, 0, false, mapping.contributes_to_aggregate, mapping.is_required
  from tmp_result_explanations explanation join public.grade_level_subjects mapping on mapping.grade_level_id = target_grade_level_id and mapping.subject_id = explanation.subject_id
  group by explanation.enrollment_id, explanation.class_section_id, explanation.subject_id, explanation.mark_sheet_id, mapping.contributes_to_aggregate, mapping.is_required;
  if exists (select 1 from tmp_result_subjects subject where subject.subject_status = 'COMPLETE' and (select count(*) from public.grading_bands band where band.grading_scale_id = scale_id and subject.subject_score <@ band.score_range) <> 1) then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;
  update tmp_result_subjects subject set grade = band.grade, aggregate_points = band.aggregate_points, is_pass = band.is_pass from public.grading_bands band where band.grading_scale_id = scale_id and subject.subject_status = 'COMPLETE' and subject.subject_score <@ band.score_range;
  if exists (select 1 from tmp_result_subjects subject where subject.subject_status = 'COMPLETE' and subject.contributes_to_aggregate and subject.aggregate_points is null) then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;

  create temporary table tmp_result_students(enrollment_id uuid, class_section_id uuid, subject_count integer, complete_subject_count integer, subjects_passed integer, overall_total numeric, overall_average numeric, overall_grade text, aggregate_total integer, aggregate_classification text, is_complete boolean, ranking_eligible boolean, ranking_metric numeric, class_position integer, grade_level_position integer, class_tie_size integer default 0, grade_level_tie_size integer default 0, class_is_tied boolean default false, grade_level_is_tied boolean default false) on commit drop;
  insert into tmp_result_students
  select enrollment_id, class_section_id, count(*)::integer, count(*) filter(where subject_status='COMPLETE')::integer, count(*) filter(where subject_status='COMPLETE' and is_pass)::integer, sum(subject_score) filter(where subject_status='COMPLETE'), round(sum(subject_score) filter(where subject_status='COMPLETE') / nullif(count(*) filter(where subject_status='COMPLETE'),0), 2), null,
    case when count(*) filter(where contributes_to_aggregate) > 0 and bool_and(subject_status='COMPLETE' and aggregate_points is not null) filter(where contributes_to_aggregate) then sum(aggregate_points) filter(where contributes_to_aggregate)::integer end, null, coalesce(bool_and(subject_status in ('COMPLETE','EXEMPTED')) filter(where is_required), true), false, null, null, null, 0, 0, false, false
  from tmp_result_subjects group by enrollment_id, class_section_id;
  if classification_id is not null then
    update tmp_result_students student set aggregate_classification = band.label from public.aggregate_classification_bands band where band.scale_id = classification_id and student.aggregate_total is not null and student.aggregate_total between band.minimum_aggregate and band.maximum_aggregate;
    if exists (select 1 from tmp_result_students where aggregate_total is not null and aggregate_classification is null) then raise exception 'RESULT_CLASSIFICATION_UNMATCHED' using errcode = '23514'; end if;
  end if;
  update tmp_result_students student set overall_grade = band.grade from public.grading_bands band where band.grading_scale_id = scale_id and student.overall_average is not null and student.overall_average <@ band.score_range;
  if exists (select 1 from tmp_result_students student where student.overall_average is not null and (select count(*) from public.grading_bands band where band.grading_scale_id = scale_id and student.overall_average <@ band.score_range) <> 1) then raise exception 'RESULT_GRADING_BAND_MISSING' using errcode = '23514'; end if;
  update tmp_result_students student set ranking_metric = case selected_ranking_basis when 'TOTAL' then overall_total when 'AVERAGE' then overall_average when 'AGGREGATE' then aggregate_total else case (select rules.configuration ->> 'configured_metric' from public.ranking_rules rules where rules.id = rule_id) when 'TOTAL' then overall_total when 'AVERAGE' then overall_average when 'AGGREGATE' then aggregate_total end end;
  update tmp_result_students set ranking_eligible = ranking_metric is not null and complete_subject_count >= minimum_subjects and (include_incomplete or is_complete);
  with ranked as (select student.*, count(*) over(partition by class_section_id, ranking_metric)::integer class_ties, count(*) over(partition by ranking_metric)::integer grade_ties, dense_rank() over(partition by class_section_id order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last) class_dense, rank() over(partition by class_section_id order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last) class_competition, row_number() over(partition by class_section_id order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last, enrollment_id) class_ordinal, dense_rank() over(order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last) grade_dense, rank() over(order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last) grade_competition, row_number() over(order by (case when direction='DESC' then ranking_metric end) desc nulls last, (case when direction='ASC' then ranking_metric end) asc nulls last, enrollment_id) grade_ordinal from tmp_result_students student where ranking_eligible)
  update tmp_result_students target set class_position = case tie_method when 'DENSE' then ranked.class_dense when 'COMPETITION' then ranked.class_competition when 'ORDINAL' then ranked.class_ordinal else ranked.class_competition end, grade_level_position = case tie_method when 'DENSE' then ranked.grade_dense when 'COMPETITION' then ranked.grade_competition when 'ORDINAL' then ranked.grade_ordinal else ranked.grade_competition end, class_tie_size = ranked.class_ties, grade_level_tie_size = ranked.grade_ties, class_is_tied = ranked.class_ties > 1, grade_level_is_tied = ranked.grade_ties > 1 from ranked where target.enrollment_id = ranked.enrollment_id;
  with ranked as (select subject.enrollment_id, subject.subject_id, count(*) over(partition by subject.subject_id, subject.subject_score)::integer ties, dense_rank() over(partition by subject.subject_id order by subject.subject_score desc) dense_position, rank() over(partition by subject.subject_id order by subject.subject_score desc) competition_position, row_number() over(partition by subject.subject_id order by subject.subject_score desc, subject.enrollment_id) ordinal_position from tmp_result_subjects subject where subject.subject_status='COMPLETE' and subject.subject_score is not null)
  update tmp_result_subjects target set subject_position = case tie_method when 'DENSE' then ranked.dense_position when 'ORDINAL' then ranked.ordinal_position when 'COMPETITION' then ranked.competition_position else ranked.competition_position end, subject_tie_size = ranked.ties, subject_is_tied = ranked.ties > 1 from ranked where target.enrollment_id = ranked.enrollment_id and target.subject_id = ranked.subject_id;
  select encode(extensions.digest(target_term_id::text || ':' || target_grade_level_id::text || ':' || scale_id::text || ':' || rule_id::text || ':' || coalesce(classification_id::text,'') || ':' || coalesce((select string_agg(concat_ws('|', mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id, workflow_status::text), ';' order by class_section_id, subject_id, mark_sheet_version, mark_sheet_id) from tmp_result_sources),'') || ':' || coalesce((select string_agg(concat_ws('|', enrollment_id, subject_id, assessment_component_id, coalesce(attendance_status::text,''), coalesce(entered_score::text,''), maximum_score, weight_percentage, is_required), ';' order by enrollment_id, subject_id, assessment_component_id) from tmp_result_explanations),''), 'sha256'), 'hex') into input_hash;
  if previous.id is not null and previous.input_checksum = input_hash then return query select previous.id, previous.version, true, previous.input_checksum, previous.output_checksum; return; end if;
  select encode(extensions.digest(coalesce((select string_agg(concat_ws('|', enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, coalesce(overall_total::text,''), coalesce(overall_average::text,''), coalesce(overall_grade,''), coalesce(aggregate_total::text,''), coalesce(aggregate_classification,''), is_complete, ranking_eligible, coalesce(ranking_metric::text,''), coalesce(class_position::text,''), coalesce(grade_level_position::text,''), class_tie_size, grade_level_tie_size), ';' order by enrollment_id) from tmp_result_students),'') || ':' || coalesce((select string_agg(concat_ws('|', enrollment_id, subject_id, mark_sheet_id, subject_status::text, coalesce(subject_score::text,''), coalesce(grade,''), coalesce(aggregate_points::text,''), coalesce(is_pass::text,''), assessed_weight, has_absence, has_exemption, coalesce(subject_position::text,''), subject_tie_size), ';' order by enrollment_id, subject_id) from tmp_result_subjects),''), 'sha256'), 'hex') into output_hash;
  new_version := coalesce(previous.version, 0) + 1;
  insert into public.result_calculation_runs(term_id, grade_level_id, version, supersedes_run_id, grading_scale_id, ranking_rule_id, aggregate_classification_scale_id, input_checksum, output_checksum, created_by) values(target_term_id, target_grade_level_id, new_version, previous.id, scale_id, rule_id, classification_id, input_hash, output_hash, actor.membership_id) returning id into run_id;
  insert into public.result_calculation_sources(calculation_run_id, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id) select run_id, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id from tmp_result_sources;
  insert into public.calculated_student_results(calculation_run_id, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied) select run_id, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied from tmp_result_students;
  insert into public.calculated_subject_results(calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied) select run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied from tmp_result_subjects;
  insert into public.calculated_component_explanations(calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, assessment_component_id, component_name, attendance_status, entered_score, maximum_score, weight_percentage, included_weight, weighted_contribution) select run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, assessment_component_id, component_name, attendance_status, entered_score, maximum_score, weight_percentage, included_weight, weighted_contribution from tmp_result_explanations;
  insert into public.calculated_subject_performance(calculation_run_id, class_section_id, subject_id, mean_score, minimum_score, maximum_score, pass_rate, complete_count, incomplete_count, exempted_count, grade_distribution) select run_id, class_section_id, subject_id, round(avg(subject_score) filter(where subject_status='COMPLETE'),2), min(subject_score) filter(where subject_status='COMPLETE'), max(subject_score) filter(where subject_status='COMPLETE'), round(100 * avg(case when is_pass then 1.0 else 0.0 end) filter(where subject_status='COMPLETE'),2), count(*) filter(where subject_status='COMPLETE'), count(*) filter(where subject_status='INCOMPLETE'), count(*) filter(where subject_status='EXEMPTED'), coalesce(jsonb_object_agg(grade, grade_count) filter(where grade is not null), '{}'::jsonb) from (select class_section_id, subject_id, subject_status, subject_score, is_pass, grade, count(*) over(partition by class_section_id, subject_id, grade) as grade_count from tmp_result_subjects) distribution group by class_section_id, subject_id;
  perform internal.record_configuration_audit(actor.profile_id, actor.membership_id, actor.school_id, 'RESULT_CALCULATION_CREATED', 'result_calculation_run', run_id, null, jsonb_build_object('version', new_version, 'term_id', target_term_id, 'grade_level_id', target_grade_level_id, 'input_checksum', input_hash, 'output_checksum', output_hash, 'source_count', (select count(*) from tmp_result_sources)));
  return query select run_id, new_version, false, input_hash, output_hash;
end;
$$;
