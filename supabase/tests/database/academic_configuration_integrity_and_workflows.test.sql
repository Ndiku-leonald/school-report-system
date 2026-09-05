begin;

select extensions.no_plan();

insert into public.schools (id, name, slug, school_code)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'Synthetic Workflow School',
    'synthetic-workflow-school',
    'CFG-WORK'
  ),
  (
    'e1000000-0000-4000-8000-000000000099',
    'Synthetic Other Workflow School',
    'synthetic-other-workflow-school',
    'CFG-OTHER'
  );

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'configuration.manager@example.invalid',
    extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'configuration.viewer@example.invalid',
    extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (id, first_name, last_name)
values
  ('e2000000-0000-4000-8000-000000000001', 'Synthetic', 'Manager'),
  ('e2000000-0000-4000-8000-000000000002', 'Synthetic', 'Viewer');

insert into public.school_staff_memberships (
  id, school_id, profile_id, employee_number, status
)
values
  (
    'e3000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    'CFG-MANAGER',
    'ACTIVE'
  ),
  (
    'e3000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000002',
    'CFG-VIEWER',
    'ACTIVE'
  );

insert into public.staff_role_assignments (membership_id, role)
values
  ('e3000000-0000-4000-8000-000000000001', 'ACADEMIC_REGISTRAR'),
  ('e3000000-0000-4000-8000-000000000002', 'HEAD_TEACHER');

insert into public.academic_years (
  id, school_id, name, starts_on, ends_on, status
)
values
  (
    'e4000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'Synthetic 2035',
    '2035-01-01',
    '2035-12-31',
    'DRAFT'
  ),
  (
    'e4000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000001',
    'Synthetic 2036',
    '2036-01-01',
    '2036-12-31',
    'DRAFT'
  ),
  (
    'e4000000-0000-4000-8000-000000000099',
    'e1000000-0000-4000-8000-000000000099',
    'Synthetic Other 2035',
    '2035-01-01',
    '2035-12-31',
    'DRAFT'
  );

insert into public.terms (
  id, academic_year_id, name, term_number, starts_on, ends_on, status
)
values (
  'e4100000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'Synthetic Term One',
  1,
  '2035-01-01',
  '2035-06-30',
  'DRAFT'
);

insert into public.grade_levels (
  id, school_id, code, name, sort_order
)
values
  (
    'e4200000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'W1',
    'Workflow One',
    1
  ),
  (
    'e4200000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000001',
    'W2',
    'Workflow Two',
    2
  ),
  (
    'e4200000-0000-4000-8000-000000000099',
    'e1000000-0000-4000-8000-000000000099',
    'OX',
    'Other Workflow',
    1
  );

insert into public.subjects (
  id, school_id, code, name, sort_order
)
values
  (
    'e4300000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'WS1',
    'Workflow Subject One',
    1
  ),
  (
    'e4300000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000001',
    'WS2',
    'Workflow Subject Two',
    2
  ),
  (
    'e4300000-0000-4000-8000-000000000099',
    'e1000000-0000-4000-8000-000000000099',
    'OS1',
    'Other Subject',
    1
  );

insert into public.class_sections (
  id, academic_year_id, grade_level_id, name, class_code, capacity
)
values
  (
    'e4400000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000001',
    'e4200000-0000-4000-8000-000000000001',
    'Unreferenced',
    'UNREF',
    30
  ),
  (
    'e4400000-0000-4000-8000-000000000002',
    'e4000000-0000-4000-8000-000000000001',
    'e4200000-0000-4000-8000-000000000001',
    'Enrolled',
    'ENROL',
    30
  ),
  (
    'e4400000-0000-4000-8000-000000000003',
    'e4000000-0000-4000-8000-000000000001',
    'e4200000-0000-4000-8000-000000000001',
    'Teaching',
    'TEACH',
    30
  ),
  (
    'e4400000-0000-4000-8000-000000000004',
    'e4000000-0000-4000-8000-000000000001',
    'e4200000-0000-4000-8000-000000000001',
    'Class Teacher',
    'CLASS',
    30
  ),
  (
    'e4400000-0000-4000-8000-000000000005',
    'e4000000-0000-4000-8000-000000000001',
    'e4200000-0000-4000-8000-000000000001',
    'Mark Sheet',
    'MARK',
    30
  );

