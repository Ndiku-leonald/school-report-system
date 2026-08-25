begin;

select extensions.no_plan();

insert into public.schools (id, name, slug, school_code)
values ('r1000000-0000-4000-8000-000000000001', 'Results Engine Runtime School', 'results-engine-runtime-school', 'RUNTIME-RESULTS');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('r2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'results-runtime@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles (id, first_name, last_name)
values ('r2000000-0000-4000-8000-000000000001', 'Runtime', 'Results');

insert into public.school_staff_memberships (id, school_id, profile_id, employee_number, status)
values ('r3000000-0000-4000-8000-000000000001', 'r1000000-0000-4000-8000-000000000001',
  'r2000000-0000-4000-8000-000000000001', 'RESULTS-RUNTIME-ADMIN', 'ACTIVE');

insert into public.staff_role_assignments (id, membership_id, role, granted_at)
values ('r3100000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001', 'SCHOOL_ADMIN', now() - interval '1 day');

insert into public.academic_years (id, school_id, name, starts_on, ends_on, status)
values ('r4000000-0000-4000-8000-000000000001', 'r1000000-0000-4000-8000-000000000001',
  'Results Runtime Year', '2039-01-01', '2039-12-31', 'ACTIVE');

insert into public.terms (id, academic_year_id, name, term_number, starts_on, ends_on, status)
values ('r4100000-0000-4000-8000-000000000001', 'r4000000-0000-4000-8000-000000000001',
  'Results Runtime Term', 1, '2039-01-01', '2039-06-30', 'DRAFT');

insert into public.grade_levels (id, school_id, code, name, sort_order)
values ('r4200000-0000-4000-8000-000000000001', 'r1000000-0000-4000-8000-000000000001', 'RR1', 'Runtime Grade One', 1);

insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code)
values
  ('r4300000-0000-4000-8000-000000000001', 'r4000000-0000-4000-8000-000000000001', 'r4200000-0000-4000-8000-000000000001', 'Runtime Blue', 'RR-BLUE'),
  ('r4300000-0000-4000-8000-000000000002', 'r4000000-0000-4000-8000-000000000001', 'r4200000-0000-4000-8000-000000000001', 'Runtime Gold', 'RR-GOLD');

insert into public.subjects (id, school_id, code, name, sort_order)
values
  ('r4400000-0000-4000-8000-000000000001', 'r1000000-0000-4000-8000-000000000001', 'RR-ENG', 'Runtime English', 1),
  ('r4400000-0000-4000-8000-000000000002', 'r1000000-0000-4000-8000-000000000001', 'RR-MAT', 'Runtime Mathematics', 2),
  ('r4400000-0000-4000-8000-000000000003', 'r1000000-0000-4000-8000-000000000001', 'RR-ART', 'Runtime Arts', 3);

insert into public.grade_level_subjects (id, grade_level_id, subject_id, is_required, contributes_to_aggregate, sort_order)
values
  ('r4500000-0000-4000-8000-000000000001', 'r4200000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000001', true, true, 1),
  ('r4500000-0000-4000-8000-000000000002', 'r4200000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000002', true, true, 2),
  ('r4500000-0000-4000-8000-000000000003', 'r4200000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000003', false, false, 3);

insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values
  ('r4600000-0000-4000-8000-000000000001', 'r1000000-0000-4000-8000-000000000001', 'RR-001', 'Blue', 'One', '2039-01-02'),
  ('r4600000-0000-4000-8000-000000000002', 'r1000000-0000-4000-8000-000000000001', 'RR-002', 'Blue', 'Two', '2039-01-02'),
  ('r4600000-0000-4000-8000-000000000003', 'r1000000-0000-4000-8000-000000000001', 'RR-003', 'Gold', 'Three', '2039-01-02'),
  ('r4600000-0000-4000-8000-000000000004', 'r1000000-0000-4000-8000-000000000001', 'RR-004', 'Gold', 'Four', '2039-01-02');

