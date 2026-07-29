-- Stage 3 deliberately exposes no client-side data access. Later stages must add
-- narrowly scoped policies and grants only after authentication roles are defined.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'schools',
    'school_settings',
    'profiles',
    'school_staff_memberships',
    'staff_role_assignments',
    'academic_years',
    'terms',
    'grade_levels',
    'class_sections',
    'subjects',
    'grade_level_subjects',
    'students',
    'guardians',
    'student_guardians',
    'enrollments',
    'teaching_assignments',
    'class_teacher_assignments',
    'assessment_schemes',
    'assessment_components',
    'mark_sheets',
    'marks',
    'grading_scales',
    'grading_bands',
    'ranking_rules',
    'promotion_rules',
    'term_attendance',
    'student_term_comments',
    'report_templates',
    'report_batches',
    'reports',
    'report_snapshots',
    'report_subject_results',
    'promotion_decisions',
    'student_access_credentials',
    'parent_access_sessions',
    'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      table_name
    );
  end loop;
end
$$;

revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;
revoke all privileges on all functions in schema internal from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from anon, authenticated;
alter default privileges for role postgres in schema internal
  revoke all privileges on functions from anon, authenticated;