insert into public.students (
  id, school_id, admission_number, first_name, last_name, admission_date
)
values (
  'e4500000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'CFG-WORK-001',
  'Synthetic',
  'Learner',
  '2035-01-01'
);

insert into public.enrollments (
  id, student_id, academic_year_id, class_section_id, enrolled_on
)
values (
  'e4600000-0000-4000-8000-000000000001',
  'e4500000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e4400000-0000-4000-8000-000000000002',
  '2035-01-01'
);

insert into public.teaching_assignments (
  id, term_id, class_section_id, subject_id, staff_membership_id, starts_on
)
values
  (
    'e4700000-0000-4000-8000-000000000001',
    'e4100000-0000-4000-8000-000000000001',
    'e4400000-0000-4000-8000-000000000003',
    'e4300000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    '2035-01-01'
  ),
  (
    'e4700000-0000-4000-8000-000000000002',
    'e4100000-0000-4000-8000-000000000001',
    'e4400000-0000-4000-8000-000000000005',
    'e4300000-0000-4000-8000-000000000001',
    'e3000000-0000-4000-8000-000000000001',
    '2035-01-01'
  );

insert into public.class_teacher_assignments (
  id, term_id, class_section_id, staff_membership_id, starts_on
)
values (
  'e4800000-0000-4000-8000-000000000001',
  'e4100000-0000-4000-8000-000000000001',
  'e4400000-0000-4000-8000-000000000004',
  'e3000000-0000-4000-8000-000000000001',
  '2035-01-01'
);

insert into public.assessment_schemes (
  id, term_id, grade_level_id, subject_id, name, status, effective_from
)
values (
  'e4900000-0000-4000-8000-000000000001',
  'e4100000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000001',
  'e4300000-0000-4000-8000-000000000001',
  'Mark Fixture',
  'DRAFT',
  '2035-01-01'
);

insert into public.assessment_components (
  id, assessment_scheme_id, name, component_code, maximum_score,
  weight_percentage, sort_order
)
values (
  'e4910000-0000-4000-8000-000000000001',
  'e4900000-0000-4000-8000-000000000001',
  'Assessment',
  'ASSESS',
  100,
  100,
  1
);

update public.assessment_schemes
set status = 'ACTIVE'
where id = 'e4900000-0000-4000-8000-000000000001';

insert into public.mark_sheets (
  id, term_id, class_section_id, subject_id, assessment_scheme_id,
  teaching_assignment_id
)
values (
  'e4920000-0000-4000-8000-000000000001',
  'e4100000-0000-4000-8000-000000000001',
  'e4400000-0000-4000-8000-000000000005',
  'e4300000-0000-4000-8000-000000000001',
  'e4900000-0000-4000-8000-000000000001',
  'e4700000-0000-4000-8000-000000000002'
);

insert into public.grade_level_subjects (
  id, grade_level_id, subject_id, is_required,
  contributes_to_aggregate, sort_order
)
values
  (
    'e4930000-0000-4000-8000-000000000001',
    'e4200000-0000-4000-8000-000000000001',
    'e4300000-0000-4000-8000-000000000001',
    true,
    true,
    1
  ),
  (
    'e4930000-0000-4000-8000-000000000002',
    'e4200000-0000-4000-8000-000000000001',
    'e4300000-0000-4000-8000-000000000002',
    true,
    true,
    2
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e5000000-0000-4000-8000-000000000001"}',
  true
);
select public.set_my_active_membership(
  'e3000000-0000-4000-8000-000000000001'
);