insert into public.enrollments (id, student_id, academic_year_id, class_section_id, enrolled_on)
values
  ('r4700000-0000-4000-8000-000000000001', 'r4600000-0000-4000-8000-000000000001', 'r4000000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000001', '2039-01-02'),
  ('r4700000-0000-4000-8000-000000000002', 'r4600000-0000-4000-8000-000000000002', 'r4000000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000001', '2039-01-02'),
  ('r4700000-0000-4000-8000-000000000003', 'r4600000-0000-4000-8000-000000000003', 'r4000000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000002', '2039-01-02'),
  ('r4700000-0000-4000-8000-000000000004', 'r4600000-0000-4000-8000-000000000004', 'r4000000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000002', '2039-01-02');

insert into public.teaching_assignments (id, term_id, class_section_id, subject_id, staff_membership_id, starts_on)
values
  ('r4800000-0000-4000-8000-000000000001', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001', '2039-01-02'),
  ('r4800000-0000-4000-8000-000000000002', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000002', 'r3000000-0000-4000-8000-000000000001', '2039-01-02'),
  ('r4800000-0000-4000-8000-000000000003', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000003', 'r3000000-0000-4000-8000-000000000001', '2039-01-02'),
  ('r4800000-0000-4000-8000-000000000004', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000002', 'r4400000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001', '2039-01-02'),
  ('r4800000-0000-4000-8000-000000000005', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000002', 'r4400000-0000-4000-8000-000000000002', 'r3000000-0000-4000-8000-000000000001', '2039-01-02'),
  ('r4800000-0000-4000-8000-000000000006', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000002', 'r4400000-0000-4000-8000-000000000003', 'r3000000-0000-4000-8000-000000000001', '2039-01-02');

insert into public.assessment_schemes (id, term_id, grade_level_id, subject_id, name, status, effective_from, created_by)
values
  ('r4900000-0000-4000-8000-000000000001', 'r4100000-0000-4000-8000-000000000001', 'r4200000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000001', 'Runtime English Scheme', 'ACTIVE', '2039-01-02', 'r3000000-0000-4000-8000-000000000001'),
  ('r4900000-0000-4000-8000-000000000002', 'r4100000-0000-4000-8000-000000000001', 'r4200000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000002', 'Runtime Mathematics Scheme', 'ACTIVE', '2039-01-02', 'r3000000-0000-4000-8000-000000000001'),
  ('r4900000-0000-4000-8000-000000000003', 'r4100000-0000-4000-8000-000000000001', 'r4200000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000003', 'Runtime Arts Scheme', 'ACTIVE', '2039-01-02', 'r3000000-0000-4000-8000-000000000001');

insert into public.assessment_components (id, assessment_scheme_id, name, component_code, maximum_score, weight_percentage, sort_order)
values
  ('r4a00000-0000-4000-8000-000000000001', 'r4900000-0000-4000-8000-000000000001', 'Runtime English Exam', 'RR-ENG-EXAM', 100, 100, 1),
  ('r4a00000-0000-4000-8000-000000000002', 'r4900000-0000-4000-8000-000000000002', 'Runtime Mathematics Exam', 'RR-MAT-EXAM', 100, 100, 1),
  ('r4a00000-0000-4000-8000-000000000003', 'r4900000-0000-4000-8000-000000000003', 'Runtime Arts Exam', 'RR-ART-EXAM', 100, 100, 1);

insert into public.mark_sheets (id, term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id)
values
  ('r4b00000-0000-4000-8000-000000000001', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000001', 'r4900000-0000-4000-8000-000000000001', 'r4800000-0000-4000-8000-000000000001'),
  ('r4b00000-0000-4000-8000-000000000002', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000002', 'r4900000-0000-4000-8000-000000000002', 'r4800000-0000-4000-8000-000000000002'),
  ('r4b00000-0000-4000-8000-000000000003', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000001', 'r4400000-0000-4000-8000-000000000003', 'r4900000-0000-4000-8000-000000000003', 'r4800000-0000-4000-8000-000000000003'),
  ('r4b00000-0000-4000-8000-000000000004', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000002', 'r4400000-0000-4000-8000-000000000001', 'r4900000-0000-4000-8000-000000000001', 'r4800000-0000-4000-8000-000000000004'),
  ('r4b00000-0000-4000-8000-000000000005', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000002', 'r4400000-0000-4000-8000-000000000002', 'r4900000-0000-4000-8000-000000000002', 'r4800000-0000-4000-8000-000000000005'),
  ('r4b00000-0000-4000-8000-000000000006', 'r4100000-0000-4000-8000-000000000001', 'r4300000-0000-4000-8000-000000000002', 'r4400000-0000-4000-8000-000000000003', 'r4900000-0000-4000-8000-000000000003', 'r4800000-0000-4000-8000-000000000006');

insert into public.marks (id, mark_sheet_id, assessment_component_id, enrollment_id, score, attendance_status, created_by, updated_by)
values
  ('r4c00000-0000-4000-8000-000000000001', 'r4b00000-0000-4000-8000-000000000001', 'r4a00000-0000-4000-8000-000000000001', 'r4700000-0000-4000-8000-000000000001', 90, 'PRESENT', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000002', 'r4b00000-0000-4000-8000-000000000001', 'r4a00000-0000-4000-8000-000000000001', 'r4700000-0000-4000-8000-000000000002', 90, 'PRESENT', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000003', 'r4b00000-0000-4000-8000-000000000002', 'r4a00000-0000-4000-8000-000000000002', 'r4700000-0000-4000-8000-000000000001', 80, 'PRESENT', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000004', 'r4b00000-0000-4000-8000-000000000002', 'r4a00000-0000-4000-8000-000000000002', 'r4700000-0000-4000-8000-000000000003', 70, 'PRESENT', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000005', 'r4b00000-0000-4000-8000-000000000002', 'r4a00000-0000-4000-8000-000000000002', 'r4700000-0000-4000-8000-000000000004', 60, 'PRESENT', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000010', 'r4b00000-0000-4000-8000-000000000001', 'r4a00000-0000-4000-8000-000000000001', 'r4700000-0000-4000-8000-000000000004', null, 'ABSENT', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000006', 'r4b00000-0000-4000-8000-000000000003', 'r4a00000-0000-4000-8000-000000000003', 'r4700000-0000-4000-8000-000000000001', null, 'EXEMPTED', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000007', 'r4b00000-0000-4000-8000-000000000003', 'r4a00000-0000-4000-8000-000000000003', 'r4700000-0000-4000-8000-000000000002', null, 'EXEMPTED', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000008', 'r4b00000-0000-4000-8000-000000000003', 'r4a00000-0000-4000-8000-000000000003', 'r4700000-0000-4000-8000-000000000003', null, 'EXEMPTED', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001'),
  ('r4c00000-0000-4000-8000-000000000009', 'r4b00000-0000-4000-8000-000000000003', 'r4a00000-0000-4000-8000-000000000003', 'r4700000-0000-4000-8000-000000000004', null, 'EXEMPTED', 'r3000000-0000-4000-8000-000000000001', 'r3000000-0000-4000-8000-000000000001');

insert into public.grading_scales (id, school_id, academic_year_id, grade_level_id, name, version, is_active, effective_from, created_by)
values ('r4d00000-0000-4000-8000-000000000001', 'r1000000-0000-4000-8000-000000000001', 'r4000000-0000-4000-8000-000000000001', 'r4200000-0000-4000-8000-000000000001', 'Runtime Scale', 1, false, '2039-01-02', 'r3000000-0000-4000-8000-000000000001');
insert into public.grading_bands (grading_scale_id, minimum_score, maximum_score, grade, aggregate_points, is_pass, sort_order)
values
  ('r4d00000-0000-4000-8000-000000000001', 0, 50, 'F', 1, false, 1),
  ('r4d00000-0000-4000-8000-000000000001', 50, 80, 'C', 2, true, 2),
  ('r4d00000-0000-4000-8000-000000000001', 80, 100, 'A', 3, true, 3);
update public.grading_scales set is_active = true where id = 'r4d00000-0000-4000-8000-000000000001';

insert into public.ranking_rules (id, school_id, academic_year_id, grade_level_id, name, version, ranking_basis, tie_method, configuration, is_active, created_by)
values ('r4e00000-0000-4000-8000-000000000001', 'r1000000-0000-4000-8000-000000000001', 'r4000000-0000-4000-8000-000000000001', 'r4200000-0000-4000-8000-000000000001', 'Runtime Average Ranking', 1, 'AVERAGE', 'DENSE', '{"direction":"DESC","include_incomplete":true,"minimum_subjects":1}'::jsonb, false, 'r3000000-0000-4000-8000-000000000001');
update public.ranking_rules set is_active = true where id = 'r4e00000-0000-4000-8000-000000000001';

select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets set workflow_status = 'LOCKED', locked_by = 'r3000000-0000-4000-8000-000000000001', locked_at = now()
where id in ('r4b00000-0000-4000-8000-000000000001','r4b00000-0000-4000-8000-000000000002','r4b00000-0000-4000-8000-000000000003','r4b00000-0000-4000-8000-000000000004','r4b00000-0000-4000-8000-000000000005');

select set_config('request.jwt.claims', '{}', true);
select extensions.throws_ok(
  $$ select * from public.calculate_grade_results('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001','r4d00000-0000-4000-8000-000000000001','r4e00000-0000-4000-8000-000000000001',null) $$,
  '42501', 'RESULT_CALCULATION_FORBIDDEN', '1. unauthenticated calculation is rejected');

select set_config('request.jwt.claims', '{"sub":"r2000000-0000-4000-8000-000000000001","session_id":"r2100000-0000-4000-8000-000000000001"}', true);
select public.set_my_active_membership('r3000000-0000-4000-8000-000000000001');
select set_config('app.term_marks_workflow_transition', 'allowed', true);
update public.terms set status = 'LOCKED' where id = 'r4100000-0000-4000-8000-000000000001';

select extensions.is((select count(*)::integer from public.class_sections where grade_level_id = 'r4200000-0000-4000-8000-000000000001'), 2, '2. synthetic fixture has two classes');
select extensions.is((select count(*)::integer from public.enrollments where academic_year_id = 'r4000000-0000-4000-8000-000000000001'), 4, '3. synthetic fixture has four learners');
select extensions.is((select count(*)::integer from public.grade_level_subjects where grade_level_id = 'r4200000-0000-4000-8000-000000000001'), 3, '4. synthetic curriculum has three subjects');
select extensions.is((select count(*)::integer from public.mark_sheets where term_id = 'r4100000-0000-4000-8000-000000000001'), 6, '5. all class-subject source sheets exist');
select extensions.is((select count(*)::integer from public.mark_sheets where term_id = 'r4100000-0000-4000-8000-000000000001' and workflow_status = 'LOCKED'), 5, '6. five source sheets are locked');
select extensions.is((select count(*)::integer from public.marks where mark_sheet_id = 'r4b00000-0000-4000-8000-000000000001'), 2, '7. present English marks are stored');
select extensions.is((select count(*)::integer from public.marks where attendance_status = 'EXEMPTED'), 4, '8. exempted attendance is stored');
select extensions.is((select count(*)::integer from public.marks where attendance_status = 'ABSENT'), 1, '9. absent attendance is stored');

select extensions.lives_ok(
  $$ select * from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001') $$,
  '10. authorized user can inspect readiness');
select extensions.is((select expected_class_subject_scopes::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 6, '11. readiness expects every class-subject scope');
select extensions.is((select source_sheet_count::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 6, '12. readiness sees every latest sheet');
select extensions.is((select missing_source_scopes::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 0, '13. no source scope is missing');
select extensions.is((select non_locked_latest_scopes::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 1, '14. readiness identifies the one unlocked latest sheet');
select extensions.ok(not (select up_to_date from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), '15. readiness is not calculable while a source is unlocked');
select extensions.is((select applicable_grading_scale_count::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 1, '16. one grading scale is applicable');
select extensions.is((select applicable_ranking_rule_count::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 1, '17. one ranking rule is applicable');

select extensions.throws_ok(
  $$ select * from public.calculate_grade_results('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001','r4d00000-0000-4000-8000-000000000001','r4e00000-0000-4000-8000-000000000001',null) $$,
  '23514', 'RESULT_SOURCE_NOT_LOCKED', '18. calculation rejects an unlocked latest source');

update public.mark_sheets set workflow_status = 'LOCKED', locked_by = 'r3000000-0000-4000-8000-000000000001', locked_at = now()
where id = 'r4b00000-0000-4000-8000-000000000006';

select extensions.is((select status::text from public.terms where id = 'r4100000-0000-4000-8000-000000000001'), 'LOCKED', '19. term is locked before calculation');
select extensions.is((select non_locked_latest_scopes::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 0, '20. readiness sees all sources locked');
select extensions.ok((select current_authoritative_input_checksum is not null from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), '21. valid readiness exposes authoritative checksum');

select extensions.lives_ok(
  $$ select * from public.calculate_grade_results('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001','r4d00000-0000-4000-8000-000000000001','r4e00000-0000-4000-8000-000000000001',null) $$,
  '22. authorized calculation completes');

select extensions.is((select count(*)::integer from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001'), 1, '23. one calculation run is created');
select extensions.is((select version from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001'), 1, '24. first calculation version is one');
select extensions.is((select length(input_checksum)::integer from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001'), 64, '25. input checksum is sha256 length');
select extensions.is((select length(output_checksum)::integer from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001'), 64, '26. output checksum is sha256 length');
select extensions.is((select count(*)::integer from public.result_calculation_sources where calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 6, '27. every source sheet is manifested');
select extensions.is((select count(*)::integer from public.result_calculation_sources where grade_level_subject_id is not null), 6, '28. every source carries curriculum identity');
select extensions.is((select count(*)::integer from public.result_calculation_sources where curriculum_is_required), 4, '29. requiredness is snapshotted');
select extensions.is((select count(*)::integer from public.result_calculation_sources where not curriculum_contributes_to_aggregate), 2, '30. aggregate contribution is snapshotted');
select extensions.is((select count(*)::integer from public.calculated_student_results where calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 4, '32. every learner receives an overall result');
select extensions.is((select count(*)::integer from public.calculated_subject_results where calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 12, '33. every learner-subject result is materialized');
select extensions.is((select count(*)::integer from public.calculated_component_explanations where calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 24, '34. component explanations include missing cells');
select extensions.is((select count(*)::integer from public.calculated_subject_performance where calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 6, '35. class subject performance is materialized');
select extensions.is((select count(*)::integer from public.calculated_grade_subject_performance where calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 3, '36. grade-wide subject performance is materialized');

select extensions.is((select overall_average from public.calculated_student_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 85.00::numeric, '37. weighted overall average is correct');
select extensions.is((select aggregate_total from public.calculated_student_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 6, '38. aggregate points sum contributing subjects');
select extensions.is((select complete_subject_count from public.calculated_student_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 2, '39. exempted subject is excluded from complete count');
select extensions.ok((select is_complete from public.calculated_student_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), '40. learner with all required subjects is complete');
select extensions.ok(not (select is_complete from public.calculated_student_results where enrollment_id = 'r4700000-0000-4000-8000-000000000002' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), '41. missing required mark makes learner incomplete');
select extensions.ok((select ranking_eligible from public.calculated_student_results where enrollment_id = 'r4700000-0000-4000-8000-000000000002' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), '42. configured incomplete learners can rank');
select extensions.is((select subject_status::text from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000002' and subject_id = 'r4400000-0000-4000-8000-000000000002' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 'INCOMPLETE', '43. missing required subject is incomplete');
select extensions.is((select subject_status::text from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and subject_id = 'r4400000-0000-4000-8000-000000000003' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 'EXEMPTED', '44. exempted subject is exempted');
select extensions.is((select subject_score from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 90.00::numeric, '45. present subject score is correct');
select extensions.is((select subject_score from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000002' and subject_id = 'r4400000-0000-4000-8000-000000000002' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), null::numeric, '46. no present mark leaves score null');
select extensions.is((select grade from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 'A', '47. grading band is applied');
select extensions.is((select subject_position from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 1, '48. first class tie receives dense position one');
select extensions.is((select subject_tie_size from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 2, '49. same-class subject tie size is two');
select extensions.ok((select subject_is_tied from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000001' and subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), '50. same-class tie flag is true');
select extensions.is((select subject_tie_size from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000003' and subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 1, '51. subject ties do not cross class boundaries');
select extensions.is((select subject_position from public.calculated_subject_results where enrollment_id = 'r4700000-0000-4000-8000-000000000003' and subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 1, '52. other-class subject position starts at one');
select extensions.is((select count(*)::integer from public.calculated_subject_results where subject_status = 'INCOMPLETE'), 1, '53. exactly one incomplete subject is materialized');
select extensions.is((select count(*)::integer from public.calculated_subject_results where subject_status = 'EXEMPTED'), 4, '54. all four exempted subjects are materialized');

select extensions.is((select complete_count from public.calculated_grade_subject_performance where subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 4, '55. grade-wide performance counts complete subject rows');
select extensions.is((select mean_score from public.calculated_grade_subject_performance where subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 67.50::numeric, '56. grade-wide mean is correct');
select extensions.is((select pass_rate from public.calculated_grade_subject_performance where subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 75.00::numeric, '57. grade-wide pass rate is correct');
select extensions.is((select exempted_count from public.calculated_grade_subject_performance where subject_id = 'r4400000-0000-4000-8000-000000000003' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 4, '58. grade-wide exempted count is correct');
select extensions.is((select mean_score from public.calculated_subject_performance where class_section_id = 'r4300000-0000-4000-8000-000000000001' and subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), 90.00::numeric, '59. class performance remains class-scoped');
select extensions.is((select count(*)::integer from public.calculated_subject_performance where subject_id = 'r4400000-0000-4000-8000-000000000001'), 2, '60. one class performance row exists per class');
select extensions.is((select grade_distribution->>'A' from public.calculated_grade_subject_performance where subject_id = 'r4400000-0000-4000-8000-000000000001' and calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')), '3', '61. grade distribution is deterministic json');

select extensions.lives_ok($$ select * from public.list_result_grade_subject_performance((select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001')) $$, '62. grade-wide performance reader is available');
select extensions.is((select count(*)::integer from public.list_result_grade_subject_performance((select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001'))), 3, '63. grade-wide performance reader returns all subjects');
select extensions.is((select calculation_present from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), true, '64. readiness reports a calculation');
select extensions.ok((select up_to_date from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), '65. readiness reports the run is current');
select extensions.is((select latest_version from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 1, '66. readiness reports latest version');
select extensions.is((select current_authoritative_input_checksum from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), (select input_checksum from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001'), '67. readiness checksum matches persisted input');
select extensions.is((select latest_run_input_checksum from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), (select input_checksum from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001'), '68. readiness exposes latest run checksum');
select extensions.is((select term_status::text from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 'LOCKED', '69. readiness returns locked term state');
select extensions.is((select class_count::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 2, '70. readiness returns class population');
select extensions.is((select student_population::integer from public.get_results_calculation_readiness('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001')), 4, '71. readiness returns student population');

select (select reused from public.calculate_grade_results('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001','r4d00000-0000-4000-8000-000000000001','r4e00000-0000-4000-8000-000000000001',null)) as reused into temporary table runtime_reuse;
select extensions.ok((select reused from runtime_reuse), '72. identical inputs reuse the existing run');
select extensions.is((select count(*)::integer from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001'), 1, '73. reuse does not create a second run');
select extensions.is((select calculation_version from public.calculate_grade_results('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001','r4d00000-0000-4000-8000-000000000001','r4e00000-0000-4000-8000-000000000001',null)), 1, '74. reuse returns original version');
select extensions.is((select length(input_checksum)::integer from public.calculate_grade_results('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001','r4d00000-0000-4000-8000-000000000001','r4e00000-0000-4000-8000-000000000001',null)), 64, '75. reuse returns input checksum');
select extensions.ok((select output_checksum is not null from public.calculate_grade_results('r4100000-0000-4000-8000-000000000001','r4200000-0000-4000-8000-000000000001','r4d00000-0000-4000-8000-000000000001','r4e00000-0000-4000-8000-000000000001',null)), '76. reuse returns output checksum');

select extensions.ok(not has_table_privilege('authenticated', 'public.result_calculation_sources', 'INSERT,UPDATE,DELETE'), '77. runtime confirms source writes are RPC-only');
select extensions.ok(not has_table_privilege('authenticated', 'public.calculated_grade_subject_performance', 'INSERT,UPDATE,DELETE'), '78. runtime confirms grade performance writes are RPC-only');
select extensions.ok(not has_function_privilege('anon', 'public.get_results_calculation_readiness(uuid,uuid)', 'EXECUTE'), '79. anonymous readiness access is denied');
select extensions.ok(not has_function_privilege('anon', 'public.list_result_grade_subject_performance(uuid)', 'EXECUTE'), '80. anonymous grade performance access is denied');
select extensions.ok(pg_has_role(current_user, 'postgres', 'member'), '81. assertions execute in the database test role');
select extensions.ok((select count(*) = 6 from public.result_calculation_sources where calculation_run_id = (select id from public.result_calculation_runs where term_id = 'r4100000-0000-4000-8000-000000000001') and curriculum_sort_order between 1 and 3), '82. curriculum ordering is snapshotted');
select extensions.ok((select count(*) = 6 from public.result_calculation_sources where mark_sheet_version = 1), '83. source revision is snapshotted');
select extensions.ok((select count(*) = 5 from public.calculated_component_explanations where entered_score is not null), '84. present mark scores are retained in explanations');
select extensions.ok((select count(*) = 4 from public.calculated_subject_results where has_exemption), '85. exemption flags are retained');
select extensions.ok((select count(*) = 0 from public.calculated_subject_results where subject_status = 'COMPLETE' and subject_score is null), '86. complete subjects have scores');
select extensions.ok((select count(*) = 4 from public.calculated_subject_results where subject_status = 'EXEMPTED' and subject_score is null), '87. exempted subjects do not invent scores');
select extensions.ok((select count(*) = 1 from public.calculated_subject_results where subject_status = 'INCOMPLETE' and subject_score is null), '88. incomplete subject remains unscored');
select extensions.ok((select count(*) = 4 from public.calculated_student_results where class_position is not null), '89. class positions are calculated');
select extensions.ok((select count(*) = 4 from public.calculated_student_results where grade_level_position is not null), '90. grade positions are calculated');
select extensions.ok((select count(*) = 0 from public.calculated_student_results where class_is_tied), '91. class tie flags remain false without overall ties');
select extensions.ok((select count(*) = 0 from public.calculated_student_results where grade_level_is_tied), '92. grade-wide tie flags remain false without overall ties');
select extensions.ok((select count(*) = 1 from public.calculated_subject_results where subject_id = 'r4400000-0000-4000-8000-000000000001' and subject_position = 2), '93. class-scoped subject ordinal has a second position');
select extensions.ok((select count(*) = 1 from public.calculated_subject_results where subject_id = 'r4400000-0000-4000-8000-000000000001' and subject_score = 0), '94. absent-style zero score is not conflated with missing score');
select extensions.ok((select count(*) = 1 from public.calculated_grade_subject_performance where grade_distribution ? 'A'), '95. grade performance contains grade distribution');
select extensions.ok((select count(*) = 3 from public.calculated_grade_subject_performance where grade_distribution is not null), '96. every grade performance row has distribution json');
select extensions.ok((select count(*) = 6 from public.calculated_subject_performance where pass_rate is not null), '97. class performance contains pass rates');
select extensions.ok((select count(*) = 3 from public.calculated_grade_subject_performance where created_at is not null), '98. grade performance rows are timestamped');
select extensions.ok((select count(*) = 1 from public.result_calculation_runs where supersedes_run_id is null), '99. first run has no predecessor');
select extensions.ok((select count(*) = 0 from public.result_calculation_runs where supersedes_run_id is not null), '100. reuse creates no successor');

select * from extensions.finish();
rollback;
