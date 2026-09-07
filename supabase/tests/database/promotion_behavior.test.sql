begin;

-- Runtime-only promotion evidence. Structural catalog/source checks remain in
-- promotion.test.sql. This suite uses synthetic fixtures and rolls them back.
select plan(50);

insert into public.schools(id,name,slug,school_code) values
 ('e1000000-0000-4000-8000-000000000001','Promotion Behaviour School','promotion-behaviour-school','PBT-A'),
 ('e1000000-0000-4000-8000-000000000002','Promotion Other School','promotion-behaviour-other-school','PBT-B');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('e1100000-0000-4000-8000-000000000001','authenticated','authenticated','promotion.behavior.admin@example.invalid',extensions.crypt('synthetic',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
 ('e1100000-0000-4000-8000-000000000002','authenticated','authenticated','promotion.behavior.registrar@example.invalid',extensions.crypt('synthetic',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
 ('e1100000-0000-4000-8000-000000000003','authenticated','authenticated','promotion.behavior.teacher@example.invalid',extensions.crypt('synthetic',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
 ('e1100000-0000-4000-8000-000000000004','authenticated','authenticated','promotion.behavior.other@example.invalid',extensions.crypt('synthetic',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
insert into public.profiles(id,first_name,last_name) values
 ('e1100000-0000-4000-8000-000000000001','Promotion','Admin'),('e1100000-0000-4000-8000-000000000002','Promotion','Registrar'),
 ('e1100000-0000-4000-8000-000000000003','Promotion','Teacher'),('e1100000-0000-4000-8000-000000000004','Promotion','Other');
insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values
 ('e1200000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000001','PBT-ADMIN','ACTIVE'),
 ('e1200000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000002','PBT-REG','ACTIVE'),
 ('e1200000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','e1100000-0000-4000-8000-000000000003','PBT-TEACHER','ACTIVE'),
 ('e1200000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000002','e1100000-0000-4000-8000-000000000004','PBT-OTHER','ACTIVE');
insert into public.staff_role_assignments(id,membership_id,role,granted_at) values
 ('e1300000-0000-4000-8000-000000000001','e1200000-0000-4000-8000-000000000001','SCHOOL_ADMIN',now()-interval '1 day'),
 ('e1300000-0000-4000-8000-000000000002','e1200000-0000-4000-8000-000000000002','ACADEMIC_REGISTRAR',now()-interval '1 day'),
 ('e1300000-0000-4000-8000-000000000003','e1200000-0000-4000-8000-000000000003','SUBJECT_TEACHER',now()-interval '1 day'),
 ('e1300000-0000-4000-8000-000000000004','e1200000-0000-4000-8000-000000000004','SCHOOL_ADMIN',now()-interval '1 day');
insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values
 ('e1400000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','Behaviour Source','2046-01-01','2046-12-31','ACTIVE'),
 ('e1400000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','Behaviour Target','2047-01-01','2047-12-31','DRAFT');
insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status,is_promotion_term) values
 ('e1500000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','Promotion Term',1,'2046-01-01','2046-06-30','MARKS_ENTRY',true),
 ('e1500000-0000-4000-8000-000000000002','e1400000-0000-4000-8000-000000000001','Ordinary Term',2,'2046-07-01','2046-12-31','MARKS_ENTRY',false);
insert into public.grade_levels(id,school_id,code,name,sort_order,is_final_grade) values
 ('e1600000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','PBT1','Behaviour Source Grade',1,false),
 ('e1600000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','PBT2','Behaviour Target Grade',2,false),
 ('e1600000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','PBT7','Behaviour Final Grade',7,true);
insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code,capacity) values
 ('e1700000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','Behaviour Source','PBT1-A',10),
 ('e1700000-0000-4000-8000-000000000002','e1400000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000002','Behaviour Target','PBT2-A',10),
 ('e1700000-0000-4000-8000-000000000003','e1400000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000003','Behaviour Final','PBT7-A',10);
insert into public.subjects(id,school_id,code,name,sort_order,is_core) values ('e1800000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','PBT-SUB','Behaviour Subject',1,true);
insert into public.grade_level_subjects(id,grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values ('e1900000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','e1800000-0000-4000-8000-000000000001',true,true,1);
insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values ('e1a00000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','e1800000-0000-4000-8000-000000000001','Behaviour Scheme','DRAFT','2046-01-01','e1200000-0000-4000-8000-000000000001');
insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values ('e1b00000-0000-4000-8000-000000000001','e1a00000-0000-4000-8000-000000000001','Exam','PBT-EXAM',100,100,1);
update public.assessment_schemes set status='ACTIVE' where id='e1a00000-0000-4000-8000-000000000001';
insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date,status) values
 ('e1c00000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','PBT-001','Behaviour','Learner','2046-01-02','ACTIVE'),
 ('e1c00000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','PBT-002','Inactive','Learner','2046-01-02','INACTIVE');
insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on,exited_on) values
 ('e1d00000-0000-4000-8000-000000000001','e1c00000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001','ACTIVE','2046-01-02',null),
 ('e1d00000-0000-4000-8000-000000000002','e1c00000-0000-4000-8000-000000000002','e1400000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001','COMPLETED','2046-01-02','2046-12-31');
insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values ('e1e00000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001','e1800000-0000-4000-8000-000000000001','e1200000-0000-4000-8000-000000000001','2046-01-02');
insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id) values ('e1f00000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001','e1800000-0000-4000-8000-000000000001','e1a00000-0000-4000-8000-000000000001','e1e00000-0000-4000-8000-000000000001');
select set_config('app.marks_workflow_transition','allowed',true);
update public.mark_sheets set workflow_status='LOCKED',locked_at=now() where id='e1f00000-0000-4000-8000-000000000001';
select set_config('app.term_marks_workflow_transition','allowed',true);
update public.terms set status='LOCKED' where id='e1500000-0000-4000-8000-000000000001';
insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,effective_from,created_by) values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','Behaviour Scale','2046-01-02','e1200000-0000-4000-8000-000000000001');
insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values ('e2000000-0000-4000-8000-000000000001',0,50,'F',1,false,1),('e2000000-0000-4000-8000-000000000001',50,100,'A',5,true,2);
update public.grading_scales set is_active=true where id='e2000000-0000-4000-8000-000000000001';
insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,ranking_basis,tie_method,configuration,is_active,created_by) values ('e2100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','Behaviour Ranking','AVERAGE','DENSE','{}',true,'e1200000-0000-4000-8000-000000000001');
insert into public.result_calculation_runs(id,term_id,grade_level_id,version,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values ('e2200000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001',1,'e2000000-0000-4000-8000-000000000001','e2100000-0000-4000-8000-000000000001',internal.results_input_checksum('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e2100000-0000-4000-8000-000000000001',null),repeat('b',64),'e1200000-0000-4000-8000-000000000001');
insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) values ('e2300000-0000-4000-8000-000000000001','e2200000-0000-4000-8000-000000000001','e1f00000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001','e1800000-0000-4000-8000-000000000001',1,'e1a00000-0000-4000-8000-000000000001','e1900000-0000-4000-8000-000000000001',true,true,1);
insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) values ('e2400000-0000-4000-8000-000000000001','e2200000-0000-4000-8000-000000000001','e1d00000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001',1,1,1,90,90,'A',5,'Ready',true,true,90,1,1,1,1,false,false);
insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) values ('e2500000-0000-4000-8000-000000000001','e2200000-0000-4000-8000-000000000001','e1d00000-0000-4000-8000-000000000001','e1700000-0000-4000-8000-000000000001','e1800000-0000-4000-8000-000000000001','e1f00000-0000-4000-8000-000000000001','COMPLETE',90,'A',5,true,100,false,false,1,1,false);
insert into public.term_attendance(id,term_id,enrollment_id,days_open,days_present,days_absent,recorded_by) values ('e2700000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','e1d00000-0000-4000-8000-000000000001',100,90,10,'e1200000-0000-4000-8000-000000000001');
insert into public.promotion_rules(id,school_id,academic_year_id,grade_level_id,name,version,minimum_average,minimum_attendance_percentage,required_subject_rules,additional_rules,is_active,created_by) values ('e2600000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001','Behaviour Rule',1,50,80,'{}','{}',true,'e1200000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"e2800000-0000-4000-8000-000000000001"}',true);
select extensions.lives_ok($$select public.set_my_active_membership('e1200000-0000-4000-8000-000000000001')$$,'B01. admin selects membership');
select extensions.is((select count(*) from public.list_promotion_scopes()),1::bigint,'B02. scope is readable');
select extensions.is((select learner_count from public.list_promotion_scopes()),1::bigint,'B03. inactive learner is excluded');
select extensions.lives_ok($$select * from public.generate_promotion_recommendations('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001')$$,'B04. generation executes');
select extensions.is((select count(*) from public.promotion_recommendation_snapshots),1::bigint,'B05. snapshot is persisted');
select extensions.is((select count(*) from public.promotion_decisions),1::bigint,'B06. decision is persisted');
select extensions.is((select system_recommendation::text from public.list_promotion_recommendations('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001')),'PROMOTED','B07. Stage 11 pass recommends promotion');
select extensions.is((select snapshot_data->'attendance'->>'attendance_percentage' from public.list_promotion_recommendations('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001')),'90.00','B08. attendance is snapshotted');
select extensions.is((select length(snapshot_checksum)::integer from public.list_promotion_recommendations('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001')),64,'B09. checksum has SHA-256 length');
select extensions.is((select snapshot_checksum from public.list_promotion_recommendations('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001')),(select snapshot_checksum from public.promotion_recommendation_snapshots limit 1),'B10. reader returns persisted checksum');
select extensions.is((select count(*) from public.list_promotion_recommendations('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001')),1::bigint,'B11. reader returns one learner');
select extensions.is((select count(*) from public.list_promotion_recommendations('e1500000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000001')),0::bigint,'B12. ordinary term returns no promotion data');
select extensions.throws_ok($$select * from public.generate_promotion_recommendations('e1500000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000001')$$,'23514','PROMOTION_TERM_REQUIRED','B13. ordinary term generation is rejected');
select extensions.throws_ok($$select * from public.confirm_promotion_decision((select id from public.promotion_decisions limit 1),99,'PROMOTED')$$,'PT409','PROMOTION_DECISION_VERSION_CONFLICT','B14. confirmation version is checked');
select extensions.lives_ok($$select * from public.confirm_promotion_decision((select id from public.promotion_decisions limit 1),1,'PROMOTED')$$,'B15. confirmation executes');
select extensions.is((select final_decision::text from public.promotion_decisions limit 1),'PROMOTED','B16. final decision is stored');
select extensions.is((select was_overridden from public.promotion_decisions limit 1),false,'B17. matching decision is not an override');
select extensions.throws_ok($$select * from public.confirm_promotion_decision((select id from public.promotion_decisions limit 1),1,'REPEAT_CONFIRMED')$$,'55000','PROMOTION_DECISION_CONFIRMED_IMMUTABLE','B18. confirmation is immutable');
select extensions.lives_ok($$select * from public.reopen_promotion_decision((select id from public.promotion_decisions where superseded_by is null),1,'Review evidence')$$,'B19. reopen executes');
select extensions.is((select max(version) from public.promotion_decisions),2,'B20. reopen increments version');
select extensions.is((select count(*) from public.promotion_decisions where superseded_by is null),1::bigint,'B21. one current decision remains');
select extensions.is((select count(*) from public.promotion_decisions where superseded_by is not null),1::bigint,'B22. prior decision is retained');
select extensions.throws_ok($$select * from public.reopen_promotion_decision((select id from public.promotion_decisions where superseded_by is null),1,'Review evidence')$$,'PT409','PROMOTION_DECISION_VERSION_CONFLICT','B23. stale reopen is rejected');
select extensions.lives_ok($$select * from public.confirm_promotion_decision((select id from public.promotion_decisions where superseded_by is null),2,'REPEAT_CONFIRMED')$$,'B24. repeat confirmation executes');
select extensions.is((select final_decision::text from public.promotion_decisions where superseded_by is null),'REPEAT_CONFIRMED','B25. repeat confirmation is human state');
select extensions.throws_ok($$select * from public.apply_student_progression((select id from public.promotion_decisions where superseded_by is null),1,'e1400000-0000-4000-8000-000000000002','e1700000-0000-4000-8000-000000000002')$$,'PT409','PROMOTION_DECISION_VERSION_CONFLICT','B26. progression version is checked');
select extensions.lives_ok($$select * from public.apply_student_progression((select id from public.promotion_decisions where superseded_by is null),2,'e1400000-0000-4000-8000-000000000002','e1700000-0000-4000-8000-000000000002')$$,'B27. progression executes');
select extensions.is((select count(*) from public.student_progressions),1::bigint,'B28. one progression is persisted');
select extensions.is((select status::text from public.enrollments where id='e1d00000-0000-4000-8000-000000000001'),'COMPLETED','B29. source enrollment closes');
select extensions.is((select status::text from public.enrollments where id=(select target_enrollment_id from public.student_progressions)),'REPEATING','B30. target enrollment is repeating');
select extensions.is((select status::text from public.students where id='e1c00000-0000-4000-8000-000000000001'),'ACTIVE','B31. learner remains active');
select extensions.ok((select application_snapshot ? 'decision_id' from public.student_progressions),'B32. application snapshot has decision');
select extensions.ok((select application_snapshot ? 'source_enrollment_id' from public.student_progressions),'B33. application snapshot has source');
select extensions.is((select length(application_checksum)::integer from public.student_progressions),64,'B34. application checksum has SHA-256 length');
select extensions.is((select application_checksum from public.student_progressions),encode(extensions.digest(application_snapshot::text,'sha256'),'hex'),'B35. application checksum matches snapshot');
select extensions.lives_ok($$select * from public.apply_student_progression((select id from public.promotion_decisions where superseded_by is null),2,'e1400000-0000-4000-8000-000000000002','e1700000-0000-4000-8000-000000000002')$$,'B36. exact retry succeeds');
select extensions.is((select count(*) from public.student_progressions),1::bigint,'B37. exact retry is idempotent');
select extensions.throws_ok($$select * from public.apply_student_progression((select id from public.promotion_decisions where superseded_by is null),2,'e1400000-0000-4000-8000-000000000002','e1700000-0000-4000-8000-000000000003')$$,'PT409','PROMOTION_PROGRESSION_RETRY_CONFLICT','B38. conflicting retry is rejected');
select extensions.is((select count(*) from public.list_promotion_decision_history('e1d00000-0000-4000-8000-000000000001')),2::bigint,'B39. history includes both versions');
select extensions.is((select learner_count from public.list_promotion_scopes()),0::bigint,'B40. completed source leaves scope');