select extensions.lives_ok(
  $$
    select public.update_class_section(
      'e4400000-0000-4000-8000-000000000001',
      (select updated_at from public.class_sections where id = 'e4400000-0000-4000-8000-000000000001'),
      'e4000000-0000-4000-8000-000000000002',
      'e4200000-0000-4000-8000-000000000002',
      'Moved Unreferenced',
      'UNREF-MOVED',
      32
    )
  $$,
  '1. an unreferenced class can move to another same-school draft year and grade'
);
select extensions.is(
  (
    select (academic_year_id, grade_level_id)
    from public.class_sections
    where id = 'e4400000-0000-4000-8000-000000000001'
  ),
  (
    'e4000000-0000-4000-8000-000000000002'::uuid,
    'e4200000-0000-4000-8000-000000000002'::uuid
  ),
  '2. the unreferenced class receives the requested scope'
);

select extensions.throws_ok(
  $$
    select public.update_class_section(
      'e4400000-0000-4000-8000-000000000002',
      (select updated_at from public.class_sections where id = 'e4400000-0000-4000-8000-000000000002'),
      'e4000000-0000-4000-8000-000000000002',
      'e4200000-0000-4000-8000-000000000002',
      'Forged Enrolment Move',
      'ENROL-MOVED',
      30
    )
  $$,
  '55006',
  'ACADEMIC_CONFIGURATION_CLASS_SCOPE_IN_USE',
  '3. a class with an enrolment cannot move scope'
);
select extensions.throws_ok(
  $$
    select public.update_class_section(
      'e4400000-0000-4000-8000-000000000003',
      (select updated_at from public.class_sections where id = 'e4400000-0000-4000-8000-000000000003'),
      'e4000000-0000-4000-8000-000000000002',
      'e4200000-0000-4000-8000-000000000002',
      'Forged Teaching Move',
      'TEACH-MOVED',
      30
    )
  $$,
  '55006',
  'ACADEMIC_CONFIGURATION_CLASS_SCOPE_IN_USE',
  '4. a class with a teaching assignment cannot move scope'
);
select extensions.throws_ok(
  $$
    select public.update_class_section(
      'e4400000-0000-4000-8000-000000000004',
      (select updated_at from public.class_sections where id = 'e4400000-0000-4000-8000-000000000004'),
      'e4000000-0000-4000-8000-000000000002',
      'e4200000-0000-4000-8000-000000000002',
      'Forged Class Teacher Move',
      'CLASS-MOVED',
      30
    )
  $$,
  '55006',
  'ACADEMIC_CONFIGURATION_CLASS_SCOPE_IN_USE',
  '5. a class with a class-teacher assignment cannot move scope'
);
select extensions.throws_ok(
  $$
    select public.update_class_section(
      'e4400000-0000-4000-8000-000000000005',
      (select updated_at from public.class_sections where id = 'e4400000-0000-4000-8000-000000000005'),
      'e4000000-0000-4000-8000-000000000002',
      'e4200000-0000-4000-8000-000000000002',
      'Forged Mark Move',
      'MARK-MOVED',
      30
    )
  $$,
  '55006',
  'ACADEMIC_CONFIGURATION_CLASS_SCOPE_IN_USE',
  '6. a class with a mark sheet cannot move scope'
);
select extensions.lives_ok(
  $$
    select public.update_class_section(
      'e4400000-0000-4000-8000-000000000002',
      (select updated_at from public.class_sections where id = 'e4400000-0000-4000-8000-000000000002'),
      'e4000000-0000-4000-8000-000000000001',
      'e4200000-0000-4000-8000-000000000001',
      'Enrolled Renamed',
      'ENROL-EDIT',
      36
    )
  $$,
  '7. referenced class name, code, and capacity remain editable'
);

select extensions.lives_ok(
  $$
    select public.update_grade_level_subject(
      'e4930000-0000-4000-8000-000000000001',
      (select updated_at from public.grade_level_subjects where id = 'e4930000-0000-4000-8000-000000000001'),
      false,
      false,
      1
    )
  $$,
  '8. curriculum mapping flags can be edited'
);
select extensions.is(
  (
    select (is_required, contributes_to_aggregate)
    from public.grade_level_subjects
    where id = 'e4930000-0000-4000-8000-000000000001'
  ),
  (false, false),
  '9. curriculum mapping pair identity is retained while flags change'
);

