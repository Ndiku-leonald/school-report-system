-- Stage 16: secure, read-only academic analytics.
-- Analytics consumes immutable Stage 11 calculation output. It adds no
-- analytics tables and never recalculates or mutates academic results.

create or replace function internal.current_analytics_reader()
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
    and internal.current_user_has_permission(membership.school_id, 'ANALYTICS_VIEW');
$$;

create or replace function internal.require_analytics_reader()
returns table(profile_id uuid, membership_id uuid, school_id uuid)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query select * from internal.current_analytics_reader();
  if not found then
    raise exception 'ANALYTICS_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

-- This is deliberately an internal, fail-closed predicate. A run is current
-- only when it is the newest version, belongs to the selected school, the
-- term is locked, every current curriculum scope has a locked latest source,
-- and the authoritative Stage 11 checksum still matches.
create or replace function internal.analytics_run_is_current(
  target_run_id uuid,
  target_school_id uuid
)
returns boolean
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare
  run_row public.result_calculation_runs%rowtype;
  current_checksum text;
  expected_count bigint;
  locked_latest_count bigint;
  latest_run_id uuid;
begin
  select run.* into run_row
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.grade_levels grade on grade.id = run.grade_level_id
  where run.id = target_run_id
    and year.school_id = target_school_id
    and grade.school_id = target_school_id;

  if not found or run_row.id is null then
    return false;
  end if;

  if not exists (
    select 1 from public.terms term
    where term.id = run_row.term_id and term.status = 'LOCKED'
  ) then
    return false;
  end if;

  select run.id into latest_run_id
  from public.result_calculation_runs run
  where run.term_id = run_row.term_id
    and run.grade_level_id = run_row.grade_level_id
  order by run.version desc, run.id desc
  limit 1;

  if latest_run_id is distinct from run_row.id then
    return false;
  end if;

  select count(*) into expected_count
  from public.class_sections section
  join public.grade_level_subjects mapping
    on mapping.grade_level_id = run_row.grade_level_id
  where section.academic_year_id = (
      select academic_year_id from public.terms where id = run_row.term_id
    )
    and section.grade_level_id = run_row.grade_level_id
    and section.is_active;

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
    order by sheet.version desc, sheet.id desc
    limit 1
  ) latest on true
  where section.academic_year_id = (
      select academic_year_id from public.terms where id = run_row.term_id
    )
    and section.grade_level_id = run_row.grade_level_id
    and section.is_active
    and latest.workflow_status = 'LOCKED';

  if expected_count = 0 or locked_latest_count <> expected_count then
    return false;
  end if;

  current_checksum := internal.results_input_checksum(
    run_row.term_id,
    run_row.grade_level_id,
    run_row.grading_scale_id,
    run_row.ranking_rule_id,
    run_row.aggregate_classification_scale_id
  );

  return run_row.input_checksum = current_checksum;
end;
$$;

revoke all on function internal.current_analytics_reader() from public, anon, authenticated;
revoke all on function internal.require_analytics_reader() from public, anon, authenticated;
revoke all on function internal.analytics_run_is_current(uuid, uuid) from public, anon, authenticated;

