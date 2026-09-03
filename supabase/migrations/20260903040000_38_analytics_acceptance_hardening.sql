-- Stage 16 acceptance hardening.
-- Migration 37 remains reviewed history. This additive migration corrects
-- term-year scope eligibility, duplicate display-label aggregation, and
-- deterministic presentation ordering without adding analytics state.

create or replace function internal.analytics_term_grade_scopes(
  target_school_id uuid,
  target_term_id uuid
)
returns table(
  academic_year_id uuid,
  grade_level_id uuid,
  grade_name text,
  grade_sort_order integer
)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select year.id, grade.id, grade.name, grade.sort_order
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  join public.grade_levels grade on grade.school_id = year.school_id
  where term.id = target_term_id
    and year.school_id = target_school_id
    and grade.is_active
    and exists (
      select 1
      from public.class_sections section
      where section.academic_year_id = term.academic_year_id
        and section.grade_level_id = grade.id
        and section.is_active
    )
  order by grade.sort_order, grade.id;
$$;

revoke all on function internal.analytics_term_grade_scopes(uuid, uuid)
  from public, anon, authenticated;

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
      eligible.grade_level_id as selected_grade_id, eligible.grade_name as selected_grade_name
    from public.academic_years year
    join public.terms term on term.academic_year_id = year.id
    join lateral internal.analytics_term_grade_scopes(actor.school_id, term.id) eligible on true
    where year.school_id = actor.school_id
    order by year.starts_on desc, term.term_number, eligible.grade_sort_order, eligible.grade_level_id
  loop
    select run.* into latest_run
    from public.result_calculation_runs run
    where run.term_id = item.selected_term_id and run.grade_level_id = item.selected_grade_id
    order by run.version desc, run.id desc
    limit 1;

    select count(*) into expected
    from public.class_sections section
    join public.grade_level_subjects mapping on mapping.grade_level_id = item.selected_grade_id
    where section.academic_year_id = item.year_id
      and section.grade_level_id = item.selected_grade_id
      and section.is_active;

    select count(*) into locked_latest
    from public.class_sections section
    join public.grade_level_subjects mapping on mapping.grade_level_id = item.selected_grade_id
    join lateral (
      select sheet.workflow_status
      from public.mark_sheets sheet
      where sheet.term_id = item.selected_term_id
        and sheet.class_section_id = section.id
        and sheet.subject_id = mapping.subject_id
      order by sheet.version desc, sheet.id desc
      limit 1
    ) latest on true
    where section.academic_year_id = item.year_id
      and section.grade_level_id = item.selected_grade_id
      and section.is_active
      and latest.workflow_status = 'LOCKED';

    select count(*) into latest_source_count
    from public.class_sections section
    join public.grade_level_subjects mapping on mapping.grade_level_id = item.selected_grade_id
    join lateral (
      select sheet.id
      from public.mark_sheets sheet
      where sheet.term_id = item.selected_term_id
        and sheet.class_section_id = section.id
        and sheet.subject_id = mapping.subject_id
      order by sheet.version desc, sheet.id desc
      limit 1
    ) latest on true
    where section.academic_year_id = item.year_id
      and section.grade_level_id = item.selected_grade_id
      and section.is_active;

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
declare
  actor record;
  selected_term public.terms%rowtype;
  selected_year public.academic_years%rowtype;
begin
  select * into actor from internal.require_analytics_reader();
  select term.* into selected_term
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id and year.school_id = actor.school_id;
  if not found then return; end if;

  select year.* into selected_year
  from public.academic_years year
  where year.id = selected_term.academic_year_id;

  return query
  with eligible as (
    select scope.grade_level_id as id, scope.grade_name as name,
      scope.grade_sort_order as sort_order,
      (
        select run.id
        from public.result_calculation_runs run
        where run.term_id = selected_term.id and run.grade_level_id = scope.grade_level_id
        order by run.version desc, run.id desc
        limit 1
      ) as run_id
    from internal.analytics_term_grade_scopes(actor.school_id, selected_term.id) scope
  ), current_scopes as (
    select eligible.*, internal.analytics_run_is_current(eligible.run_id, actor.school_id) as is_current
    from eligible
  ), population as (
    select result.*
    from public.calculated_student_results result
    join current_scopes scope on scope.run_id = result.calculation_run_id and scope.is_current
  ), coverage_rows as (
    select scope.id as grade_level_id, scope.name as grade_name, scope.sort_order, scope.run_id,
      scope.is_current,
      case when scope.run_id is null then 'NO_RUN' when not scope.is_current then 'STALE_RUN' else 'CURRENT' end as state,
      (
        select count(*)
        from public.enrollments enrollment
        join public.class_sections section on section.id = enrollment.class_section_id
        where section.academic_year_id = selected_year.id
          and section.grade_level_id = scope.id
          and section.is_active
          and enrollment.academic_year_id = selected_year.id
          and enrollment.status in ('ACTIVE','REPEATING')
      ) as source_population
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
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'grade_level_id', row.grade_level_id,
        'grade_name', row.grade_name,
        'run_id', row.run_id,
        'state', row.state,
        'source_student_population', row.source_population
      ) order by row.sort_order, row.grade_level_id)
      from coverage_rows row
    ), '[]'::jsonb)
  from coverage_rows
  group by selected_term.id, selected_term.name, selected_year.name;
