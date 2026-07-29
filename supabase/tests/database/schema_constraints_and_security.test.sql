begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.has_table('public', 'schools', 'schools table exists');
select extensions.has_table('public', 'school_settings', 'school_settings table exists');
select extensions.has_table('public', 'profiles', 'profiles table exists');
select extensions.has_table('public', 'school_staff_memberships', 'school_staff_memberships table exists');
select extensions.has_table('public', 'staff_role_assignments', 'staff_role_assignments table exists');
select extensions.has_table('public', 'academic_years', 'academic_years table exists');
select extensions.has_table('public', 'terms', 'terms table exists');
select extensions.has_table('public', 'grade_levels', 'grade_levels table exists');
select extensions.has_table('public', 'class_sections', 'class_sections table exists');
select extensions.has_table('public', 'subjects', 'subjects table exists');
select extensions.has_table('public', 'grade_level_subjects', 'grade_level_subjects table exists');
select extensions.has_table('public', 'students', 'students table exists');
select extensions.has_table('public', 'guardians', 'guardians table exists');
select extensions.has_table('public', 'student_guardians', 'student_guardians table exists');
select extensions.has_table('public', 'enrollments', 'enrollments table exists');
select extensions.has_table('public', 'teaching_assignments', 'teaching_assignments table exists');
select extensions.has_table('public', 'class_teacher_assignments', 'class_teacher_assignments table exists');
select extensions.has_table('public', 'assessment_schemes', 'assessment_schemes table exists');
select extensions.has_table('public', 'assessment_components', 'assessment_components table exists');
select extensions.has_table('public', 'mark_sheets', 'mark_sheets table exists');
select extensions.has_table('public', 'marks', 'marks table exists');
select extensions.has_table('public', 'grading_scales', 'grading_scales table exists');
select extensions.has_table('public', 'grading_bands', 'grading_bands table exists');
select extensions.has_table('public', 'ranking_rules', 'ranking_rules table exists');
select extensions.has_table('public', 'promotion_rules', 'promotion_rules table exists');
select extensions.has_table('public', 'term_attendance', 'term_attendance table exists');
select extensions.has_table('public', 'student_term_comments', 'student_term_comments table exists');
select extensions.has_table('public', 'report_templates', 'report_templates table exists');
select extensions.has_table('public', 'report_batches', 'report_batches table exists');
select extensions.has_table('public', 'reports', 'reports table exists');
select extensions.has_table('public', 'report_snapshots', 'report_snapshots table exists');
select extensions.has_table('public', 'report_subject_results', 'report_subject_results table exists');
select extensions.has_table('public', 'promotion_decisions', 'promotion_decisions table exists');
select extensions.has_table('public', 'student_access_credentials', 'student_access_credentials table exists');
select extensions.has_table('public', 'parent_access_sessions', 'parent_access_sessions table exists');
select extensions.has_table('public', 'audit_logs', 'audit_logs table exists');

select extensions.throws_ok(
  $$
    insert into public.academic_years (
      school_id, name, starts_on, ends_on
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      'Invalid dates',
      '2027-12-31',
      '2027-01-01'
    )
  $$,
  '23514'
);