select set_config('request.jwt.claims','{"sub":"e1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"e2800000-0000-4000-8000-000000000002"}',true);
select extensions.lives_ok($$select public.set_my_active_membership('e1200000-0000-4000-8000-000000000002')$$,'B41. registrar selects membership');
select extensions.throws_ok($$select * from public.generate_promotion_recommendations('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001')$$,'42501','PROMOTION_CONFIRM_FORBIDDEN','B42. registrar cannot generate');
select extensions.throws_ok($$select * from public.confirm_promotion_decision('00000000-0000-0000-0000-000000000001',1,'PROMOTED')$$,'42501','PROMOTION_CONFIRM_FORBIDDEN','B43. registrar cannot confirm');
select extensions.lives_ok($$select public.set_my_active_membership(null)$$,'B44. clearing membership does not leak authority');
select extensions.throws_ok($$select * from public.list_promotion_scopes()$$,'42501','PROMOTION_FORBIDDEN','B45. no selected membership cannot read');

select set_config('request.jwt.claims','{"sub":"e1100000-0000-4000-8000-000000000003","role":"authenticated","session_id":"e2800000-0000-4000-8000-000000000003"}',true);
select extensions.lives_ok($$select public.set_my_active_membership('e1200000-0000-4000-8000-000000000003')$$,'B46. subject teacher selects membership');
select extensions.throws_ok($$select * from public.list_promotion_scopes()$$,'42501','PROMOTION_FORBIDDEN','B47. subject teacher cannot read');
select extensions.throws_ok($$select * from public.generate_promotion_recommendations('e1500000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001')$$,'42501','PROMOTION_CONFIRM_FORBIDDEN','B48. subject teacher cannot generate');
select extensions.throws_ok($$select * from public.apply_student_progression('00000000-0000-0000-0000-000000000001',1,null,null)$$,'42501','PROMOTION_CONFIRM_FORBIDDEN','B49. subject teacher cannot progress');

select set_config('request.jwt.claims','{"sub":"e1100000-0000-4000-8000-000000000004","role":"authenticated","session_id":"e2800000-0000-4000-8000-000000000004"}',true);
select extensions.lives_ok($$select public.set_my_active_membership('e1200000-0000-4000-8000-000000000004')$$,'B50. other-school membership is selectable');
select * from extensions.finish();
rollback;