reset role;
select extensions.throws_ok(
  $$
    update public.grade_level_subjects
    set subject_id = 'e4300000-0000-4000-8000-000000000002'
    where id = 'e4930000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'ACADEMIC_CONFIGURATION_MAPPING_IDENTITY_IMMUTABLE',
  '10. a privileged direct update cannot repoint a mapping'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e5000000-0000-4000-8000-000000000001"}',
  true
);

select extensions.throws_ok(
  $$
    select public.remove_grade_level_subject(
      'e4930000-0000-4000-8000-000000000001',
      (select updated_at from public.grade_level_subjects where id = 'e4930000-0000-4000-8000-000000000001')
    )
  $$,
  '55006',
  'ACADEMIC_CONFIGURATION_MAPPING_IN_USE',
  '11. a used curriculum mapping cannot be removed'
);
select extensions.lives_ok(
  $$
    select public.remove_grade_level_subject(
      'e4930000-0000-4000-8000-000000000002',
      (select updated_at from public.grade_level_subjects where id = 'e4930000-0000-4000-8000-000000000002')
    )
  $$,
  '12. an unused curriculum mapping can be removed'
);

select extensions.lives_ok(
  $$
    select public.update_academic_year(
      'e4000000-0000-4000-8000-000000000001',
      'Synthetic 2035 Updated',
      '2035-01-01',
      '2035-12-31',
      (select updated_at from public.academic_years where id = 'e4000000-0000-4000-8000-000000000001')
    )
  $$,
  '13. a draft academic year can be edited'
);
select extensions.lives_ok(
  $$
    select public.update_term(
      'e4100000-0000-4000-8000-000000000001',
      'Synthetic Term Updated',
      1,
      '2035-01-01',
      '2035-06-30',
      true,
      (select updated_at from public.terms where id = 'e4100000-0000-4000-8000-000000000001')
    )
  $$,
  '14. a draft term can be edited'
);
select * from public.activate_academic_year(
  'e4000000-0000-4000-8000-000000000001',
  (select updated_at from public.academic_years where id = 'e4000000-0000-4000-8000-000000000001')
);
select extensions.throws_ok(
  $$
    select public.update_academic_year(
      'e4000000-0000-4000-8000-000000000001',
      'Forbidden Active Edit',
      '2035-01-01',
      '2035-12-31',
      (select updated_at from public.academic_years where id = 'e4000000-0000-4000-8000-000000000001')
    )
  $$,
  '55000',
  'ACADEMIC_CONFIGURATION_IMMUTABLE',
  '15. an active academic year cannot be edited'
);
select * from public.open_term(
  'e4100000-0000-4000-8000-000000000001',
  (select updated_at from public.terms where id = 'e4100000-0000-4000-8000-000000000001')
);
select extensions.throws_ok(
  $$
    select public.update_term(
      'e4100000-0000-4000-8000-000000000001',
      'Forbidden Open Edit',
      1,
      '2035-01-01',
      '2035-06-30',
      true,
      (select updated_at from public.terms where id = 'e4100000-0000-4000-8000-000000000001')
    )
  $$,
  '55000',
  'ACADEMIC_CONFIGURATION_IMMUTABLE',
  '16. an open term cannot be edited'
);

create temporary table grade_order_snapshot as
select id, sort_order, updated_at
from public.grade_levels
where school_id = 'e1000000-0000-4000-8000-000000000001'
  and is_active;