select extensions.throws_ok(
  $$
    insert into public.academic_years (
      school_id, name, starts_on, ends_on, status
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      'Second active year',
      '2027-01-01',
      '2027-12-31',
      'ACTIVE'
    )
  $$,
  '23505'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '70000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'synthetic.teacher@example.invalid',
  extensions.crypt('local-test-only', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, first_name, last_name)
values (
  '70000000-0000-4000-8000-000000000001',
  'Synthetic',
  'Teacher'
);

insert into public.school_staff_memberships (
  id,
  school_id,
  profile_id,
  employee_number,
  status,
  joined_at
)
values (
  '71000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'TEST-EMP-001',
  'ACTIVE',
  '2026-02-02'
);

insert into public.staff_role_assignments (
  membership_id,
  role
)
values (
  '71000000-0000-4000-8000-000000000001',
  'SUBJECT_TEACHER'
);

select extensions.throws_ok(
  $$
    insert into public.staff_role_assignments (membership_id, role)
    values (
      '71000000-0000-4000-8000-000000000001',
      'SUBJECT_TEACHER'
    )
  $$,
  '23505'
);

insert into public.class_sections (
  id,
  academic_year_id,
  grade_level_id,
  name,
  class_code
)
values
  (
    '72000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Synthetic A',
    'TEST-P1-A'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Synthetic B',
    'TEST-P1-B'
  );

insert into public.students (
  id,
  school_id,
  admission_number,
  first_name,
  last_name,
  admission_date
)
values
  (
    '73000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'SYNTH-001',
    'Synthetic',
    'Learner One',
    '2026-02-02'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'SYNTH-002',
    'Synthetic',
    'Learner Two',
    '2026-02-02'
  );

select extensions.throws_ok(
  $$
    insert into public.students (
      school_id,
      admission_number,
      first_name,
      last_name,
      admission_date
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      'SYNTH-001',
      'Duplicate',
      'Synthetic Learner',
      '2026-02-02'
    )
  $$,
  '23505'
);

insert into public.enrollments (
  id,
  student_id,
  academic_year_id,
  class_section_id,
  enrolled_on
)
values
  (
    '74000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '2026-02-02'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    '2026-02-02'
  );

insert into public.teaching_assignments (
  id,
  term_id,
  class_section_id,
  subject_id,
  staff_membership_id,
  starts_on
)
values (
  '75000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '2026-02-02'
);

select extensions.throws_ok(
  $$
    insert into public.teaching_assignments (
      term_id,
      class_section_id,
      subject_id,
      staff_membership_id,
      starts_on
    )
    values (
      '21000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      '2026-02-02'
    )
  $$,
  '23505'
);

insert into public.assessment_schemes (
  id,
  term_id,
  grade_level_id,
  subject_id,
  name,
  version,
  effective_from
)
values
  (
    '76000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    'Invalid component fixture',
    1,
    '2026-02-02'
  ),
  (
    '76000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003',
    'Invalid total fixture',
    1,
    '2026-02-02'
  );

select extensions.throws_ok(
  $$
    insert into public.assessment_components (
      assessment_scheme_id,
      name,
      component_code,
      maximum_score,
      weight_percentage,
      sort_order
    )
    values (
      '76000000-0000-4000-8000-000000000001',
      'Invalid maximum',
      'INVALID-MAX',
      0,
      50,
      1
    )
  $$,
  '23514'
);

select extensions.throws_ok(
  $$
    insert into public.assessment_components (
      assessment_scheme_id,
      name,
      component_code,
      maximum_score,
      weight_percentage,
      sort_order
    )
    values (
      '76000000-0000-4000-8000-000000000001',
      'Invalid weight',
      'INVALID-WEIGHT',
      100,
      101,
      1
    )
  $$,
  '23514'
);

insert into public.assessment_components (
  assessment_scheme_id,
  name,
  component_code,
  maximum_score,
  weight_percentage,
  sort_order
)
values (
  '76000000-0000-4000-8000-000000000002',
  'Incomplete total',
  'INCOMPLETE',
  100,
  80,
  1
);

select extensions.throws_ok(
  $$
    update public.assessment_schemes
    set status = 'ACTIVE'
    where id = '76000000-0000-4000-8000-000000000002'
  $$,
  '23514'
);

insert into public.mark_sheets (
  id,
  term_id,
  class_section_id,
  subject_id,
  assessment_scheme_id,
  teaching_assignment_id
)
values (
  '77000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001'
);

select extensions.throws_ok(
  $$
    insert into public.marks (
      mark_sheet_id,
      assessment_component_id,
      enrollment_id,
      score
    )
    values (
      '77000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      -1
    )
  $$,
  '23514'
);

select extensions.throws_ok(
  $$
    insert into public.marks (
      mark_sheet_id,
      assessment_component_id,
      enrollment_id,
      score
    )
    values (
      '77000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      101
    )
  $$,
  '23514'
);

select extensions.throws_ok(
  $$
    insert into public.marks (
      mark_sheet_id,
      assessment_component_id,
      enrollment_id,
      score
    )
    values (
      '77000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000002',
      50
    )
  $$,
  '23514'
);

select extensions.throws_ok(
  $$
    insert into public.grading_bands (
      grading_scale_id,
      minimum_score,
      maximum_score,
      grade,
      sort_order
    )
    values (
      '60000000-0000-4000-8000-000000000001',
      75,
      85,
      'OVERLAP',
      99
    )
  $$,
  '23P01'
);

insert into public.student_access_credentials (
  student_id,
  access_code_lookup_hash,
  pin_hash
)
values (
  '73000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  repeat('b', 64)
);

select extensions.throws_ok(
  $$
    insert into public.student_access_credentials (
      student_id,
      access_code_lookup_hash,
      pin_hash
    )
    values (
      '73000000-0000-4000-8000-000000000001',
      repeat('c', 64),
      repeat('d', 64)
    )
  $$,
  '23505'
);

select extensions.hasnt_column(
  'public',
  'student_access_credentials',
  'pin',
  'student credentials have no plaintext PIN column'
);
select extensions.hasnt_column(
  'public',
  'students',
  'parent_pin',
  'students have no plaintext parent PIN column'
);

insert into public.report_templates (
  id,
  school_id,
  name,
  version
)
values (
  '78000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic Test Template',
  1
);

insert into public.report_batches (
  id,
  term_id,
  class_section_id,
  total_reports
)
values (
  '79000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  1
);

insert into public.reports (
  id,
  batch_id,
  term_id,
  enrollment_id,
  template_id,
  version
)
values (
  '80000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001',
  1
);

select extensions.throws_ok(
  $$
    insert into public.reports (
      batch_id,
      term_id,
      enrollment_id,
      template_id,
      version
    )
    values (
      '79000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '78000000-0000-4000-8000-000000000001',
      0
    )
  $$,
  '23514'
);

select extensions.throws_ok(
  $$
    insert into public.reports (
      batch_id,
      term_id,
      enrollment_id,
      template_id,
      version
    )
    values (
      '79000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000001',
      '78000000-0000-4000-8000-000000000001',
      1
    )
  $$,
  '23505'
);

insert into public.report_snapshots (
  id,
  report_id,
  snapshot_version,
  snapshot_data,
  source_checksum
)
values (
  '81000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  1,
  '{"synthetic":true}'::jsonb,
  'synthetic-checksum'
);

select extensions.throws_ok(
  $$
    update public.report_snapshots
    set snapshot_data = '{"changed":true}'::jsonb
    where id = '81000000-0000-4000-8000-000000000001'
  $$,
  '55000'
);

select extensions.throws_ok(
  $$
    delete from public.report_snapshots
    where id = '81000000-0000-4000-8000-000000000001'
  $$,
  '55000'
);

select extensions.throws_ok(
  $$
    insert into public.promotion_decisions (
      term_id,
      enrollment_id,
      system_recommendation,
      was_overridden
    )
    values (
      '21000000-0000-4000-8000-000000000003',
      '74000000-0000-4000-8000-000000000001',
      'PROMOTED',
      true
    )
  $$,
  '23514'
);

insert into public.audit_logs (
  id,
  school_id,
  action,
  entity_type,
  entity_id
)
values (
  '82000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'SYNTHETIC_TEST',
  'test_fixture',
  '73000000-0000-4000-8000-000000000001'
);

select extensions.throws_ok(
  $$
    update public.audit_logs
    set action = 'CHANGED'
    where id = '82000000-0000-4000-8000-000000000001'
  $$,
  '55000'
);

select extensions.throws_ok(
  $$
    delete from public.audit_logs
    where id = '82000000-0000-4000-8000-000000000001'
  $$,
  '55000'
);

set local role anon;
select extensions.throws_ok(
  $$ select * from public.schools $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.students $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.marks $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.reports $$,
  '42501'
);
select extensions.throws_ok(
  $$
    insert into public.schools (name, slug, school_code)
    values ('Denied', 'denied', 'DENIED')
  $$,
  '42501'
);
select extensions.throws_ok(
  $$ update public.schools set name = 'Denied' $$,
  '42501'
);
reset role;

set local role authenticated;
select extensions.throws_ok(
  $$ select * from public.students $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.reports $$,
  '42501'
);
reset role;

select * from extensions.finish();
rollback;
