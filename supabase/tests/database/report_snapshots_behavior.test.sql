begin;

select extensions.no_plan();

-- A complete transaction-scoped Stage 11 source is used here so these are
-- runtime assertions against the real snapshot RPCs, not only catalog checks.
insert into public.schools (id, name, slug, school_code)
values ('c1000000-0000-4000-8000-000000000001', 'Snapshot Behavior School', 'snapshot-behavior-school', 'SBT-PGTAP');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'c1100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'snapshot.behavior.admin@example.invalid',
  extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.profiles (id, first_name, last_name)
values ('c1100000-0000-4000-8000-000000000001', 'Snapshot', 'Behavior Admin');
insert into public.school_staff_memberships (id, school_id, profile_id, employee_number, status)
values ('c1200000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', 'SBT-ADMIN', 'ACTIVE');
insert into public.staff_role_assignments (id, membership_id, role, granted_at)
values ('c1300000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001', 'SCHOOL_ADMIN', now() - interval '1 day');

insert into public.academic_years (id, school_id, name, starts_on, ends_on, status)
values ('c1400000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Snapshot Behavior Year', '2046-01-01', '2046-12-31', 'ACTIVE');
insert into public.terms (id, academic_year_id, name, term_number, starts_on, ends_on, status)
values ('c1500000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001', 'Snapshot Behavior Term', 1, '2046-01-01', '2046-06-30', 'MARKS_ENTRY');
insert into public.grade_levels (id, school_id, code, name, sort_order)
values ('c1600000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'SBT', 'Snapshot Behavior Grade', 1);
insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code)
values ('c1700000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001', 'Snapshot Behavior Class', 'SBT-A');
insert into public.subjects (id, school_id, code, name, sort_order)
values ('c1800000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'SBS', 'Snapshot Behavior Subject', 1);
insert into public.grade_level_subjects (id, grade_level_id, subject_id, sort_order)
values ('c1900000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 1);
insert into public.assessment_schemes (id, term_id, grade_level_id, subject_id, name, status, effective_from, created_by)
values ('c1a00000-0000-4000-8000-000000000001', 'c1500000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'Snapshot Behavior Scheme', 'DRAFT', '2046-01-01', 'c1200000-0000-4000-8000-000000000001');
insert into public.assessment_components (id, assessment_scheme_id, name, component_code, maximum_score, weight_percentage, sort_order)
values ('c1b00000-0000-4000-8000-000000000001', 'c1a00000-0000-4000-8000-000000000001', 'Exam', 'EXAM', 100, 100, 1);
update public.assessment_schemes set status = 'ACTIVE' where id = 'c1a00000-0000-4000-8000-000000000001';
insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values ('c1c00000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'SBT-001', 'Frozen', 'Behavior Student', '2046-01-02');
insert into public.enrollments (id, student_id, academic_year_id, class_section_id, enrolled_on)
values ('c1d00000-0000-4000-8000-000000000001', 'c1c00000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', '2046-01-02');
insert into public.teaching_assignments (id, term_id, class_section_id, subject_id, staff_membership_id, starts_on)
values ('c1e00000-0000-4000-8000-000000000001', 'c1500000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001', '2046-01-02');
insert into public.mark_sheets (id, term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id)
values ('c1f00000-0000-4000-8000-000000000001', 'c1500000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'c1a00000-0000-4000-8000-000000000001', 'c1e00000-0000-4000-8000-000000000001');
insert into public.grading_scales (id, school_id, academic_year_id, grade_level_id, name, effective_from, created_by)
values ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001', 'Snapshot Behavior Scale', '2046-01-02', 'c1200000-0000-4000-8000-000000000001');
insert into public.ranking_rules (id, school_id, academic_year_id, grade_level_id, name, ranking_basis, tie_method, configuration, is_active, created_by)
values ('c2100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001', 'Snapshot Behavior Ranking', 'AVERAGE', 'DENSE', '{}', true, 'c1200000-0000-4000-8000-000000000001');

insert into public.result_calculation_runs (id, term_id, grade_level_id, version, supersedes_run_id, grading_scale_id, ranking_rule_id, input_checksum, output_checksum, created_by)
values ('c2200000-0000-4000-8000-000000000001', 'c1500000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001', 1, null, 'c2000000-0000-4000-8000-000000000001', 'c2100000-0000-4000-8000-000000000001', repeat('a', 64), repeat('b', 64), 'c1200000-0000-4000-8000-000000000001');
insert into public.result_calculation_sources (id, calculation_run_id, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id, grade_level_subject_id, curriculum_is_required, curriculum_contributes_to_aggregate, curriculum_sort_order)
values ('c2300000-0000-4000-8000-000000000001', 'c2200000-0000-4000-8000-000000000001', 'c1f00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 1, 'c1a00000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-000000000001', true, true, 1);
insert into public.calculated_student_results (id, calculation_run_id, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied)
values ('c2400000-0000-4000-8000-000000000001', 'c2200000-0000-4000-8000-000000000001', 'c1d00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 1, 1, 1, 88, 88, 'A', 3, 'Advanced', true, true, 88, 1, 1, 1, 1, false, false);
insert into public.calculated_subject_results (id, calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied)
values ('c2500000-0000-4000-8000-000000000001', 'c2200000-0000-4000-8000-000000000001', 'c1d00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'c1f00000-0000-4000-8000-000000000001', 'COMPLETE', 88, 'A', 3, true, 100, false, false, 1, 1, false);

select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets
set workflow_status = 'LOCKED', locked_by = 'c1200000-0000-4000-8000-000000000001', locked_at = now()
where id = 'c1f00000-0000-4000-8000-000000000001';
select set_config('app.term_marks_workflow_transition', 'allowed', true);
update public.terms
set status = 'LOCKED'
where id = 'c1500000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"c2600000-0000-4000-8000-000000000001"}', true);
select public.set_my_active_membership('c1200000-0000-4000-8000-000000000001');

select extensions.lives_ok($$select * from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')$$, 'B01. readiness can inspect a valid Stage 11 run');
select extensions.is((select student_population::integer from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), 1, 'B02. readiness counts the calculated population');
select extensions.is((select eligible_student_count::integer from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), 1, 'B03. valid source is eligible');
select extensions.is((select existing_report_snapshots::integer from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), 0, 'B04. no report exists before generation');
select extensions.is((select missing_report_snapshots::integer from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), 1, 'B05. readiness reports one missing snapshot');
select extensions.ok((select ready from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), 'B06. a populated valid source is ready');
select extensions.is((select result_input_checksum from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), repeat('a', 64), 'B07. readiness exposes the input checksum');
select extensions.is((select result_output_checksum from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), repeat('b', 64), 'B08. readiness exposes the output checksum');

select * into temporary table snapshot_behavior_generation
from public.generate_student_report_snapshot('c2200000-0000-4000-8000-000000000001', 'c1d00000-0000-4000-8000-000000000001');
select extensions.is((select report_version from snapshot_behavior_generation), 1, 'B09. first generation is report version one');
select extensions.ok(not (select reused from snapshot_behavior_generation), 'B10. first generation is not reuse');
select extensions.is((select count(*)::integer from public.reports where calculation_run_id = 'c2200000-0000-4000-8000-000000000001'), 1, 'B11. one report is persisted');
select extensions.is((select count(*)::integer from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), 1, 'B12. one immutable snapshot is persisted');
select extensions.is((select count(*)::integer from public.report_subject_results where report_id = (select report_id from snapshot_behavior_generation)), 1, 'B13. one subject row is frozen');
select extensions.is((select count(*)::integer from public.report_snapshot_sources where report_id = (select report_id from snapshot_behavior_generation)), 1, 'B14. one calculation source is linked');
select extensions.is((select report_id from public.report_snapshot_sources where report_id = (select report_id from snapshot_behavior_generation)), (select report_id from snapshot_behavior_generation), 'B15. lineage points to the generated report');
select extensions.is((select calculation_run_id from public.report_snapshot_sources where report_id = (select report_id from snapshot_behavior_generation)), 'c2200000-0000-4000-8000-000000000001'::uuid, 'B16. lineage preserves the calculation run');
select extensions.is((select calculated_student_result_id from public.report_snapshot_sources where report_id = (select report_id from snapshot_behavior_generation)), 'c2400000-0000-4000-8000-000000000001'::uuid, 'B17. lineage preserves the calculated learner result');
select extensions.is((select input_checksum from public.report_snapshot_sources where report_id = (select report_id from snapshot_behavior_generation)), repeat('a', 64), 'B18. lineage preserves input checksum');
select extensions.is((select output_checksum from public.report_snapshot_sources where report_id = (select report_id from snapshot_behavior_generation)), repeat('b', 64), 'B19. lineage preserves output checksum');
select extensions.is((select snapshot_schema_version from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), 1, 'B20. snapshot schema version is frozen');
select extensions.is((select length(snapshot_checksum)::integer from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), 64, 'B21. snapshot checksum is SHA-256 length');
select extensions.is((select length(snapshot_context_checksum)::integer from public.reports where id = (select report_id from snapshot_behavior_generation)), 64, 'B22. report context checksum is stored');
select extensions.is((select snapshot_checksum from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), (select snapshot_context_checksum from public.reports where id = (select report_id from snapshot_behavior_generation)), 'B23. report and snapshot context checksums agree');
select extensions.is((select source_checksum from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), repeat('a', 64), 'B24. snapshot source checksum is the Stage 11 input checksum');
select extensions.is((select status::text from public.reports where id = (select report_id from snapshot_behavior_generation)), 'GENERATED', 'B25. generated report status is explicit');
select extensions.is((select calculation_run_id from public.reports where id = (select report_id from snapshot_behavior_generation)), 'c2200000-0000-4000-8000-000000000001'::uuid, 'B26. report stores calculation lineage');
select extensions.is((select version from public.reports where id = (select report_id from snapshot_behavior_generation)), 1, 'B27. report stores its sequence version');
select extensions.is((select subject_name from public.report_subject_results where report_id = (select report_id from snapshot_behavior_generation)), 'Snapshot Behavior Subject', 'B28. subject name is frozen');
select extensions.is((select subject_score from public.report_subject_results where report_id = (select report_id from snapshot_behavior_generation)), 88::numeric, 'B29. subject score is frozen');
select extensions.is((select subject_status::text from public.report_subject_results where report_id = (select report_id from snapshot_behavior_generation)), 'COMPLETE', 'B30. subject status is frozen');
select extensions.is((select sort_order from public.report_subject_results where report_id = (select report_id from snapshot_behavior_generation)), 1, 'B31. curriculum order is frozen');
select extensions.is((select snapshot_data->'school'->>'name' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), 'Snapshot Behavior School', 'B32. school identity is in the payload');
select extensions.is((select snapshot_data->'student'->>'display_name' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), 'Frozen Behavior Student', 'B33. student identity is in the payload');
select extensions.is((select snapshot_data->'academic_summary'->>'overall_average' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), '88.00', 'B34. calculated summary is in the payload');
select extensions.is((select snapshot_data->'placement'->>'class_code' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), 'SBT-A', 'B35. placement is in the payload');
select extensions.is((select snapshot_data->'signatories'->>'head_teacher' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), null, 'B36. head teacher is not falsely inferred');
select extensions.is((select snapshot_data->>'attendance' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), null, 'B37. missing attendance remains null');
select extensions.is((select snapshot_data->>'comments' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), null, 'B38. missing comments remain null');
select extensions.is((select snapshot_data->>'next_term' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), null, 'B39. absent next term remains null');

select extensions.ok((select ready from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), 'B40. generated source remains ready');
select extensions.is((select existing_report_snapshots::integer from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), 1, 'B41. readiness counts one persisted snapshot');
select extensions.is((select missing_report_snapshots::integer from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000001')), 0, 'B42. readiness reports no missing snapshot');
select * into temporary table snapshot_behavior_reuse
from public.generate_student_report_snapshot('c2200000-0000-4000-8000-000000000001', 'c1d00000-0000-4000-8000-000000000001');
select extensions.ok((select reused from snapshot_behavior_reuse), 'B43. exact context is reused');
select extensions.is((select report_version from snapshot_behavior_reuse), 1, 'B44. reuse returns the original version');
select extensions.is((select count(*)::integer from public.reports where calculation_run_id = 'c2200000-0000-4000-8000-000000000001'), 1, 'B45. reuse creates no duplicate report');
select extensions.is((select count(*)::integer from public.report_snapshot_sources where calculation_run_id = 'c2200000-0000-4000-8000-000000000001'), 1, 'B46. reuse creates no duplicate lineage');
select extensions.is((select completed_reports from public.report_batches where calculation_run_id = 'c2200000-0000-4000-8000-000000000001'), 1, 'B47. batch completion counts distinct enrollments');
select extensions.is((select total_reports from public.report_batches where calculation_run_id = 'c2200000-0000-4000-8000-000000000001'), 1, 'B48. batch total equals source population');
select extensions.is((select status::text from public.report_batches where calculation_run_id = 'c2200000-0000-4000-8000-000000000001'), 'COMPLETED', 'B49. single generation completes its batch');

reset role;
update public.schools set name = 'Live School Mutation' where id = 'c1000000-0000-4000-8000-000000000001';
update public.students set first_name = 'Live' where id = 'c1c00000-0000-4000-8000-000000000001';
update public.subjects set name = 'Live Subject Mutation' where id = 'c1800000-0000-4000-8000-000000000001';
select extensions.is((select snapshot_data->'school'->>'name' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), 'Snapshot Behavior School', 'B50. school mutation cannot change the snapshot');
select extensions.is((select snapshot_data->'student'->>'display_name' from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)), 'Frozen Behavior Student', 'B51. student mutation cannot change the snapshot');
select extensions.is((select subject_name from public.report_subject_results where report_id = (select report_id from snapshot_behavior_generation)), 'Snapshot Behavior Subject', 'B52. subject mutation cannot change the snapshot');
select extensions.throws_ok($$update public.reports set status = 'DRAFT' where id = (select report_id from snapshot_behavior_generation)$$, '55000', null, 'B53. generated report mutation is rejected');
select extensions.throws_ok($$update public.report_snapshots set snapshot_data = '{}'::jsonb where report_id = (select report_id from snapshot_behavior_generation)$$, '55000', null, 'B54. snapshot mutation is rejected');
select extensions.throws_ok($$update public.report_subject_results set subject_name = 'Tampered' where report_id = (select report_id from snapshot_behavior_generation)$$, '55000', null, 'B55. subject snapshot mutation is rejected');
select extensions.throws_ok($$delete from public.report_snapshot_sources where report_id = (select report_id from snapshot_behavior_generation)$$, '55000', null, 'B56. lineage deletion is rejected');

insert into public.result_calculation_runs (id, term_id, grade_level_id, version, supersedes_run_id, grading_scale_id, ranking_rule_id, input_checksum, output_checksum, created_by)
values ('c2200000-0000-4000-8000-000000000002', 'c1500000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001', 2, null, 'c2000000-0000-4000-8000-000000000001', 'c2100000-0000-4000-8000-000000000001', repeat('c', 64), repeat('d', 64), 'c1200000-0000-4000-8000-000000000001');
insert into public.result_calculation_sources (id, calculation_run_id, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id, grade_level_subject_id, curriculum_is_required, curriculum_contributes_to_aggregate, curriculum_sort_order)
values ('c2300000-0000-4000-8000-000000000002', 'c2200000-0000-4000-8000-000000000002', 'c1f00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 1, 'c1a00000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-000000000001', true, true, 1);
insert into public.calculated_student_results (id, calculation_run_id, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied)
values ('c2400000-0000-4000-8000-000000000002', 'c2200000-0000-4000-8000-000000000002', 'c1d00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 1, 1, 1, 90, 90, 'A', 3, 'Advanced', true, true, 90, 1, 1, 1, 1, false, false);
insert into public.calculated_subject_results (id, calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied)
values ('c2500000-0000-4000-8000-000000000002', 'c2200000-0000-4000-8000-000000000002', 'c1d00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'c1f00000-0000-4000-8000-000000000001', 'COMPLETE', 90, 'A', 3, true, 100, false, false, 1, 1, false);

set local role authenticated;
select extensions.throws_ok($$select * from public.generate_student_report_snapshot('c2200000-0000-4000-8000-000000000002', 'c1d00000-0000-4000-8000-000000000001')$$, '55000', 'REPORT_CALCULATION_LINEAGE_INVALID', 'B57. unrelated calculation cannot supersede a report');
select extensions.is((select count(*)::integer from public.reports where calculation_run_id = 'c2200000-0000-4000-8000-000000000002'), 0, 'B58. rejected lineage leaves no report');
select extensions.is((select count(*)::integer from public.report_batches where calculation_run_id = 'c2200000-0000-4000-8000-000000000002'), 0, 'B59. rejected lineage leaves no batch');

reset role;
insert into public.result_calculation_runs (id, term_id, grade_level_id, version, supersedes_run_id, grading_scale_id, ranking_rule_id, input_checksum, output_checksum, created_by)
values ('c2200000-0000-4000-8000-000000000003', 'c1500000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001', 3, 'c2200000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'c2100000-0000-4000-8000-000000000001', repeat('e', 64), repeat('f', 64), 'c1200000-0000-4000-8000-000000000001');
insert into public.result_calculation_sources (id, calculation_run_id, mark_sheet_id, class_section_id, subject_id, mark_sheet_version, assessment_scheme_id, grade_level_subject_id, curriculum_is_required, curriculum_contributes_to_aggregate, curriculum_sort_order)
values ('c2300000-0000-4000-8000-000000000003', 'c2200000-0000-4000-8000-000000000003', 'c1f00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 1, 'c1a00000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-000000000001', true, true, 1);
insert into public.calculated_student_results (id, calculation_run_id, enrollment_id, class_section_id, subject_count, complete_subject_count, subjects_passed, overall_total, overall_average, overall_grade, aggregate_total, aggregate_classification, is_complete, ranking_eligible, ranking_metric, class_position, grade_level_position, class_tie_size, grade_level_tie_size, class_is_tied, grade_level_is_tied)
values ('c2400000-0000-4000-8000-000000000003', 'c2200000-0000-4000-8000-000000000003', 'c1d00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 1, 1, 1, 90, 90, 'A', 3, 'Advanced', true, true, 90, 1, 1, 1, 1, false, false);
insert into public.calculated_subject_results (id, calculation_run_id, enrollment_id, class_section_id, subject_id, mark_sheet_id, subject_status, subject_score, grade, aggregate_points, is_pass, assessed_weight, has_absence, has_exemption, subject_position, subject_tie_size, subject_is_tied)
values ('c2500000-0000-4000-8000-000000000003', 'c2200000-0000-4000-8000-000000000003', 'c1d00000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000001', 'c1f00000-0000-4000-8000-000000000001', 'COMPLETE', 90, 'A', 3, true, 100, false, false, 1, 1, false);
set local role authenticated;
select extensions.lives_ok($$select * from public.generate_student_report_snapshot('c2200000-0000-4000-8000-000000000003', 'c1d00000-0000-4000-8000-000000000001')$$, 'B60. direct successor calculation can create the next report');
select extensions.is((select count(*)::integer from public.reports where term_id = 'c1500000-0000-4000-8000-000000000001'), 2, 'B61. direct successor creates one new version');
select extensions.is((select max(version) from public.reports where term_id = 'c1500000-0000-4000-8000-000000000001'), 2, 'B62. successor report version increments');
select extensions.is((select count(*)::integer from public.reports where superseded_by is not null), 1, 'B63. prior report is superseded exactly once');
select extensions.is((select count(*)::integer from public.get_student_report_history('c1d00000-0000-4000-8000-000000000001', 'c1500000-0000-4000-8000-000000000001')), 2, 'B64. history returns both immutable versions');
select extensions.is((select count(*)::integer from public.report_snapshot_sources where calculation_run_id = 'c2200000-0000-4000-8000-000000000003'), 1, 'B65. successor has one source lineage row');
select extensions.is((select count(*)::integer from public.report_subject_results where report_id = (select id from public.reports where calculation_run_id = 'c2200000-0000-4000-8000-000000000003')), 1, 'B66. successor freezes its subject rows');
select extensions.ok((select report_id = (select id from public.reports where calculation_run_id = 'c2200000-0000-4000-8000-000000000003') from public.report_snapshot_sources where calculation_run_id = 'c2200000-0000-4000-8000-000000000003'), 'B67. successor lineage points to successor report');
select extensions.ok((select snapshot_checksum is distinct from (select snapshot_checksum from public.report_snapshots where report_id = (select report_id from snapshot_behavior_generation)) from public.report_snapshots where report_id = (select id from public.reports where calculation_run_id = 'c2200000-0000-4000-8000-000000000003')), 'B68. distinct calculation output has a distinct context checksum');
select extensions.is((select count(*)::integer from public.audit_logs where action = 'REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id' in ('c2200000-0000-4000-8000-000000000001','c2200000-0000-4000-8000-000000000003')), 2, 'B69. only real creations emit snapshot audits');
select extensions.is((select latest_report_versions->>'c1d00000-0000-4000-8000-000000000001' from public.get_report_generation_readiness('c2200000-0000-4000-8000-000000000003')), '2', 'B70. readiness exposes latest report version');
select extensions.is((select count(*)::integer from public.list_generated_reports('c2200000-0000-4000-8000-000000000003')), 1, 'B71. report list is scoped to the selected run');
select extensions.is((select count(*)::integer from public.get_report_subject_results((select id from public.reports where calculation_run_id = 'c2200000-0000-4000-8000-000000000003'))), 1, 'B72. subject reader returns the frozen successor row');

select * from extensions.finish();
rollback;
