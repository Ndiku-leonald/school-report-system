create table public.assessment_schemes (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  grade_level_id uuid not null
    references public.grade_levels(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 150),
  version integer not null default 1 check (version > 0),
  status public.assessment_scheme_status not null default 'DRAFT',
  effective_from date not null,
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_scheme_version_unique
    unique (term_id, grade_level_id, subject_id, version)
);

create unique index assessment_scheme_one_active_version_idx
  on public.assessment_schemes (term_id, grade_level_id, subject_id)
  where status = 'ACTIVE';

create table public.assessment_components (
  id uuid primary key default gen_random_uuid(),
  assessment_scheme_id uuid not null
    references public.assessment_schemes(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 150),
  component_code text not null
    check (length(btrim(component_code)) between 1 and 50),
  maximum_score numeric(7, 2) not null check (maximum_score > 0),
  weight_percentage numeric(5, 2) not null
    check (weight_percentage > 0 and weight_percentage <= 100),
  sort_order integer not null check (sort_order > 0),
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_component_code_unique
    unique (assessment_scheme_id, component_code),
  constraint assessment_component_sort_unique
    unique (assessment_scheme_id, sort_order)
);

create table public.mark_sheets (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  class_section_id uuid not null
    references public.class_sections(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  assessment_scheme_id uuid not null
    references public.assessment_schemes(id) on delete restrict,
  teaching_assignment_id uuid not null
    references public.teaching_assignments(id) on delete restrict,
  workflow_status public.mark_sheet_status not null default 'DRAFT',
  version integer not null default 1 check (version > 0),
  submitted_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  approved_at timestamptz,
  locked_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  locked_at timestamptz,
  returned_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  returned_at timestamptz,
  return_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mark_sheet_version_unique
    unique (term_id, class_section_id, subject_id, version),
  constraint mark_sheet_return_details_required check (
    workflow_status <> 'RETURNED'
    or (
      returned_by is not null
      and returned_at is not null
      and length(btrim(return_reason)) > 0
    )
  )
);

create unique index mark_sheet_one_working_revision_idx
  on public.mark_sheets (term_id, class_section_id, subject_id)
  where workflow_status in (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'RETURNED',
    'APPROVED'
  );

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  mark_sheet_id uuid not null
    references public.mark_sheets(id) on delete restrict,
  assessment_component_id uuid not null
    references public.assessment_components(id) on delete restrict,
  enrollment_id uuid not null
    references public.enrollments(id) on delete restrict,
  score numeric(7, 2),
  attendance_status public.assessment_attendance_status not null
    default 'PRESENT',
  teacher_remark text,
  row_version integer not null default 1 check (row_version > 0),
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  updated_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mark_sheet_component_enrollment_unique
    unique (mark_sheet_id, assessment_component_id, enrollment_id),
  constraint mark_score_non_negative check (score is null or score >= 0),
  constraint mark_attendance_score_consistent check (
    (attendance_status = 'PRESENT' and score is not null)
    or (attendance_status <> 'PRESENT' and score is null)
  )
);