create or replace function public.list_analytics_scopes()
returns table(
  academic_year_id uuid,
  academic_year_name text,
  term_id uuid,
  term_name text,
  term_status public.term_status,
  grade_level_id uuid,
  grade_name text,
  current_run_id uuid,
  calculation_version integer,
  run_created_at timestamptz,
  input_checksum text,
  output_checksum text,
  analytics_population bigint,
  expected_source_scopes bigint,
  current_locked_source_scopes bigint,
  readiness_state text
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  item record;
  latest_run public.result_calculation_runs%rowtype;
  expected bigint;
  locked_latest bigint;
  latest_source_count bigint;
  state text;
begin
  select * into actor from internal.require_analytics_reader();
  for item in
    select year.id as year_id, year.name as year_name, term.id as selected_term_id,
      term.name as selected_term_name, term.status as selected_term_status,
      grade.id as selected_grade_id, grade.name as selected_grade_name
    from public.academic_years year
    join public.terms term on term.academic_year_id = year.id
    join public.grade_levels grade on grade.school_id = year.school_id and grade.is_active
    where year.school_id = actor.school_id
    order by year.starts_on desc, term.term_number, grade.sort_order, grade.id
  loop
    select run.* into latest_run
    from public.result_calculation_runs run
    where run.term_id = item.selected_term_id and run.grade_level_id = item.selected_grade_id
    order by run.version desc, run.id desc limit 1;

    select count(*) into expected
    from public.class_sections section
    join public.grade_level_subjects mapping on mapping.grade_level_id = item.selected_grade_id
    where section.academic_year_id = item.year_id
      and section.grade_level_id = item.selected_grade_id and section.is_active;

    select count(*) into locked_latest
    from public.class_sections section
    join public.grade_level_subjects mapping on mapping.grade_level_id = item.selected_grade_id
    join lateral (
      select sheet.workflow_status from public.mark_sheets sheet
      where sheet.term_id = item.selected_term_id
        and sheet.class_section_id = section.id and sheet.subject_id = mapping.subject_id
      order by sheet.version desc, sheet.id desc limit 1
    ) latest on true
    where section.academic_year_id = item.year_id
      and section.grade_level_id = item.selected_grade_id and section.is_active
      and latest.workflow_status = 'LOCKED';

    select count(*) into latest_source_count
    from public.class_sections section
    join public.grade_level_subjects mapping on mapping.grade_level_id = item.selected_grade_id
    join lateral (
      select sheet.id from public.mark_sheets sheet
      where sheet.term_id = item.selected_term_id
        and sheet.class_section_id = section.id and sheet.subject_id = mapping.subject_id
      order by sheet.version desc, sheet.id desc limit 1
    ) latest on true
    where section.academic_year_id = item.year_id
      and section.grade_level_id = item.selected_grade_id and section.is_active;

    if item.selected_term_status <> 'LOCKED' then state := 'TERM_NOT_LOCKED';
    elsif latest_run.id is null then state := 'NO_RUN';
    elsif latest_source_count < expected then state := 'MISSING_SOURCE';
    elsif locked_latest <> expected then state := 'UNLOCKED_SOURCE';
    elsif not internal.analytics_run_is_current(latest_run.id, actor.school_id) then state := 'STALE_RUN';
    else state := 'CURRENT';
    end if;

    academic_year_id := item.year_id;
    academic_year_name := item.year_name;
    term_id := item.selected_term_id;
    term_name := item.selected_term_name;
    term_status := item.selected_term_status;
    grade_level_id := item.selected_grade_id;
    grade_name := item.selected_grade_name;
    current_run_id := latest_run.id;
    calculation_version := latest_run.version;
    run_created_at := latest_run.created_at;
    input_checksum := latest_run.input_checksum;
    output_checksum := latest_run.output_checksum;
    if state = 'CURRENT' then
      select count(*) into analytics_population
      from public.calculated_student_results result
      where result.calculation_run_id = latest_run.id;
    else
      analytics_population := 0;
    end if;
    expected_source_scopes := expected;
    current_locked_source_scopes := locked_latest;
    readiness_state := state;
    return next;
  end loop;
end;
$$;

create or replace function public.get_grade_analytics(target_run_id uuid)
returns table(
  run_id uuid, term_id uuid, term_name text, academic_year_name text,
  grade_level_id uuid, grade_name text, calculation_version integer,
  input_checksum text, output_checksum text, analytics_population bigint,
  complete_count bigint, incomplete_count bigint, average_population_count bigint,
  mean_overall_average numeric, ranking_eligible_count bigint, graded_count bigint,
  aggregate_classified_count bigint, class_count bigint
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; run_row public.result_calculation_runs%rowtype;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  select run.* into run_row from public.result_calculation_runs run where run.id = target_run_id;
  return query
  select run.id, term.id, term.name, year.name, grade.id, grade.name, run.version,
    run.input_checksum, run.output_checksum, count(result.id),
    count(result.id) filter (where result.is_complete),
    count(result.id) filter (where not result.is_complete),
    count(result.id) filter (where result.overall_average is not null),
    round(avg(result.overall_average) filter (where result.overall_average is not null), 2),
    count(result.id) filter (where result.ranking_eligible),
    count(result.id) filter (where result.overall_grade is not null),
    count(result.id) filter (where result.aggregate_classification is not null),
    (select count(*) from public.class_sections section
      where section.academic_year_id = year.id and section.grade_level_id = grade.id and section.is_active)
  from public.result_calculation_runs run
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.grade_levels grade on grade.id = run.grade_level_id
  left join public.calculated_student_results result on result.calculation_run_id = run.id
  where run.id = run_row.id
  group by run.id, term.id, term.name, year.name, grade.id, grade.name, run.version,
    run.input_checksum, run.output_checksum, year.id;
end;
$$;

create or replace function public.get_school_analytics(target_term_id uuid)
returns table(
  term_id uuid, term_name text, academic_year_name text, eligible_grade_count bigint,
  current_grade_count bigint, excluded_grade_count bigint, analytics_population bigint,
  source_student_population bigint, complete_count bigint, incomplete_count bigint,
  average_population_count bigint, mean_overall_average numeric, ranking_eligible_count bigint,
  graded_count bigint, aggregate_classified_count bigint, coverage jsonb
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; selected_term public.terms%rowtype; selected_year public.academic_years%rowtype;
begin
  select * into actor from internal.require_analytics_reader();
  select term.* into selected_term from public.terms term join public.academic_years year on year.id = term.academic_year_id
    where term.id = target_term_id and year.school_id = actor.school_id;
  if not found then return; end if;
  select year.* into selected_year from public.academic_years year where year.id = selected_term.academic_year_id;
  return query
  with eligible as (
    select grade.id, grade.name, grade.sort_order,
      (select run.id from public.result_calculation_runs run where run.term_id = selected_term.id and run.grade_level_id = grade.id order by run.version desc, run.id desc limit 1) as run_id
    from public.grade_levels grade where grade.school_id = actor.school_id and grade.is_active
  ), current_scopes as (
    select eligible.*, internal.analytics_run_is_current(eligible.run_id, actor.school_id) as is_current
    from eligible
  ), population as (
    select result.* from public.calculated_student_results result join current_scopes scope on scope.run_id = result.calculation_run_id and scope.is_current
  ), coverage_rows as (
    select scope.id as grade_level_id, scope.name as grade_name, scope.sort_order, scope.run_id,
      scope.is_current,
      case when scope.run_id is null then 'NO_RUN' when not scope.is_current then 'STALE_RUN' else 'CURRENT' end as state,
      (select count(*) from public.enrollments enrollment join public.class_sections section on section.id = enrollment.class_section_id
        where section.academic_year_id = selected_year.id and section.grade_level_id = scope.id and section.is_active
          and enrollment.academic_year_id = selected_year.id and enrollment.status in ('ACTIVE','REPEATING')) as source_population
    from current_scopes scope
  )
  select selected_term.id, selected_term.name, selected_year.name,
    (select count(*) from coverage_rows)::bigint,
    (select count(*) from coverage_rows where coverage_rows.is_current)::bigint,
    (select count(*) from coverage_rows where not coverage_rows.is_current)::bigint,
    (select count(*) from population),
    coalesce((select sum(coverage_rows.source_population) from coverage_rows), 0)::bigint,
    (select count(*) from population where population.is_complete),
    (select count(*) from population where not population.is_complete),
    (select count(*) from population where population.overall_average is not null),
    (select round(avg(population.overall_average) filter (where population.overall_average is not null), 2) from population),
    (select count(*) from population where population.ranking_eligible),
    (select count(*) from population where population.overall_grade is not null),
    (select count(*) from population where population.aggregate_classification is not null),
    coalesce((select jsonb_agg(jsonb_build_object('grade_level_id', row.grade_level_id, 'grade_name', row.grade_name, 'run_id', row.run_id, 'state', row.state, 'source_student_population', row.source_population) order by row.sort_order) from coverage_rows row), '[]'::jsonb)
  from coverage_rows
  group by selected_term.id, selected_term.name, selected_year.name;
end;
$$;

create or replace function public.list_analytics_class_summaries(target_run_id uuid)
returns table(class_section_id uuid, class_name text, analytics_population bigint, complete_count bigint,
  incomplete_count bigint, average_population_count bigint, mean_overall_average numeric,
  ranking_eligible_count bigint, graded_count bigint, aggregate_classified_count bigint)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; run_row public.result_calculation_runs%rowtype;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  select * into run_row from public.result_calculation_runs where id = target_run_id;
  return query
  select section.id, section.name, count(result.id), count(result.id) filter(where result.is_complete),
    count(result.id) filter(where not result.is_complete), count(result.id) filter(where result.overall_average is not null),
    round(avg(result.overall_average) filter(where result.overall_average is not null),2),
    count(result.id) filter(where result.ranking_eligible), count(result.id) filter(where result.overall_grade is not null),
    count(result.id) filter(where result.aggregate_classification is not null)
  from public.class_sections section
  left join public.calculated_student_results result on result.class_section_id = section.id and result.calculation_run_id = target_run_id
  join public.academic_years year on year.id = section.academic_year_id
  where section.academic_year_id = (select academic_year_id from public.terms where id = run_row.term_id)
    and section.grade_level_id = run_row.grade_level_id and section.is_active and year.school_id = actor.school_id
  group by section.id, section.name order by section.name, section.id;
end;
$$;

create or replace function public.get_class_analytics(target_run_id uuid, target_class_section_id uuid)
returns table(class_section_id uuid, class_name text, analytics_population bigint, complete_count bigint,
  incomplete_count bigint, average_population_count bigint, mean_overall_average numeric,
  ranking_eligible_count bigint, graded_count bigint, aggregate_classified_count bigint)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  return query select summaries.* from public.list_analytics_class_summaries(target_run_id) summaries
    where summaries.class_section_id = target_class_section_id;
end;
$$;

create or replace function public.list_analytics_distributions(target_run_id uuid, target_class_section_id uuid default null)
returns table(distribution_type text, label text, row_count bigint, percentage numeric, sort_order integer,
  distribution_population bigint, ungraded_count bigint, unclassified_count bigint, classification_scale_present boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; run_row public.result_calculation_runs%rowtype; graded bigint; classified bigint;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  select * into run_row from public.result_calculation_runs where id = target_run_id;
  select count(*) filter(where result.overall_grade is not null), count(*) filter(where result.aggregate_classification is not null)
    into graded, classified from public.calculated_student_results result where result.calculation_run_id = target_run_id and (target_class_section_id is null or result.class_section_id = target_class_section_id);
  return query
  select 'OVERALL_GRADE', band.grade, count(result.id), round(100.0 * count(result.id) / nullif(graded,0),2), band.sort_order,
    graded, (select count(*) from public.calculated_student_results result where result.calculation_run_id = target_run_id and (target_class_section_id is null or result.class_section_id = target_class_section_id) and result.overall_grade is null), 0::bigint, true
  from public.grading_bands band left join public.calculated_student_results result
    on result.calculation_run_id = target_run_id and result.overall_grade = band.grade and (target_class_section_id is null or result.class_section_id = target_class_section_id)
  where band.grading_scale_id = run_row.grading_scale_id group by band.grade, band.sort_order order by band.sort_order;
  if run_row.aggregate_classification_scale_id is not null then
    return query
    select 'AGGREGATE_CLASSIFICATION', band.label, count(result.id), round(100.0 * count(result.id) / nullif(classified,0),2), band.sort_order,
      classified, 0::bigint, (select count(*) from public.calculated_student_results result where result.calculation_run_id = target_run_id and (target_class_section_id is null or result.class_section_id = target_class_section_id) and result.aggregate_classification is null), true
    from public.aggregate_classification_bands band left join public.calculated_student_results result
      on result.calculation_run_id = target_run_id and result.aggregate_classification = band.label and (target_class_section_id is null or result.class_section_id = target_class_section_id)
    where band.scale_id = run_row.aggregate_classification_scale_id group by band.label, band.sort_order order by band.sort_order;
  else
    return query select 'AGGREGATE_CLASSIFICATION', null::text, 0::bigint, null::numeric, null::integer, 0::bigint, 0::bigint,
      (select count(*) from public.calculated_student_results result where result.calculation_run_id = target_run_id and (target_class_section_id is null or result.class_section_id = target_class_section_id) and result.aggregate_classification is null), false;
  end if;
end;
$$;

create or replace function public.list_analytics_subject_performance(target_run_id uuid, target_class_section_id uuid default null)
returns table(class_section_id uuid, subject_id uuid, subject_name text, mean_score numeric, minimum_score numeric,
  maximum_score numeric, pass_rate numeric, complete_count integer, incomplete_count integer, exempted_count integer, grade_distribution jsonb)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; run_row public.result_calculation_runs%rowtype;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  select * into run_row from public.result_calculation_runs where id = target_run_id;
  if target_class_section_id is null then
    return query select null::uuid, performance.subject_id, subject.name, performance.mean_score, performance.minimum_score,
      performance.maximum_score, performance.pass_rate, performance.complete_count, performance.incomplete_count, performance.exempted_count, performance.grade_distribution
      from public.calculated_grade_subject_performance performance join public.subjects subject on subject.id = performance.subject_id
      where performance.calculation_run_id = target_run_id order by subject.sort_order, subject.id;
  else
    return query select performance.class_section_id, performance.subject_id, subject.name, performance.mean_score, performance.minimum_score,
      performance.maximum_score, performance.pass_rate, performance.complete_count, performance.incomplete_count, performance.exempted_count, performance.grade_distribution
      from public.calculated_subject_performance performance join public.subjects subject on subject.id = performance.subject_id
      where performance.calculation_run_id = target_run_id and performance.class_section_id = target_class_section_id order by subject.sort_order, subject.id;
  end if;
end;
$$;

create or replace function public.list_analytics_top_students(target_run_id uuid, target_class_section_id uuid default null, max_position integer default 10)
returns table(enrollment_id uuid, admission_number text, student_name text, class_section_id uuid, class_name text,
  overall_average numeric, overall_grade text, position integer, tie_size integer, is_tied boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; run_row public.result_calculation_runs%rowtype; limit_position integer;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  limit_position := least(greatest(coalesce(max_position, 10), 1), 50);
  select * into run_row from public.result_calculation_runs where id = target_run_id;
  return query
  select ranked.enrollment_id, ranked.admission_number, ranked.student_name, ranked.class_section_id,
    ranked.class_name, ranked.overall_average, ranked.overall_grade, ranked.rank_position,
    ranked.tie_size, ranked.is_tied
  from (
    select result.enrollment_id, student.admission_number,
      concat_ws(' ', student.first_name, student.middle_name, student.last_name) as student_name,
      result.class_section_id, section.name as class_name, result.overall_average, result.overall_grade,
      case when target_class_section_id is null then result.grade_level_position else result.class_position end as rank_position,
      case when target_class_section_id is null then result.grade_level_tie_size else result.class_tie_size end as tie_size,
      case when target_class_section_id is null then result.grade_level_is_tied else result.class_is_tied end as is_tied,
      student.id as student_id
    from public.calculated_student_results result
    join public.enrollments enrollment on enrollment.id = result.enrollment_id
    join public.students student on student.id = enrollment.student_id
    join public.class_sections section on section.id = result.class_section_id
    where result.calculation_run_id = target_run_id and result.ranking_eligible
      and (target_class_section_id is null or result.class_section_id = target_class_section_id)
      and (case when target_class_section_id is null then result.grade_level_position else result.class_position end) <= limit_position
  ) ranked
  ;
end;
$$;

create or replace function public.list_analytics_attention_students(target_run_id uuid, target_class_section_id uuid default null)
returns table(enrollment_id uuid, admission_number text, student_name text, class_section_id uuid, class_name text,
  overall_average numeric, overall_grade text, is_complete boolean, failed_subject_count bigint,
  incomplete_subject_count bigint, attention_reason text)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  return query
  with concerns as (
    select subject_result.enrollment_id,
      count(*) filter(where subject_result.subject_status = 'COMPLETE' and subject_result.is_pass = false) as failed_count,
      count(*) filter(where subject_result.subject_status = 'INCOMPLETE') as incomplete_count
    from public.calculated_subject_results subject_result
    where subject_result.calculation_run_id = target_run_id
      and (target_class_section_id is null or subject_result.class_section_id = target_class_section_id)
    group by subject_result.enrollment_id
  )
  select result.enrollment_id, student.admission_number, concat_ws(' ', student.first_name, student.middle_name, student.last_name),
    result.class_section_id, section.name, result.overall_average, result.overall_grade, result.is_complete,
    concerns.failed_count, concerns.incomplete_count,
    concat_ws('; ', case when not result.is_complete then 'Incomplete result' end,
      case when concerns.incomplete_count > 0 then 'Incomplete subject' end,
      case when concerns.failed_count > 0 then 'Failed complete subject' end)
  from public.calculated_student_results result
  join concerns on concerns.enrollment_id = result.enrollment_id
  join public.enrollments enrollment on enrollment.id = result.enrollment_id
  join public.students student on student.id = enrollment.student_id
  join public.class_sections section on section.id = result.class_section_id
  where result.calculation_run_id = target_run_id
    and (target_class_section_id is null or result.class_section_id = target_class_section_id)
    and (not result.is_complete or concerns.failed_count > 0 or concerns.incomplete_count > 0)
  order by result.class_section_id, student.admission_number, result.enrollment_id;
end;
$$;

create or replace function public.get_analytics_student(target_run_id uuid, target_enrollment_id uuid)
returns table(enrollment_id uuid, admission_number text, student_name text, class_name text, term_name text, grade_name text,
  academic_year_name text, calculation_version integer, overall_total numeric, overall_average numeric, overall_grade text,
  aggregate_total integer, aggregate_classification text, class_position integer, grade_level_position integer,
  class_tie_size integer, grade_level_tie_size integer, class_is_tied boolean, grade_level_is_tied boolean,
  is_complete boolean, ranking_eligible boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  return query select result.enrollment_id, student.admission_number, concat_ws(' ', student.first_name, student.middle_name, student.last_name),
    section.name, term.name, grade.name, year.name, run.version, result.overall_total, result.overall_average, result.overall_grade,
    result.aggregate_total, result.aggregate_classification, result.class_position, result.grade_level_position,
    result.class_tie_size, result.grade_level_tie_size, result.class_is_tied, result.grade_level_is_tied,
    result.is_complete, result.ranking_eligible
  from public.calculated_student_results result
  join public.result_calculation_runs run on run.id = result.calculation_run_id
  join public.terms term on term.id = run.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.grade_levels grade on grade.id = run.grade_level_id
  join public.enrollments enrollment on enrollment.id = result.enrollment_id
  join public.students student on student.id = enrollment.student_id
  join public.class_sections section on section.id = result.class_section_id
  where result.calculation_run_id = target_run_id and result.enrollment_id = target_enrollment_id
    and year.school_id = actor.school_id and student.school_id = actor.school_id;
end;
$$;

create or replace function public.list_analytics_student_subjects(target_run_id uuid, target_enrollment_id uuid)
returns table(subject_id uuid, subject_name text, subject_status public.calculated_subject_status, subject_score numeric,
  grade text, aggregate_points integer, is_pass boolean, subject_position integer, subject_tie_size integer,
  subject_is_tied boolean, has_absence boolean, has_exemption boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  return query select result.subject_id, subject.name, result.subject_status, result.subject_score, result.grade,
    result.aggregate_points, result.is_pass, result.subject_position, result.subject_tie_size, result.subject_is_tied,
    result.has_absence, result.has_exemption
  from public.calculated_subject_results result join public.subjects subject on subject.id = result.subject_id
  where result.calculation_run_id = target_run_id and result.enrollment_id = target_enrollment_id
  order by subject.sort_order, subject.id;
end;
$$;

revoke all on function public.list_analytics_scopes() from public, anon;
revoke all on function public.get_grade_analytics(uuid) from public, anon;
revoke all on function public.get_school_analytics(uuid) from public, anon;
revoke all on function public.list_analytics_class_summaries(uuid) from public, anon;
revoke all on function public.get_class_analytics(uuid, uuid) from public, anon;
revoke all on function public.list_analytics_distributions(uuid, uuid) from public, anon;
revoke all on function public.list_analytics_subject_performance(uuid, uuid) from public, anon;
revoke all on function public.list_analytics_top_students(uuid, uuid, integer) from public, anon;
revoke all on function public.list_analytics_attention_students(uuid, uuid) from public, anon;
revoke all on function public.get_analytics_student(uuid, uuid) from public, anon;
revoke all on function public.list_analytics_student_subjects(uuid, uuid) from public, anon;
grant execute on function public.list_analytics_scopes() to authenticated;
grant execute on function public.get_grade_analytics(uuid) to authenticated;
grant execute on function public.get_school_analytics(uuid) to authenticated;
grant execute on function public.list_analytics_class_summaries(uuid) to authenticated;
grant execute on function public.get_class_analytics(uuid, uuid) to authenticated;
grant execute on function public.list_analytics_distributions(uuid, uuid) to authenticated;
grant execute on function public.list_analytics_subject_performance(uuid, uuid) to authenticated;
grant execute on function public.list_analytics_top_students(uuid, uuid, integer) to authenticated;
grant execute on function public.list_analytics_attention_students(uuid, uuid) to authenticated;
grant execute on function public.get_analytics_student(uuid, uuid) to authenticated;
grant execute on function public.list_analytics_student_subjects(uuid, uuid) to authenticated;

comment on function internal.current_analytics_reader() is 'Selected active membership with the independent ANALYTICS_VIEW grant.';
comment on function internal.analytics_run_is_current(uuid, uuid) is 'Fail-closed Stage 11 currentness check for analytics reads.';
comment on function public.get_school_analytics(uuid) is 'One database-side school analytics snapshot over current grade runs only.';
