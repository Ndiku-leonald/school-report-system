-- Preserve mark-sheet workflow continuity after an assessment scheme retires.
-- ACTIVE remains mandatory for new or changed scheme references, while every
-- update continues to validate the complete academic scope.

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

  if (
    tg_op = 'INSERT'
    or old.assessment_scheme_id is distinct from new.assessment_scheme_id
  ) and scheme_status is distinct from 'ACTIVE' then
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

revoke execute on function internal.validate_mark_sheet_scope()
  from public, anon, authenticated;