select extensions.lives_ok(
  $$
    select public.reorder_grade_levels(
      jsonb_build_array(
        jsonb_build_object(
          'id', 'e4200000-0000-4000-8000-000000000001',
          'sort_order', 2,
          'expected_updated_at', (select updated_at from grade_order_snapshot where id = 'e4200000-0000-4000-8000-000000000001')
        ),
        jsonb_build_object(
          'id', 'e4200000-0000-4000-8000-000000000002',
          'sort_order', 1,
          'expected_updated_at', (select updated_at from grade_order_snapshot where id = 'e4200000-0000-4000-8000-000000000002')
        )
      )
    )
  $$,
  '17. grade reordering succeeds transactionally'
);
select extensions.throws_ok(
  $$
    select public.reorder_grade_levels(
      jsonb_build_array(
        jsonb_build_object(
          'id', 'e4200000-0000-4000-8000-000000000001',
          'sort_order', 1,
          'expected_updated_at', (select updated_at - interval '1 second' from grade_order_snapshot where id = 'e4200000-0000-4000-8000-000000000001')
        ),
        jsonb_build_object(
          'id', 'e4200000-0000-4000-8000-000000000002',
          'sort_order', 2,
          'expected_updated_at', (select updated_at from grade_order_snapshot where id = 'e4200000-0000-4000-8000-000000000002')
        )
      )
    )
  $$,
  'PT409',
  'ACADEMIC_CONFIGURATION_CONFLICT',
  '18. a stale grade reorder fails atomically'
);
select extensions.is(
  (
    select sort_order
    from public.grade_levels
    where id = 'e4200000-0000-4000-8000-000000000002'
  ),
  1,
  '19. failed grade reorder preserves the committed order'
);

create temporary table subject_order_snapshot as
select id, sort_order, updated_at
from public.subjects
where school_id = 'e1000000-0000-4000-8000-000000000001'
  and is_active;

select extensions.lives_ok(
  $$
    select public.reorder_subjects(
      jsonb_build_array(
        jsonb_build_object(
          'id', 'e4300000-0000-4000-8000-000000000001',
          'sort_order', 2,
          'expected_updated_at', (select updated_at from subject_order_snapshot where id = 'e4300000-0000-4000-8000-000000000001')
        ),
        jsonb_build_object(
          'id', 'e4300000-0000-4000-8000-000000000002',
          'sort_order', 1,
          'expected_updated_at', (select updated_at from subject_order_snapshot where id = 'e4300000-0000-4000-8000-000000000002')
        )
      )
    )
  $$,
  '20. subject reordering succeeds transactionally'
);
select extensions.throws_ok(
  $$
    select public.reorder_subjects(
      jsonb_build_array(
        jsonb_build_object(
          'id', 'e4300000-0000-4000-8000-000000000001',
          'sort_order', 1,
          'expected_updated_at', (select updated_at - interval '1 second' from subject_order_snapshot where id = 'e4300000-0000-4000-8000-000000000001')
        ),
        jsonb_build_object(
          'id', 'e4300000-0000-4000-8000-000000000002',
          'sort_order', 2,
          'expected_updated_at', (select updated_at from subject_order_snapshot where id = 'e4300000-0000-4000-8000-000000000002')
        )
      )
    )
  $$,
  'PT409',
  'ACADEMIC_CONFIGURATION_CONFLICT',
  '21. a stale subject reorder fails atomically'
);