end;
$$;

create or replace function public.list_analytics_distributions(
  target_run_id uuid,
  target_class_section_id uuid default null
)
returns table(
  distribution_type text, label text, row_count bigint, percentage numeric, sort_order integer,
  distribution_population bigint, ungraded_count bigint, unclassified_count bigint,
  classification_scale_present boolean
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  run_row public.result_calculation_runs%rowtype;
  graded bigint;
  classified bigint;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  select * into run_row from public.result_calculation_runs where id = target_run_id;

  select count(*) filter (where result.overall_grade is not null),
    count(*) filter (where result.aggregate_classification is not null)
  into graded, classified
  from public.calculated_student_results result
  where result.calculation_run_id = target_run_id
    and (target_class_section_id is null or result.class_section_id = target_class_section_id);

  return query
  with population as (
    select result.id, result.overall_grade
    from public.calculated_student_results result
    where result.calculation_run_id = target_run_id
      and (target_class_section_id is null or result.class_section_id = target_class_section_id)
  ), grade_labels as (
    select band.grade as label, min(band.sort_order)::integer as sort_order
    from public.grading_bands band
    where band.grading_scale_id = run_row.grading_scale_id
    group by band.grade
  )
  select 'OVERALL_GRADE', labels.label, count(population.id),
    round(100.0 * count(population.id) / nullif(graded, 0), 2), labels.sort_order,
    graded, (select count(*) from population where population.overall_grade is null), 0::bigint, true
  from grade_labels labels
  left join population on population.overall_grade = labels.label
  group by labels.label, labels.sort_order
  order by labels.sort_order, labels.label;

  if run_row.aggregate_classification_scale_id is not null then
    return query
    with population as (
      select result.id, result.aggregate_classification
      from public.calculated_student_results result
      where result.calculation_run_id = target_run_id
        and (target_class_section_id is null or result.class_section_id = target_class_section_id)
    ), classification_labels as (
      select band.label, min(band.sort_order)::integer as sort_order
      from public.aggregate_classification_bands band
      where band.scale_id = run_row.aggregate_classification_scale_id
      group by band.label
    )
    select 'AGGREGATE_CLASSIFICATION', labels.label, count(population.id),
      round(100.0 * count(population.id) / nullif(classified, 0), 2), labels.sort_order,
      classified, 0::bigint,
      (select count(*) from population where population.aggregate_classification is null), true
    from classification_labels labels
    left join population on population.aggregate_classification = labels.label
    group by labels.label, labels.sort_order
    order by labels.sort_order, labels.label;
  else
    return query
    select 'AGGREGATE_CLASSIFICATION', null::text, 0::bigint, null::numeric, null::integer,
      classified, 0::bigint,
      (select count(*)
       from public.calculated_student_results result
       where result.calculation_run_id = target_run_id
         and (target_class_section_id is null or result.class_section_id = target_class_section_id)
         and result.aggregate_classification is null),
      false;
  end if;
end;
$$;

create or replace function public.list_analytics_top_students(
  target_run_id uuid,
  target_class_section_id uuid default null,
  max_position integer default 10
)
returns table(
  enrollment_id uuid, admission_number text, student_name text, class_section_id uuid, class_name text,
  overall_average numeric, overall_grade text, rank_position integer, tie_size integer, is_tied boolean
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  limit_position integer;
begin
  select * into actor from internal.require_analytics_reader();
  if not internal.analytics_run_is_current(target_run_id, actor.school_id) then return; end if;
  limit_position := least(greatest(coalesce(max_position, 10), 1), 50);

  return query
  select result.enrollment_id, student.admission_number,
    concat_ws(' ', student.first_name, student.middle_name, student.last_name),
    result.class_section_id, section.name, result.overall_average, result.overall_grade,
    case when target_class_section_id is null then result.grade_level_position else result.class_position end,
    case when target_class_section_id is null then result.grade_level_tie_size else result.class_tie_size end,
    case when target_class_section_id is null then result.grade_level_is_tied else result.class_is_tied end
  from public.calculated_student_results result
  join public.enrollments enrollment on enrollment.id = result.enrollment_id
  join public.students student on student.id = enrollment.student_id
  join public.class_sections section on section.id = result.class_section_id
  where result.calculation_run_id = target_run_id
    and result.ranking_eligible
    and (target_class_section_id is null or result.class_section_id = target_class_section_id)
    and (case when target_class_section_id is null then result.grade_level_position else result.class_position end) <= limit_position
  order by
    case when target_class_section_id is null then result.grade_level_position else result.class_position end asc,
    student.admission_number asc,
    result.enrollment_id asc;
end;
$$;

comment on function internal.analytics_term_grade_scopes(uuid, uuid)
  is 'Authoritative Stage 16 term-year grade scope: active grade with at least one active class section.';
comment on function public.list_analytics_distributions(uuid, uuid)
  is 'Read-only distributions with one row per distinct configured display label.';
comment on function public.list_analytics_top_students(uuid, uuid, integer)
  is 'Read-only Stage 11 ranking presentation with deterministic tie ordering.';
