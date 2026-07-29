create or replace function internal.membership_belongs_to_school(
  target_membership_id uuid,
  target_school_id uuid
)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_staff_memberships
    where id = target_membership_id
      and school_id = target_school_id
  );
$$;

create or replace function internal.validate_staff_role_grant_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  receiving_school_id uuid;
begin
  select school_id into receiving_school_id
  from public.school_staff_memberships
  where id = new.membership_id;

  if new.granted_by is not null
     and not internal.membership_belongs_to_school(
       new.granted_by,
       receiving_school_id
     ) then
    raise exception 'Role grantor and receiving membership must belong to the same school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_mark_sheet_actor_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  sheet_school_id uuid;
  assigned_membership_id uuid;
begin
  select academic_years.school_id, teaching_assignments.staff_membership_id
    into sheet_school_id, assigned_membership_id
  from public.terms
  join public.academic_years
    on academic_years.id = terms.academic_year_id
  join public.teaching_assignments
    on teaching_assignments.id = new.teaching_assignment_id
  where terms.id = new.term_id;

  if new.submitted_by is not null
     and new.submitted_by is distinct from assigned_membership_id then
    raise exception 'Mark sheet submitter must match the teaching assignment membership.'
      using errcode = '23514';
  end if;

  if (new.submitted_by is not null
      and not internal.membership_belongs_to_school(
        new.submitted_by,
        sheet_school_id
      ))
     or (new.reviewed_by is not null
      and not internal.membership_belongs_to_school(
        new.reviewed_by,
        sheet_school_id
      ))
     or (new.approved_by is not null
      and not internal.membership_belongs_to_school(
        new.approved_by,
        sheet_school_id
      ))
     or (new.locked_by is not null
      and not internal.membership_belongs_to_school(
        new.locked_by,
        sheet_school_id
      ))
     or (new.returned_by is not null
      and not internal.membership_belongs_to_school(
        new.returned_by,
        sheet_school_id
      )) then
    raise exception 'Mark sheet actors must belong to the mark sheet school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_mark_actor_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  sheet_school_id uuid;
begin
  select academic_years.school_id into sheet_school_id
  from public.mark_sheets
  join public.terms on terms.id = mark_sheets.term_id
  join public.academic_years
    on academic_years.id = terms.academic_year_id
  where mark_sheets.id = new.mark_sheet_id;

  if (new.created_by is not null
      and not internal.membership_belongs_to_school(
        new.created_by,
        sheet_school_id
      ))
     or (new.updated_by is not null
      and not internal.membership_belongs_to_school(
        new.updated_by,
        sheet_school_id
      )) then
    raise exception 'Mark actors must belong to the mark sheet school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_attendance_actor_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_school_id uuid;
begin
  select academic_years.school_id into term_school_id
  from public.terms
  join public.academic_years
    on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  if new.recorded_by is not null
     and not internal.membership_belongs_to_school(
       new.recorded_by,
       term_school_id
     ) then
    raise exception 'Attendance recorder must belong to the attendance school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_student_comment_actor_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_school_id uuid;
begin
  select academic_years.school_id into term_school_id
  from public.terms
  join public.academic_years
    on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  if (new.created_by is not null
      and not internal.membership_belongs_to_school(
        new.created_by,
        term_school_id
      ))
     or (new.updated_by is not null
      and not internal.membership_belongs_to_school(
        new.updated_by,
        term_school_id
      )) then
    raise exception 'Student comment actors must belong to the comment school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_report_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  term_school_id uuid;
  enrollment_year_id uuid;
  enrollment_class_id uuid;
  batch_term_id uuid;
  batch_class_id uuid;
  template_school_id uuid;
  superseded_term_id uuid;
  superseded_enrollment_id uuid;
begin
  select terms.academic_year_id, academic_years.school_id
    into term_year_id, term_school_id
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  select academic_year_id, class_section_id
    into enrollment_year_id, enrollment_class_id
  from public.enrollments
  where id = new.enrollment_id;

  select term_id, class_section_id
    into batch_term_id, batch_class_id
  from public.report_batches
  where id = new.batch_id;

  select school_id into template_school_id
  from public.report_templates
  where id = new.template_id;

  if new.superseded_by is not null then
    select term_id, enrollment_id
      into superseded_term_id, superseded_enrollment_id
    from public.reports
    where id = new.superseded_by;
  end if;

  if enrollment_year_id is distinct from term_year_id
     or batch_term_id is distinct from new.term_id
     or (
       batch_class_id is not null
       and batch_class_id is distinct from enrollment_class_id
     )
     or template_school_id is distinct from term_school_id
     or (
       new.superseded_by is not null
       and (
         superseded_term_id is distinct from new.term_id
         or superseded_enrollment_id is distinct from new.enrollment_id
       )
     ) then
    raise exception 'Report references must share one student, school, and academic scope.'
      using errcode = '23514';
  end if;

  if (new.created_by is not null
      and not internal.membership_belongs_to_school(
        new.created_by,
        term_school_id
      ))
     or (new.reviewed_by is not null
      and not internal.membership_belongs_to_school(
        new.reviewed_by,
        term_school_id
      ))
     or (new.published_by is not null
      and not internal.membership_belongs_to_school(
        new.published_by,
        term_school_id
      ))
     or (new.withdrawn_by is not null
      and not internal.membership_belongs_to_school(
        new.withdrawn_by,
        term_school_id
      )) then
    raise exception 'Report actors must belong to the report school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_audit_actor_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  membership_school_id uuid;
  membership_profile_id uuid;
  profile_has_school_membership boolean;
begin
  if new.actor_membership_id is not null then
    select school_id, profile_id
      into membership_school_id, membership_profile_id
    from public.school_staff_memberships
    where id = new.actor_membership_id;

    if membership_school_id is distinct from new.school_id
       or (
         new.actor_profile_id is not null
         and membership_profile_id is distinct from new.actor_profile_id
       ) then
      raise exception 'Audit actor membership must match the event school and profile.'
        using errcode = '23514';
    end if;
  elsif new.actor_profile_id is not null then
    select exists (
      select 1
      from public.school_staff_memberships
      where profile_id = new.actor_profile_id
        and school_id = new.school_id
    ) into profile_has_school_membership;

    if not profile_has_school_membership then
      raise exception 'Audit actor profile must have a membership in the event school.'
        using errcode = '23514';
    end if;
  end if;

  -- Both actor columns being null explicitly represents a system-generated event.
  return new;
end;
$$;

create trigger staff_role_assignments_validate_grant_scope
before insert or update on public.staff_role_assignments
for each row execute function internal.validate_staff_role_grant_scope();

create trigger mark_sheets_validate_actor_scope
before insert or update on public.mark_sheets
for each row execute function internal.validate_mark_sheet_actor_scope();

create trigger marks_validate_actor_scope
before insert or update on public.marks
for each row execute function internal.validate_mark_actor_scope();

create trigger term_attendance_validate_actor_scope
before insert or update on public.term_attendance
for each row execute function internal.validate_attendance_actor_scope();

create trigger student_term_comments_validate_actor_scope
before insert or update on public.student_term_comments
for each row execute function internal.validate_student_comment_actor_scope();

revoke all on all functions in schema internal from public;
revoke all on all functions in schema internal from anon;
revoke all on all functions in schema internal from authenticated;