create temporary table assessment_draft as
select *
from public.save_assessment_scheme_draft(
  null,
  null,
  'e4100000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000002',
  'e4300000-0000-4000-8000-000000000002',
  'Workflow Assessment Draft',
  '2035-01-01',
  '[{"name":"Coursework","component_code":"CW","maximum_score":100,"weight_percentage":100,"sort_order":1,"is_required":true}]'::jsonb
);
select extensions.is(
  (
    select entity_id
    from public.save_assessment_scheme_draft(
      (select entity_id from assessment_draft),
      (select updated_at from public.assessment_schemes where id = (select entity_id from assessment_draft)),
      'e4100000-0000-4000-8000-000000000001',
      'e4200000-0000-4000-8000-000000000002',
      'e4300000-0000-4000-8000-000000000002',
      'Workflow Assessment Edited',
      '2035-01-01',
      '[{"name":"Edited","component_code":"EDIT","maximum_score":100,"weight_percentage":100,"sort_order":1,"is_required":true}]'::jsonb
    )
  ),
  (select entity_id from assessment_draft),
  '22. editing an assessment draft updates the same record'
);
select * from public.activate_assessment_scheme(
  (select entity_id from assessment_draft),
  (select updated_at from public.assessment_schemes where id = (select entity_id from assessment_draft))
);
create temporary table assessment_version as
select *
from public.create_assessment_scheme_version(
  (select entity_id from assessment_draft),
  (select updated_at from public.assessment_schemes where id = (select entity_id from assessment_draft)),
  'Workflow Assessment Version',
  '2035-01-01',
  '[{"name":"Versioned","component_code":"VER","maximum_score":100,"weight_percentage":100,"sort_order":1,"is_required":true}]'::jsonb
);
select extensions.ok(
  (select entity_id from assessment_version)
    <> (select entity_id from assessment_draft)
    and (
      select version
      from public.assessment_schemes
      where id = (select entity_id from assessment_version)
    ) = 2,
  '23. an active assessment scheme creates a distinct incremented draft version'
);

create temporary table grading_draft as
select *
from public.save_grading_scale_draft(
  null,
  null,
  'e4000000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000001',
  'Workflow Grading Draft',
  '2035-01-01',
  '[{"minimum_score":0,"maximum_score":100,"grade":"P","aggregate_points":1,"description":"Pass","is_pass":true,"sort_order":1}]'::jsonb
);
select extensions.is(
  (
    select entity_id
    from public.save_grading_scale_draft(
      (select entity_id from grading_draft),
      (select updated_at from public.grading_scales where id = (select entity_id from grading_draft)),
      'e4000000-0000-4000-8000-000000000001',
      'e4200000-0000-4000-8000-000000000001',
      'Workflow Grading Edited',
      '2035-01-01',
      '[{"minimum_score":0,"maximum_score":100,"grade":"PASS","aggregate_points":1,"description":"Edited","is_pass":true,"sort_order":1}]'::jsonb
    )
  ),
  (select entity_id from grading_draft),
  '24. editing a grading draft updates the same record'
);
select * from public.activate_grading_scale(
  (select entity_id from grading_draft),
  (select updated_at from public.grading_scales where id = (select entity_id from grading_draft))
);
create temporary table grading_version as
select *
from public.create_grading_scale_version(
  (select entity_id from grading_draft),
  (select updated_at from public.grading_scales where id = (select entity_id from grading_draft)),
  'Workflow Grading Version',
  '2035-01-01',
  '[{"minimum_score":0,"maximum_score":100,"grade":"V","aggregate_points":1,"description":"Version","is_pass":true,"sort_order":1}]'::jsonb
);
select extensions.ok(
  (select entity_id from grading_version) <> (select entity_id from grading_draft),
  '25. an active grading scale creates a separate draft version'
);

create temporary table ranking_draft as
select *
from public.save_ranking_rule(
  null,
  null,
  'e4000000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000001',
  'Workflow Ranking',
  'AVERAGE',
  'DENSE',
  '{"schema_version":1,"direction":"DESC","include_incomplete":false,"minimum_subjects":1}'::jsonb
);
select * from public.activate_ranking_rule(
  (select entity_id from ranking_draft),
  (select updated_at from public.ranking_rules where id = (select entity_id from ranking_draft))
);
create temporary table ranking_version as
select *
from public.create_ranking_rule_version(
  (select entity_id from ranking_draft),
  (select updated_at from public.ranking_rules where id = (select entity_id from ranking_draft)),
  'Workflow Ranking Version',
  'AVERAGE',
  'COMPETITION',
  '{"schema_version":1,"direction":"DESC","include_incomplete":false,"minimum_subjects":1}'::jsonb
);
select extensions.ok(
  (select entity_id from ranking_version) <> (select entity_id from ranking_draft),
  '26. active ranking rules use explicit version creation'
);

