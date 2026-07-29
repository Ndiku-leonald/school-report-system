create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 100),
  starts_on date not null,
  ends_on date not null,
  status public.academic_year_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_year_school_name_unique unique (school_id, name),
  constraint academic_year_dates_valid check (ends_on > starts_on)
);

create unique index academic_year_one_active_per_school_idx
  on public.academic_years (school_id)
  where status = 'ACTIVE';

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null
    references public.academic_years(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 100),
  term_number smallint not null check (term_number > 0),
  starts_on date not null,
  ends_on date not null,
  status public.term_status not null default 'DRAFT',
  is_promotion_term boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint term_number_per_academic_year_unique
    unique (academic_year_id, term_number),
  constraint term_name_per_academic_year_unique
    unique (academic_year_id, name),
  constraint term_dates_valid check (ends_on > starts_on)
);

create table public.grade_levels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  code text not null check (length(btrim(code)) between 1 and 50),
  name text not null check (length(btrim(name)) between 1 and 100),
  sort_order integer not null check (sort_order > 0),
  is_final_grade boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grade_level_school_code_unique unique (school_id, code)
);

create unique index grade_level_active_sort_order_idx
  on public.grade_levels (school_id, sort_order)
  where is_active;

create table public.class_sections (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null
    references public.academic_years(id) on delete restrict,
  grade_level_id uuid not null
    references public.grade_levels(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 100),
  class_code text not null check (length(btrim(class_code)) between 1 and 50),
  capacity integer check (capacity is null or capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_section_year_code_unique
    unique (academic_year_id, class_code),
  constraint class_section_grade_name_unique
    unique (academic_year_id, grade_level_id, name)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  code text not null check (length(btrim(code)) between 1 and 50),
  name text not null check (length(btrim(name)) between 1 and 150),
  description text,
  is_core boolean not null default false,
  contributes_to_aggregate boolean not null default true,
  sort_order integer not null check (sort_order > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subject_school_code_unique unique (school_id, code)
);

create table public.grade_level_subjects (
  id uuid primary key default gen_random_uuid(),
  grade_level_id uuid not null
    references public.grade_levels(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  is_required boolean not null default true,
  contributes_to_aggregate boolean not null default true,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grade_level_subject_pair_unique
    unique (grade_level_id, subject_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  admission_number text not null
    check (length(btrim(admission_number)) between 1 and 100),
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  middle_name text check (
    middle_name is null or length(btrim(middle_name)) between 1 and 100
  ),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  gender text check (
    gender is null or length(btrim(gender)) between 1 and 50
  ),
  date_of_birth date,
  admission_date date not null,
  photo_storage_path text,
  status public.student_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_school_admission_unique
    unique (school_id, admission_number),
  constraint student_lifecycle_dates_valid
    check (date_of_birth is null or admission_date >= date_of_birth)
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  middle_name text check (
    middle_name is null or length(btrim(middle_name)) between 1 and 100
  ),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  guardian_id uuid not null references public.guardians(id) on delete restrict,
  relationship text not null
    check (length(btrim(relationship)) between 1 and 100),
  is_primary boolean not null default false,
  can_access_reports boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_guardian_pair_unique unique (student_id, guardian_id)
);

create unique index student_one_primary_guardian_idx
  on public.student_guardians (student_id)
  where is_primary;

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  academic_year_id uuid not null
    references public.academic_years(id) on delete restrict,
  class_section_id uuid not null
    references public.class_sections(id) on delete restrict,
  class_number text,
  status public.enrollment_status not null default 'ACTIVE',
  enrolled_on date not null,
  exited_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollment_dates_valid
    check (exited_on is null or exited_on >= enrolled_on)
);

create unique index enrollment_one_active_per_year_idx
  on public.enrollments (student_id, academic_year_id)
  where status in ('ACTIVE', 'REPEATING');

create table public.teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  class_section_id uuid not null
    references public.class_sections(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  staff_membership_id uuid not null
    references public.school_staff_memberships(id) on delete restrict,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teaching_assignment_dates_valid
    check (ends_on is null or ends_on >= starts_on)
);

create unique index teaching_assignment_active_duplicate_idx
  on public.teaching_assignments (
    term_id,
    class_section_id,
    subject_id,
    staff_membership_id
  )
  where is_active;

create table public.class_teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  class_section_id uuid not null
    references public.class_sections(id) on delete restrict,
  staff_membership_id uuid not null
    references public.school_staff_memberships(id) on delete restrict,
  is_primary boolean not null default true,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_teacher_assignment_dates_valid
    check (ends_on is null or ends_on >= starts_on)
);

create unique index class_teacher_one_active_primary_idx
  on public.class_teacher_assignments (term_id, class_section_id)
  where is_active and is_primary;

create unique index class_teacher_active_duplicate_idx
  on public.class_teacher_assignments (
    term_id,
    class_section_id,
    staff_membership_id
  )
  where is_active;

create or replace function internal.validate_term_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  year_starts_on date;
  year_ends_on date;
begin
  select academic_years.starts_on, academic_years.ends_on
    into year_starts_on, year_ends_on
  from public.academic_years
  where academic_years.id = new.academic_year_id;

  if year_starts_on is null then
    raise exception 'The selected academic year does not exist.'
      using errcode = '23503';
  end if;

  if new.starts_on < year_starts_on or new.ends_on > year_ends_on then
    raise exception 'Term dates must fall within the selected academic year.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_class_section_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  year_school_id uuid;
  grade_school_id uuid;
begin
  select school_id into year_school_id
  from public.academic_years
  where id = new.academic_year_id;

  select school_id into grade_school_id
  from public.grade_levels
  where id = new.grade_level_id;

  if year_school_id is distinct from grade_school_id then
    raise exception 'Class section grade level and academic year must belong to the same school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_grade_level_subject_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  grade_school_id uuid;
  subject_school_id uuid;
begin
  select school_id into grade_school_id
  from public.grade_levels where id = new.grade_level_id;

  select school_id into subject_school_id
  from public.subjects where id = new.subject_id;

  if grade_school_id is distinct from subject_school_id then
    raise exception 'Grade level and subject must belong to the same school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_student_guardian_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  student_school_id uuid;
  guardian_school_id uuid;
begin
  select school_id into student_school_id
  from public.students where id = new.student_id;

  select school_id into guardian_school_id
  from public.guardians where id = new.guardian_id;

  if student_school_id is distinct from guardian_school_id then
    raise exception 'Student and guardian must belong to the same school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_enrollment_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  student_school_id uuid;
  year_school_id uuid;
  section_year_id uuid;
begin
  select school_id into student_school_id
  from public.students where id = new.student_id;

  select school_id into year_school_id
  from public.academic_years where id = new.academic_year_id;

  select academic_year_id into section_year_id
  from public.class_sections where id = new.class_section_id;

  if student_school_id is distinct from year_school_id
     or section_year_id is distinct from new.academic_year_id then
    raise exception 'Student, academic year, and class section must share one school and academic year.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_teaching_assignment_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  term_school_id uuid;
  term_starts_on date;
  term_ends_on date;
  section_year_id uuid;
  subject_school_id uuid;
  membership_school_id uuid;
begin
  select terms.academic_year_id, academic_years.school_id,
         terms.starts_on, terms.ends_on
    into term_year_id, term_school_id, term_starts_on, term_ends_on
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  select academic_year_id into section_year_id
  from public.class_sections where id = new.class_section_id;

  select school_id into subject_school_id
  from public.subjects where id = new.subject_id;

  select school_id into membership_school_id
  from public.school_staff_memberships
  where id = new.staff_membership_id;

  if section_year_id is distinct from term_year_id
     or subject_school_id is distinct from term_school_id
     or membership_school_id is distinct from term_school_id then
    raise exception 'Teaching assignment references must share one school and academic scope.'
      using errcode = '23514';
  end if;

  if new.starts_on < term_starts_on
     or (new.ends_on is not null and new.ends_on > term_ends_on) then
    raise exception 'Teaching assignment dates must fall within the selected term.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_class_teacher_assignment_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  term_school_id uuid;
  term_starts_on date;
  term_ends_on date;
  section_year_id uuid;
  membership_school_id uuid;
begin
  select terms.academic_year_id, academic_years.school_id,
         terms.starts_on, terms.ends_on
    into term_year_id, term_school_id, term_starts_on, term_ends_on
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  select academic_year_id into section_year_id
  from public.class_sections where id = new.class_section_id;

  select school_id into membership_school_id
  from public.school_staff_memberships
  where id = new.staff_membership_id;

  if section_year_id is distinct from term_year_id
     or membership_school_id is distinct from term_school_id then
    raise exception 'Class teacher assignment references must share one school and academic scope.'
      using errcode = '23514';
  end if;

  if new.starts_on < term_starts_on
     or (new.ends_on is not null and new.ends_on > term_ends_on) then
    raise exception 'Class teacher assignment dates must fall within the selected term.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger terms_validate_scope
before insert or update on public.terms
for each row execute function internal.validate_term_scope();

create trigger class_sections_validate_scope
before insert or update on public.class_sections
for each row execute function internal.validate_class_section_scope();

create trigger grade_level_subjects_validate_scope
before insert or update on public.grade_level_subjects
for each row execute function internal.validate_grade_level_subject_scope();

create trigger student_guardians_validate_scope
before insert or update on public.student_guardians
for each row execute function internal.validate_student_guardian_scope();

create trigger enrollments_validate_scope
before insert or update on public.enrollments
for each row execute function internal.validate_enrollment_scope();

create trigger teaching_assignments_validate_scope
before insert or update on public.teaching_assignments
for each row execute function internal.validate_teaching_assignment_scope();

create trigger class_teacher_assignments_validate_scope
before insert or update on public.class_teacher_assignments
for each row execute function internal.validate_class_teacher_assignment_scope();

create trigger academic_years_set_updated_at
before update on public.academic_years
for each row execute function internal.set_updated_at();

create trigger terms_set_updated_at
before update on public.terms
for each row execute function internal.set_updated_at();

create trigger grade_levels_set_updated_at
before update on public.grade_levels
for each row execute function internal.set_updated_at();

create trigger class_sections_set_updated_at
before update on public.class_sections
for each row execute function internal.set_updated_at();

create trigger subjects_set_updated_at
before update on public.subjects
for each row execute function internal.set_updated_at();

create trigger grade_level_subjects_set_updated_at
before update on public.grade_level_subjects
for each row execute function internal.set_updated_at();

create trigger students_set_updated_at
before update on public.students
for each row execute function internal.set_updated_at();

create trigger guardians_set_updated_at
before update on public.guardians
for each row execute function internal.set_updated_at();

create trigger student_guardians_set_updated_at
before update on public.student_guardians
for each row execute function internal.set_updated_at();

create trigger enrollments_set_updated_at
before update on public.enrollments
for each row execute function internal.set_updated_at();

create trigger teaching_assignments_set_updated_at
before update on public.teaching_assignments
for each row execute function internal.set_updated_at();

create trigger class_teacher_assignments_set_updated_at
before update on public.class_teacher_assignments
for each row execute function internal.set_updated_at();

create index academic_years_school_status_idx
  on public.academic_years (school_id, status);

create index terms_academic_year_status_idx
  on public.terms (academic_year_id, status);

create index grade_levels_school_active_idx
  on public.grade_levels (school_id, is_active);

create index class_sections_year_grade_idx
  on public.class_sections (academic_year_id, grade_level_id);

create index subjects_school_active_idx
  on public.subjects (school_id, is_active);

create index grade_level_subjects_subject_idx
  on public.grade_level_subjects (subject_id);

create index students_school_status_idx
  on public.students (school_id, status);

create index guardians_school_active_idx
  on public.guardians (school_id, is_active);

create index student_guardians_guardian_idx
  on public.student_guardians (guardian_id);

create index enrollments_year_class_status_idx
  on public.enrollments (academic_year_id, class_section_id, status);

create index enrollments_student_idx
  on public.enrollments (student_id);

create index teaching_assignments_term_class_subject_idx
  on public.teaching_assignments (term_id, class_section_id, subject_id);

create index teaching_assignments_staff_idx
  on public.teaching_assignments (staff_membership_id);

create index class_teacher_assignments_term_class_idx
  on public.class_teacher_assignments (term_id, class_section_id);

create index class_teacher_assignments_staff_idx
  on public.class_teacher_assignments (staff_membership_id);

revoke all on all functions in schema internal from public;
revoke all on all functions in schema internal from anon;
revoke all on all functions in schema internal from authenticated;
