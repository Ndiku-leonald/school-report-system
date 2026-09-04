begin;

select plan(44);

-- This fixture is deliberately small but complete enough to exercise the live
-- Stage 16 read functions. It represents persisted Stage 11 output; no
-- analytics table or recalculation path is used by these assertions.
insert into public.schools (id, name, slug, school_code) values
  ('f1000000-0000-4000-8000-000000000001', 'Analytics Behaviour School', 'analytics-behaviour-school', 'ANALYTICS-BEHAVIOUR'),
  ('f1000000-0000-4000-8000-000000000002', 'Other Analytics School', 'other-analytics-school', 'ANALYTICS-OTHER');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('f2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'analytics-behaviour@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles (id, first_name, last_name)
values ('f2000000-0000-4000-8000-000000000001', 'Analytics', 'Reader');
insert into public.school_staff_memberships (id, school_id, profile_id, employee_number, status)
values ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001', 'ANALYTICS-BEHAVIOUR-ADMIN', 'ACTIVE');
insert into public.staff_role_assignments (id, membership_id, role, granted_at)
values ('f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'SCHOOL_ADMIN', now() - interval '1 day');

insert into public.academic_years (id, school_id, name, starts_on, ends_on, status)
values
  ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Analytics Behaviour Year', '2042-01-01', '2042-12-31', 'ACTIVE'),
  ('f4000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'Other Year', '2042-01-01', '2042-12-31', 'ACTIVE');
insert into public.terms (id, academic_year_id, name, term_number, starts_on, ends_on, status)
values
  ('f4100000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'Analytics Behaviour Term', 1, '2042-01-01', '2042-06-30', 'MARKS_ENTRY'),
  ('f4100000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000002', 'Other Term', 1, '2042-01-01', '2042-06-30', 'LOCKED');
insert into public.grade_levels (id, school_id, code, name, sort_order)
values
  ('f4200000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'ABA', 'Analytics Grade A', 1),
  ('f4200000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'ABB', 'Analytics Grade B', 2),
  ('f4200000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'ABC', 'Unused Active Grade', 3),
  ('f4200000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000002', 'OB', 'Other Grade', 1);
insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code)
values
  ('f4300000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Analytics Class A', 'ABA-A'),
  ('f4300000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000002', 'Analytics Class B', 'ABB-A'),
  ('f4300000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000002', 'f4200000-0000-4000-8000-000000000004', 'Other Class', 'OB-A');
insert into public.subjects (id, school_id, code, name, sort_order)
values ('f4400000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'AB-SUB', 'Analytics Subject', 1);
insert into public.grade_level_subjects (id, grade_level_id, subject_id, is_required, contributes_to_aggregate, sort_order)
values
  ('f4500000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', true, true, 1),
  ('f4500000-0000-4000-8000-000000000002', 'f4200000-0000-4000-8000-000000000002', 'f4400000-0000-4000-8000-000000000001', true, true, 1);

insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values
  ('f4600000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'ABA-002', 'Tie', 'Two', '2042-01-02'),
  ('f4600000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'ABA-001', 'Tie', 'One', '2042-01-02'),
  ('f4600000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'ABA-010', 'Cutoff', 'Three', '2042-01-02'),
  ('f4600000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'ABA-011', 'Cutoff', 'Four', '2042-01-02'),
  ('f4600000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'ABA-099', 'Incomplete', 'Five', '2042-01-02');
insert into public.enrollments (id, student_id, academic_year_id, class_section_id, enrolled_on)
values
  ('f4700000-0000-4000-8000-000000000001', 'f4600000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', '2042-01-02'),
  ('f4700000-0000-4000-8000-000000000002', 'f4600000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', '2042-01-02'),
  ('f4700000-0000-4000-8000-000000000003', 'f4600000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', '2042-01-02'),
  ('f4700000-0000-4000-8000-000000000004', 'f4600000-0000-4000-8000-000000000004', 'f4000000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', '2042-01-02'),
  ('f4700000-0000-4000-8000-000000000005', 'f4600000-0000-4000-8000-000000000005', 'f4000000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', '2042-01-02');

insert into public.teaching_assignments (id, term_id, class_section_id, subject_id, staff_membership_id, starts_on)
values ('f4800000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', '2042-01-02');
insert into public.assessment_schemes (id, term_id, grade_level_id, subject_id, name, status, effective_from, created_by)
values ('f4900000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'Analytics Scheme', 'DRAFT', '2042-01-02', 'f3000000-0000-4000-8000-000000000001');
insert into public.assessment_components (id, assessment_scheme_id, name, component_code, maximum_score, weight_percentage, sort_order)
values ('f4a00000-0000-4000-8000-000000000001', 'f4900000-0000-4000-8000-000000000001', 'Analytics Exam', 'AB-EXAM', 100, 100, 1);
update public.assessment_schemes set status = 'ACTIVE'
where id = 'f4900000-0000-4000-8000-000000000001';
insert into public.mark_sheets (id, term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id)
values ('f4b00000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4900000-0000-4000-8000-000000000001', 'f4800000-0000-4000-8000-000000000001');
select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets set workflow_status = 'LOCKED', locked_by = 'f3000000-0000-4000-8000-000000000001', locked_at = now()
where id = 'f4b00000-0000-4000-8000-000000000001';

insert into public.grading_scales (id, school_id, academic_year_id, grade_level_id, name, version, is_active, effective_from, created_by)
values ('f4d00000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Duplicate Grade Labels', 1, false, '2042-01-02', 'f3000000-0000-4000-8000-000000000001');
insert into public.grading_bands (grading_scale_id, minimum_score, maximum_score, grade, aggregate_points, is_pass, sort_order)
values
  ('f4d00000-0000-4000-8000-000000000001', 0, 49, 'B', 1, false, 1),
  ('f4d00000-0000-4000-8000-000000000001', 50, 79, 'A', 2, true, 2),
  ('f4d00000-0000-4000-8000-000000000001', 80, 100, 'A', 3, true, 3);
update public.grading_scales set is_active = true
where id = 'f4d00000-0000-4000-8000-000000000001';
insert into public.ranking_rules (id, school_id, academic_year_id, grade_level_id, name, version, ranking_basis, tie_method, configuration, is_active, created_by)
values ('f4e00000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Analytics Ranking', 1, 'AVERAGE', 'DENSE', '{"direction":"DESC","include_incomplete":true,"minimum_subjects":1}', true, 'f3000000-0000-4000-8000-000000000001');
insert into public.aggregate_classification_scales (id, school_id, academic_year_id, grade_level_id, name, version, is_active, created_by)
values ('f4f00000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Duplicate Classification Labels', 1, false, 'f3000000-0000-4000-8000-000000000001');
insert into public.aggregate_classification_bands (scale_id, minimum_aggregate, maximum_aggregate, label, sort_order)
values
  ('f4f00000-0000-4000-8000-000000000001', 0, 2, 'Good', 1),
  ('f4f00000-0000-4000-8000-000000000001', 3, 5, 'Good', 2),
  ('f4f00000-0000-4000-8000-000000000001', 6, 10, 'Needs support', 3);
update public.aggregate_classification_scales set is_active = true
where id = 'f4f00000-0000-4000-8000-000000000001';

insert into public.grading_scales (id, school_id, academic_year_id, grade_level_id, name, version, is_active, effective_from)
values ('f4d00000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000002', 'f4200000-0000-4000-8000-000000000004', 'Other Scale', 1, true, '2042-01-02');
insert into public.ranking_rules (id, school_id, academic_year_id, grade_level_id, name, version, ranking_basis, tie_method, configuration, is_active)
values ('f4e00000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000002', 'f4200000-0000-4000-8000-000000000004', 'Other Ranking', 1, 'AVERAGE', 'DENSE', '{"direction":"DESC","minimum_subjects":1}', true);

select set_config('app.term_marks_workflow_transition', 'allowed', true);
update public.terms set status = 'LOCKED' where id = 'f4100000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f2100000-0000-4000-8000-000000000001"}', true);
insert into internal.staff_session_active_memberships (session_id, profile_id, membership_id)
values ('f2100000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001');

insert into public.result_calculation_runs (id, term_id, grade_level_id, version, grading_scale_id, ranking_rule_id,
  aggregate_classification_scale_id, input_checksum, output_checksum, created_by)
values ('f4c00000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 1,
  'f4d00000-0000-4000-8000-000000000001', 'f4e00000-0000-4000-8000-000000000001', 'f4f00000-0000-4000-8000-000000000001',
  internal.results_input_checksum('f4100000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'f4d00000-0000-4000-8000-000000000001', 'f4e00000-0000-4000-8000-000000000001', 'f4f00000-0000-4000-8000-000000000001'),
  repeat('a', 64), 'f3000000-0000-4000-8000-000000000001');

insert into public.calculated_student_results (id, calculation_run_id, enrollment_id, class_section_id, subject_count, complete_subject_count,
  subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible,
  ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied)
values
  ('f5100000-0000-4000-8000-000000000001', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 1, 1, 1, 95, 95, 'A', 1, 'Good', true, true, 95, 1, 1, 2, 2, true, true),
  ('f5100000-0000-4000-8000-000000000002', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000002', 'f4300000-0000-4000-8000-000000000001', 1, 1, 1, 95, 95, 'A', 2, 'Good', true, true, 95, 1, 1, 2, 2, true, true),
  ('f5100000-0000-4000-8000-000000000003', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000003', 'f4300000-0000-4000-8000-000000000001', 1, 1, 1, 70, 70, 'A', 6, 'Needs support', true, true, 70, 2, 2, 2, 2, true, true),
  ('f5100000-0000-4000-8000-000000000004', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000004', 'f4300000-0000-4000-8000-000000000001', 1, 1, 1, 70, 70, 'A', 6, 'Needs support', true, true, 70, 2, 2, 2, 2, true, true),
  ('f5100000-0000-4000-8000-000000000005', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000005', 'f4300000-0000-4000-8000-000000000001', 1, 0, 0, null, null, null, null, null, false, false, null, null, null, 0, 0, false, false);
insert into public.calculated_subject_results (id, calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id,
  subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption)
values
  ('f5200000-0000-4000-8000-000000000001', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4b00000-0000-4000-8000-000000000001', 'COMPLETE', 95, 'A', 1, true, 100, false, false),
  ('f5200000-0000-4000-8000-000000000002', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000002', 'f4300000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4b00000-0000-4000-8000-000000000001', 'COMPLETE', 95, 'A', 2, true, 100, false, false),
  ('f5200000-0000-4000-8000-000000000003', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000003', 'f4300000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4b00000-0000-4000-8000-000000000001', 'COMPLETE', 70, 'A', 6, false, 100, false, false),
  ('f5200000-0000-4000-8000-000000000004', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000004', 'f4300000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4b00000-0000-4000-8000-000000000001', 'COMPLETE', 70, 'A', 6, false, 100, false, false),
  ('f5200000-0000-4000-8000-000000000005', 'f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000005', 'f4300000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4b00000-0000-4000-8000-000000000001', 'INCOMPLETE', null, null, null, null, 0, false, false);
insert into public.calculated_grade_subject_performance (calculation_run_id, subject_id, mean_score, minimum_score, maximum_score, pass_rate, complete_count, incomplete_count, exempted_count, grade_distribution)
values ('f4c00000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 82, 70, 95, 50, 4, 1, 0, '{"A":4}'::jsonb);

select extensions.is((select count(*) from public.list_analytics_scopes()), 2::bigint, 'eligible scope list excludes the active grade with no class');
select extensions.ok(not exists (select 1 from public.list_analytics_scopes() where grade_level_id = 'f4200000-0000-4000-8000-000000000003'), 'unused active grade is absent from scope list');
select extensions.ok(exists (select 1 from public.list_analytics_scopes() where grade_level_id = 'f4200000-0000-4000-8000-000000000002'), 'real curriculumless class scope remains visible');
select extensions.is((select readiness_state from public.list_analytics_scopes() where grade_level_id = 'f4200000-0000-4000-8000-000000000002'), 'NO_RUN', 'unavailable real scope is explicit');
select extensions.is((select readiness_state from public.list_analytics_scopes() where grade_level_id = 'f4200000-0000-4000-8000-000000000001'), 'CURRENT', 'current run is accepted');

select extensions.is((select eligible_grade_count from public.get_school_analytics('f4100000-0000-4000-8000-000000000001')), 2::bigint, 'school eligible grade count is actual term-year scope count');
select extensions.is((select current_grade_count from public.get_school_analytics('f4100000-0000-4000-8000-000000000001')), 1::bigint, 'school current grade count is one');
select extensions.is((select excluded_grade_count from public.get_school_analytics('f4100000-0000-4000-8000-000000000001')), 1::bigint, 'school excluded grade count is one');
select extensions.ok((select eligible_grade_count = current_grade_count + excluded_grade_count from public.get_school_analytics('f4100000-0000-4000-8000-000000000001')), 'school coverage reconciles');
select extensions.is((select source_student_population from public.get_school_analytics('f4100000-0000-4000-8000-000000000001')), 5::bigint, 'source population uses eligible term-year grades only');

select extensions.is((select analytics_population from public.get_grade_analytics('f4c00000-0000-4000-8000-000000000001')), 5::bigint, 'grade population is five persisted results');
select extensions.is((select complete_count from public.get_grade_analytics('f4c00000-0000-4000-8000-000000000001')), 4::bigint, 'complete count is four');
select extensions.is((select incomplete_count from public.get_grade_analytics('f4c00000-0000-4000-8000-000000000001')), 1::bigint, 'incomplete count is one');
select extensions.is((select average_population_count from public.get_grade_analytics('f4c00000-0000-4000-8000-000000000001')), 4::bigint, 'null averages are excluded from denominator');
select extensions.is((select mean_overall_average from public.get_grade_analytics('f4c00000-0000-4000-8000-000000000001')), 82.5::numeric, 'mean average is deterministic');

select extensions.is((select count(*) from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'OVERALL_GRADE' and label = 'A'), 1::bigint, 'duplicate grade label returns one row');
select extensions.is((select row_count from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'OVERALL_GRADE' and label = 'A'), 4::bigint, 'duplicate grade label count is not multiplied');
select extensions.is((select sum(row_count) from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'OVERALL_GRADE'), 4::numeric, 'grade distribution reconciles to graded count');
select extensions.is((select max(distribution_population) from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'OVERALL_GRADE'), 4::bigint, 'grade denominator excludes ungraded rows');
select extensions.is((select max(ungraded_count) from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'OVERALL_GRADE'), 1::bigint, 'ungraded count remains explicit');
select extensions.is((select sort_order from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'OVERALL_GRADE' and label = 'A'), 2, 'duplicate grade display order uses minimum sort order');
select extensions.is((select count(*) from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'AGGREGATE_CLASSIFICATION' and label = 'Good'), 1::bigint, 'duplicate classification label returns one row');
select extensions.is((select row_count from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'AGGREGATE_CLASSIFICATION' and label = 'Good'), 2::bigint, 'duplicate classification count is not multiplied');
select extensions.is((select sum(row_count) from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'AGGREGATE_CLASSIFICATION'), 4::numeric, 'classification distribution reconciles to classified count');
select extensions.is((select max(unclassified_count) from public.list_analytics_distributions('f4c00000-0000-4000-8000-000000000001', null) where distribution_type = 'AGGREGATE_CLASSIFICATION'), 1::bigint, 'unclassified count remains explicit');

select extensions.is((select array_agg(admission_number order by rank_position, admission_number, enrollment_id)::text[] from public.list_analytics_top_students('f4c00000-0000-4000-8000-000000000001', null, 1)), array['ABA-001','ABA-002']::text[], 'grade top list is admission ordered inside persisted tie');
select extensions.is((select count(*) from public.list_analytics_top_students('f4c00000-0000-4000-8000-000000000001', null, 2)), 4::bigint, 'position cutoff retains every tied learner');
select extensions.is((select min(rank_position) from public.list_analytics_top_students('f4c00000-0000-4000-8000-000000000001', null, 2)), 1, 'top list preserves persisted grade positions');
select extensions.is((select max(tie_size) from public.list_analytics_top_students('f4c00000-0000-4000-8000-000000000001', null, 2)), 2, 'top list preserves persisted tie size');
select extensions.is((select array_agg(admission_number order by rank_position, admission_number, enrollment_id)::text[] from public.list_analytics_top_students('f4c00000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 2)), array['ABA-001','ABA-002','ABA-010','ABA-011']::text[], 'class top list has deterministic ordering');
select extensions.is((select count(*) from public.list_analytics_top_students('f4c00000-0000-4000-8000-000000000001', null, 0)), 2::bigint, 'bounded minimum top position retains the first persisted tie');

select extensions.is((select mean_score from public.list_analytics_subject_performance('f4c00000-0000-4000-8000-000000000001', null)), 82::numeric, 'subject mean comes from Stage 11 output');
select extensions.is((select pass_rate from public.list_analytics_subject_performance('f4c00000-0000-4000-8000-000000000001', null)), 50::numeric, 'subject pass rate comes from Stage 11 output');
select extensions.is((select subject_status::text from public.list_analytics_student_subjects('f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000005')), 'INCOMPLETE', 'incomplete subject remains factual');
select extensions.ok(exists (select 1 from public.list_analytics_attention_students('f4c00000-0000-4000-8000-000000000001', null) where enrollment_id = 'f4700000-0000-4000-8000-000000000005'), 'incomplete result appears in attention list');
select extensions.ok(not exists (select 1 from public.list_analytics_attention_students('f4c00000-0000-4000-8000-000000000001', null) where enrollment_id = 'f4700000-0000-4000-8000-000000000001'), 'fully passing learner is absent from attention list');
select extensions.ok((select string_agg(attention_reason, ' ') from public.list_analytics_attention_students('f4c00000-0000-4000-8000-000000000001', null)) !~* 'promote|repeat|retain', 'attention response has no promotion vocabulary');

select extensions.is((select count(*) from public.get_analytics_student('f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000001')), 1::bigint, 'student detail returns selected result');
select extensions.is((select count(*) from public.get_analytics_student('f4c00000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000005')), 1::bigint, 'student detail returns incomplete result');
select extensions.is((select count(*) from public.get_analytics_student('f4c00000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000099')), 0::bigint, 'student cross-scope isolation returns no row');
insert into public.result_calculation_runs (id, term_id, grade_level_id, version, grading_scale_id, ranking_rule_id, input_checksum, output_checksum)
values ('f4c00000-0000-4000-8000-000000000002', 'f4100000-0000-4000-8000-000000000002', 'f4200000-0000-4000-8000-000000000004', 1, 'f4d00000-0000-4000-8000-000000000002', 'f4e00000-0000-4000-8000-000000000002', repeat('b', 64), repeat('c', 64));
select extensions.is((select count(*) from public.get_grade_analytics('f4c00000-0000-4000-8000-000000000002')), 0::bigint, 'cross-school run is denied without disclosure');
select extensions.is((select count(*) from public.get_grade_analytics('f4c00000-0000-4000-8000-000000000001')), 1::bigint, 'repeat grade read remains deterministic');

select set_config('request.jwt.claims', '{}', true);
select extensions.throws_ok($$select * from public.list_analytics_scopes()$$, '42501', 'ANALYTICS_FORBIDDEN', 'signed-out analytics access is denied');
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"f2100000-0000-4000-8000-000000000001"}', true);
delete from public.staff_role_assignments where id = 'f3100000-0000-4000-8000-000000000001';
select extensions.throws_ok($$select * from public.list_analytics_scopes()$$, '42501', 'ANALYTICS_FORBIDDEN', 'permission denial is enforced by the database');

rollback;