create temporary table promotion_draft as
select *
from public.save_promotion_rule(
  null,
  null,
  'e4000000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000001',
  'Workflow Promotion',
  50,
  30,
  1,
  80,
  '{"schema_version":1,"subjects":[{"subject_id":"e4300000-0000-4000-8000-000000000001","require":"PASS"}]}'::jsonb,
  '{"schema_version":1,"require_complete_result":true,"success_outcome":"PROMOTED","failure_outcome":"ACADEMIC_REVIEW","incomplete_outcome":"ACADEMIC_REVIEW"}'::jsonb
);
select * from public.activate_promotion_rule(
  (select entity_id from promotion_draft),
  (select updated_at from public.promotion_rules where id = (select entity_id from promotion_draft))
);
create temporary table promotion_version as
select *
from public.create_promotion_rule_version(
  (select entity_id from promotion_draft),
  (select updated_at from public.promotion_rules where id = (select entity_id from promotion_draft)),
  'Workflow Promotion Version',
  55,
  28,
  1,
  82,
  '{"schema_version":1,"subjects":[{"subject_id":"e4300000-0000-4000-8000-000000000001","require":"PASS"}]}'::jsonb,
  '{"schema_version":1,"require_complete_result":true,"success_outcome":"PROMOTED","failure_outcome":"ACADEMIC_REVIEW","incomplete_outcome":"ACADEMIC_REVIEW"}'::jsonb
);
select extensions.ok(
  (select entity_id from promotion_version) <> (select entity_id from promotion_draft),
  '27. active promotion rules use explicit version creation'
);

reset role;

select extensions.is(
  (
    select action
    from public.audit_logs
    where entity_id = (select entity_id from assessment_draft)
      and old_values is null
    order by created_at
    limit 1
  ),
  'ACADEMIC_CONFIGURATION_CREATED',
  '28. first-time versioned creation uses the created audit action'
);
select extensions.is(
  (
    select action
    from public.audit_logs
    where entity_id = (select entity_id from assessment_draft)
      and action = 'ACADEMIC_CONFIGURATION_UPDATED'
    limit 1
  ),
  'ACADEMIC_CONFIGURATION_UPDATED',
  '29. draft edits use the updated audit action'
);
select extensions.is(
  (
    select action
    from public.audit_logs
    where entity_id = (select entity_id from assessment_version)
  ),
  'ACADEMIC_CONFIGURATION_VERSION_CREATED',
  '30. new versions have a distinct version-created audit action'
);
select extensions.is(
  (
    select new_values ->> 'source_record_id'
    from public.audit_logs
    where entity_id = (select entity_id from assessment_version)
  ),
  (select entity_id::text from assessment_draft),
  '31. version audits identify the source and new record'
);

create temporary table conflict_audit_count as
select count(*)::bigint as count
from public.audit_logs
where entity_id = 'e4200000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e5000000-0000-4000-8000-000000000001"}',
  true
);

select extensions.throws_ok(
  $$
    select public.update_grade_level(
      'e4200000-0000-4000-8000-000000000001',
      (select updated_at - interval '1 second' from grade_order_snapshot where id = 'e4200000-0000-4000-8000-000000000001'),
      'STALE',
      'Stale Grade',
      2,
      false
    )
  $$,
  'PT409',
  'ACADEMIC_CONFIGURATION_CONFLICT',
  '32. stale mutations report a concurrency conflict'
);

reset role;

select extensions.is(
  (
    select count(*)::bigint
    from public.audit_logs
    where entity_id = 'e4200000-0000-4000-8000-000000000001'
  ),
  (select count from conflict_audit_count),
  '33. conflict failures create no success audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e5000000-0000-4000-8000-000000000001"}',
  true
);

select extensions.throws_ok(
  $$
    select public.update_academic_year(
      'e4000000-0000-4000-8000-000000000099',
      'Forged Other School',
      '2035-01-01',
      '2035-12-31',
      (select updated_at from public.academic_years where id = 'e4000000-0000-4000-8000-000000000099')
    )
  $$,
  'P0002',
  'ACADEMIC_CONFIGURATION_NOT_FOUND',
  '34. cross-school update identifiers are rejected'
);