create table public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid
    references public.academic_years(id) on delete restrict,
  grade_level_id uuid
    references public.grade_levels(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 150),
  version integer not null default 1 check (version > 0),
  is_active boolean not null default false,
  effective_from date not null,
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index grading_scale_scope_version_idx
  on public.grading_scales (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

create unique index grading_scale_one_active_scope_idx
  on public.grading_scales (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_active;

create table public.grading_bands (
  id uuid primary key default gen_random_uuid(),
  grading_scale_id uuid not null
    references public.grading_scales(id) on delete restrict,
  minimum_score numeric(5, 2) not null
    check (minimum_score >= 0 and minimum_score <= 100),
  maximum_score numeric(5, 2) not null
    check (maximum_score >= 0 and maximum_score <= 100),
  score_range numrange generated always as (
    numrange(
      minimum_score,
      maximum_score,
      case when maximum_score = 100 then '[]' else '[)' end
    )
  ) stored,
  grade text not null check (length(btrim(grade)) between 1 and 20),
  aggregate_points integer check (aggregate_points is null or aggregate_points > 0),
  description text,
  is_pass boolean not null default true,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grading_band_score_order_valid
    check (minimum_score < maximum_score),
  constraint grading_band_sort_unique
    unique (grading_scale_id, sort_order),
  constraint grading_band_ranges_do_not_overlap
    exclude using gist (
      grading_scale_id with =,
      score_range with &&
    )
);

create table public.ranking_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid
    references public.academic_years(id) on delete restrict,
  grade_level_id uuid
    references public.grade_levels(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 150),
  version integer not null default 1 check (version > 0),
  ranking_basis public.ranking_basis not null,
  tie_method public.ranking_tie_method not null,
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object'),
  is_active boolean not null default false,
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ranking_rule_scope_version_idx
  on public.ranking_rules (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

create unique index ranking_rule_one_active_scope_idx
  on public.ranking_rules (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_active;

create table public.promotion_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid
    references public.academic_years(id) on delete restrict,
  grade_level_id uuid
    references public.grade_levels(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 150),
  version integer not null default 1 check (version > 0),
  minimum_average numeric(5, 2)
    check (minimum_average is null or minimum_average between 0 and 100),
  maximum_aggregate integer
    check (maximum_aggregate is null or maximum_aggregate > 0),
  minimum_subjects_passed integer
    check (minimum_subjects_passed is null or minimum_subjects_passed >= 0),
  minimum_attendance_percentage numeric(5, 2)
    check (
      minimum_attendance_percentage is null
      or minimum_attendance_percentage between 0 and 100
    ),
  required_subject_rules jsonb not null default '{}'::jsonb
    check (jsonb_typeof(required_subject_rules) = 'object'),
  additional_rules jsonb not null default '{}'::jsonb
    check (jsonb_typeof(additional_rules) = 'object'),
  is_active boolean not null default false,
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index promotion_rule_scope_version_idx
  on public.promotion_rules (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

create unique index promotion_rule_one_active_scope_idx
  on public.promotion_rules (
    school_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_active;

create table public.term_attendance (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  enrollment_id uuid not null
    references public.enrollments(id) on delete restrict,
  days_open integer not null check (days_open >= 0),
  days_present integer not null default 0 check (days_present >= 0),
  days_absent integer not null default 0 check (days_absent >= 0),
  times_late integer not null default 0 check (times_late >= 0),
  recorded_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint term_attendance_term_enrollment_unique
    unique (term_id, enrollment_id),
  constraint term_attendance_days_valid
    check (days_present + days_absent <= days_open)
);

create table public.student_term_comments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  enrollment_id uuid not null
    references public.enrollments(id) on delete restrict,
  class_teacher_comment text,
  head_teacher_comment text,
  conduct_grade text,
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  updated_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_term_comment_unique unique (term_id, enrollment_id)
);

create or replace function internal.assessment_scheme_weight_total(
  target_scheme_id uuid
)
returns numeric
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(weight_percentage), 0)
  from public.assessment_components
  where assessment_scheme_id = target_scheme_id;
$$;

create or replace function internal.validate_assessment_scheme_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_school_id uuid;
  term_starts_on date;
  term_ends_on date;
  grade_school_id uuid;
  subject_school_id uuid;
  creator_school_id uuid;
begin
  select academic_years.school_id, terms.starts_on, terms.ends_on
    into term_school_id, term_starts_on, term_ends_on
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  select school_id into grade_school_id
  from public.grade_levels where id = new.grade_level_id;

  select school_id into subject_school_id
  from public.subjects where id = new.subject_id;

  if new.created_by is not null then
    select school_id into creator_school_id
    from public.school_staff_memberships where id = new.created_by;
  end if;

  if grade_school_id is distinct from term_school_id
     or subject_school_id is distinct from term_school_id
     or (
       new.created_by is not null
       and creator_school_id is distinct from term_school_id
     ) then
    raise exception 'Assessment scheme references must belong to the same school.'
      using errcode = '23514';
  end if;

  if new.effective_from < term_starts_on or new.effective_from > term_ends_on then
    raise exception 'Assessment scheme effective date must fall within the term.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_assessment_scheme_activation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  component_count integer;
  weight_total numeric;
begin
  if new.status = 'ACTIVE'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select count(*), internal.assessment_scheme_weight_total(new.id)
      into component_count, weight_total
    from public.assessment_components
    where assessment_scheme_id = new.id;

    if component_count = 0 or weight_total <> 100 then
      raise exception 'An active assessment scheme must have components totalling exactly 100 percent.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function internal.protect_non_draft_assessment_components()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  target_scheme_id uuid;
  target_status public.assessment_scheme_status;
begin
  target_scheme_id = case when tg_op = 'DELETE'
    then old.assessment_scheme_id else new.assessment_scheme_id end;

  select status into target_status
  from public.assessment_schemes where id = target_scheme_id;

  if target_status <> 'DRAFT' then
    raise exception 'Components of active or retired assessment schemes are immutable.'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

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
  assignment_term_id uuid;
  assignment_section_id uuid;
  assignment_subject_id uuid;
begin
  select academic_year_id into term_year_id
  from public.terms where id = new.term_id;

  select academic_year_id, grade_level_id
    into section_year_id, section_grade_id
  from public.class_sections where id = new.class_section_id;

  select term_id, grade_level_id, subject_id
    into scheme_term_id, scheme_grade_id, scheme_subject_id
  from public.assessment_schemes where id = new.assessment_scheme_id;

  select term_id, class_section_id, subject_id
    into assignment_term_id, assignment_section_id, assignment_subject_id
  from public.teaching_assignments where id = new.teaching_assignment_id;

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

create or replace function internal.validate_mark_scope_and_score()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  sheet_scheme_id uuid;
  sheet_class_id uuid;
  sheet_term_id uuid;
  component_scheme_id uuid;
  component_maximum numeric;
  enrollment_class_id uuid;
  enrollment_year_id uuid;
  term_year_id uuid;
begin
  select assessment_scheme_id, class_section_id, term_id
    into sheet_scheme_id, sheet_class_id, sheet_term_id
  from public.mark_sheets where id = new.mark_sheet_id;

  select assessment_scheme_id, maximum_score
    into component_scheme_id, component_maximum
  from public.assessment_components where id = new.assessment_component_id;

  select class_section_id, academic_year_id
    into enrollment_class_id, enrollment_year_id
  from public.enrollments where id = new.enrollment_id;

  select academic_year_id into term_year_id
  from public.terms where id = sheet_term_id;

  if component_scheme_id is distinct from sheet_scheme_id then
    raise exception 'Assessment component does not belong to the mark sheet scheme.'
      using errcode = '23514';
  end if;

  if enrollment_class_id is distinct from sheet_class_id
     or enrollment_year_id is distinct from term_year_id then
    raise exception 'Enrollment does not belong to the mark sheet class and academic year.'
      using errcode = '23514';
  end if;

  if new.score is not null and new.score > component_maximum then
    raise exception 'Score cannot exceed the assessment component maximum.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.increment_mark_row_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.row_version = old.row_version + 1;
  return new;
end;
$$;

create or replace function internal.validate_rule_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  year_school_id uuid;
  grade_school_id uuid;
  creator_school_id uuid;
begin
  if new.academic_year_id is not null then
    select school_id into year_school_id
    from public.academic_years where id = new.academic_year_id;
  end if;

  if new.grade_level_id is not null then
    select school_id into grade_school_id
    from public.grade_levels where id = new.grade_level_id;
  end if;

  if new.created_by is not null then
    select school_id into creator_school_id
    from public.school_staff_memberships where id = new.created_by;
  end if;

  if (new.academic_year_id is not null and year_school_id is distinct from new.school_id)
     or (new.grade_level_id is not null and grade_school_id is distinct from new.school_id)
     or (new.created_by is not null and creator_school_id is distinct from new.school_id) then
    raise exception 'Rule scope references must belong to the selected school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_term_enrollment_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  enrollment_year_id uuid;
begin
  select academic_year_id into term_year_id
  from public.terms where id = new.term_id;

  select academic_year_id into enrollment_year_id
  from public.enrollments where id = new.enrollment_id;

  if enrollment_year_id is distinct from term_year_id then
    raise exception 'Term and enrollment must belong to the same academic year.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger assessment_schemes_validate_scope
before insert or update on public.assessment_schemes
for each row execute function internal.validate_assessment_scheme_scope();

create trigger assessment_schemes_validate_activation
before insert or update of status on public.assessment_schemes
for each row execute function internal.validate_assessment_scheme_activation();

create trigger assessment_components_protect_finalized_scheme
before insert or update or delete on public.assessment_components
for each row execute function internal.protect_non_draft_assessment_components();

create trigger mark_sheets_validate_scope
before insert or update on public.mark_sheets
for each row execute function internal.validate_mark_sheet_scope();

create trigger marks_validate_scope_and_score
before insert or update on public.marks
for each row execute function internal.validate_mark_scope_and_score();

create trigger marks_increment_row_version
before update on public.marks
for each row execute function internal.increment_mark_row_version();

create trigger grading_scales_validate_scope
before insert or update on public.grading_scales
for each row execute function internal.validate_rule_scope();

create trigger ranking_rules_validate_scope
before insert or update on public.ranking_rules
for each row execute function internal.validate_rule_scope();

create trigger promotion_rules_validate_scope
before insert or update on public.promotion_rules
for each row execute function internal.validate_rule_scope();

create trigger term_attendance_validate_scope
before insert or update on public.term_attendance
for each row execute function internal.validate_term_enrollment_scope();

create trigger student_term_comments_validate_scope
before insert or update on public.student_term_comments
for each row execute function internal.validate_term_enrollment_scope();

create trigger assessment_schemes_set_updated_at
before update on public.assessment_schemes
for each row execute function internal.set_updated_at();

create trigger assessment_components_set_updated_at
before update on public.assessment_components
for each row execute function internal.set_updated_at();

create trigger mark_sheets_set_updated_at
before update on public.mark_sheets
for each row execute function internal.set_updated_at();

create trigger marks_set_updated_at
before update on public.marks
for each row execute function internal.set_updated_at();

create trigger grading_scales_set_updated_at
before update on public.grading_scales
for each row execute function internal.set_updated_at();

create trigger grading_bands_set_updated_at
before update on public.grading_bands
for each row execute function internal.set_updated_at();

create trigger ranking_rules_set_updated_at
before update on public.ranking_rules
for each row execute function internal.set_updated_at();

create trigger promotion_rules_set_updated_at
before update on public.promotion_rules
for each row execute function internal.set_updated_at();

create trigger term_attendance_set_updated_at
before update on public.term_attendance
for each row execute function internal.set_updated_at();

create trigger student_term_comments_set_updated_at
before update on public.student_term_comments
for each row execute function internal.set_updated_at();

create index assessment_schemes_term_grade_subject_idx
  on public.assessment_schemes (term_id, grade_level_id, subject_id, status);

create index assessment_components_scheme_idx
  on public.assessment_components (assessment_scheme_id);

create index mark_sheets_term_class_subject_status_idx
  on public.mark_sheets (term_id, class_section_id, subject_id, workflow_status);

create index mark_sheets_teaching_assignment_idx
  on public.mark_sheets (teaching_assignment_id);

create index marks_sheet_enrollment_idx
  on public.marks (mark_sheet_id, enrollment_id);

create index marks_component_idx
  on public.marks (assessment_component_id);

create index grading_scales_school_scope_idx
  on public.grading_scales (school_id, academic_year_id, grade_level_id);

create index grading_bands_scale_idx
  on public.grading_bands (grading_scale_id);

create index ranking_rules_school_scope_idx
  on public.ranking_rules (school_id, academic_year_id, grade_level_id);

create index promotion_rules_school_scope_idx
  on public.promotion_rules (school_id, academic_year_id, grade_level_id);

create index term_attendance_enrollment_idx
  on public.term_attendance (enrollment_id);

create index student_term_comments_enrollment_idx
  on public.student_term_comments (enrollment_id);

revoke all on all functions in schema internal from public;
revoke all on all functions in schema internal from anon;
revoke all on all functions in schema internal from authenticated;