create temporary table no_op_lifecycle_audit_count as
select count(*)::bigint as count
from public.audit_logs
where entity_id = 'e4200000-0000-4000-8000-000000000001';

select extensions.throws_ok(
  $$
    select public.set_grade_level_active(
      'e4200000-0000-4000-8000-000000000001',
      (select updated_at from public.grade_levels where id = 'e4200000-0000-4000-8000-000000000001'),
      true
    )
  $$,
  '55000',
  'ACADEMIC_CONFIGURATION_LIFECYCLE_NO_CHANGE',
  '34a. a no-op grade activation is rejected without pretending to succeed'
);

reset role;
select extensions.is(
  (
    select count(*)::bigint
    from public.audit_logs
    where entity_id = 'e4200000-0000-4000-8000-000000000001'
  ),
  (select count from no_op_lifecycle_audit_count),
  '34b. a no-op lifecycle request creates no audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"e5000000-0000-4000-8000-000000000002"}',
  true
);
select public.set_my_active_membership(
  'e3000000-0000-4000-8000-000000000002'
);
select extensions.throws_ok(
  $$
    select public.create_subject(
      'VIEW',
      'Viewer Forgery',
      '',
      false,
      false,
      99
    )
  $$,
  '42501',
  'ACADEMIC_CONFIGURATION_FORBIDDEN',
  '35. view-only roles cannot call configuration mutation RPCs'
);
select extensions.throws_ok(
  $$
    insert into public.subjects (
      school_id, code, name, sort_order
    ) values (
      'e1000000-0000-4000-8000-000000000001',
      'DIRECT',
      'Direct Forgery',
      99
    )
  $$,
  '42501',
  'permission denied for table subjects',
  '36. authenticated direct table writes remain denied'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.set_grade_level_subject(uuid,uuid,boolean,boolean,integer,uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  '37. the ambiguous combined mapping RPC is removed from the browser surface'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.create_grade_level_subject(uuid,uuid,boolean,boolean,integer)',
    'EXECUTE'
  )
    and has_function_privilege(
      'authenticated',
      'public.update_grade_level_subject(uuid,timestamp with time zone,boolean,boolean,integer)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.create_grade_level_subject(uuid,uuid,boolean,boolean,integer)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.update_grade_level_subject(uuid,timestamp with time zone,boolean,boolean,integer)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.create_assessment_scheme_version(uuid,timestamp with time zone,text,date,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.create_grading_scale_version(uuid,timestamp with time zone,text,date,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.create_ranking_rule_version(uuid,timestamp with time zone,text,ranking_basis,ranking_tie_method,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.create_promotion_rule_version(uuid,timestamp with time zone,text,numeric,integer,integer,numeric,jsonb,jsonb)',
      'EXECUTE'
    ),
  '38. mapping creation and flag updates use separate narrow RPCs'
);
select extensions.is(
  (
    select count(*)
    from pg_class
    where oid = any(array[
      'public.academic_years'::regclass,
      'public.terms'::regclass,
      'public.grade_levels'::regclass,
      'public.class_sections'::regclass,
      'public.subjects'::regclass,
      'public.grade_level_subjects'::regclass,
      'public.assessment_schemes'::regclass,
      'public.grading_scales'::regclass,
      'public.ranking_rules'::regclass,
      'public.promotion_rules'::regclass
    ])
      and relrowsecurity
      and relforcerowsecurity
  ),
  10::bigint,
  '39. forced RLS remains enabled on every Stage 6 parent table'
);
select extensions.ok(
  not exists (
    select 1
    from public.audit_logs
    where new_values ->> 'name' in (
      'Forged Enrolment Move',
      'Forged Teaching Move',
      'Forged Class Teacher Move',
      'Forged Mark Move'
    )
  ),
  '40. failed class scope changes create no success audit event'
);

reset role;
select * from extensions.finish();
rollback;
