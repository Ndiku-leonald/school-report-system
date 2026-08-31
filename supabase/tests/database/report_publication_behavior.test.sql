begin;

select extensions.no_plan();

-- A complete synthetic Stage 11 source is created so the publication checks
-- below execute the real Stage 12/14 RPCs inside the rebuilt local database.
insert into public.schools(id,name,slug,school_code)
values ('d1000000-0000-4000-8000-000000000001','Publication Behavior School','publication-behavior','PBT');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('d1100000-0000-4000-8000-000000000001','authenticated','authenticated','publication.behavior@example.invalid',extensions.crypt('synthetic',extensions.gen_salt('bf')),now(),'{}','{}',now(),now());
insert into public.profiles(id,first_name,last_name)
values ('d1100000-0000-4000-8000-000000000001','Publication','Behavior');
insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status)
values ('d1200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','PBT-ADMIN','ACTIVE');
insert into public.staff_role_assignments(id,membership_id,role,granted_at)
values ('d1300000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','SCHOOL_ADMIN',now()-interval '1 day');
insert into public.academic_years(id,school_id,name,starts_on,ends_on,status)
values ('d1400000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Publication Behavior Year',current_date-30,current_date+30,'ACTIVE');
insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status)
values ('d1500000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001','Publication Behavior Term',1,current_date-30,current_date+30,'MARKS_ENTRY');
insert into public.grade_levels(id,school_id,code,name,sort_order)
values ('d1600000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','PBT','Publication Grade',1);
insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code)
values ('d1700000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001','Publication Class','PBT-A');
insert into public.subjects(id,school_id,code,name,sort_order)
values ('d1800000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','PBT-S','Publication Subject',1);
insert into public.grade_level_subjects(id,grade_level_id,subject_id,sort_order)
values ('d1900000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001','d1800000-0000-4000-8000-000000000001',1);
insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by)
values ('d1a00000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001','d1800000-0000-4000-8000-000000000001','Publication Scheme','DRAFT',current_date-30,'d1200000-0000-4000-8000-000000000001');
insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order)
values ('d1b00000-0000-4000-8000-000000000001','d1a00000-0000-4000-8000-000000000001','Exam','EXAM',100,100,1);
update public.assessment_schemes set status='ACTIVE' where id='d1a00000-0000-4000-8000-000000000001';
insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date)
values ('d1c00000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','PBT-001','Synthetic','Learner',current_date-20);
insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on)
values ('d1d00000-0000-4000-8000-000000000001','d1c00000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001','d1700000-0000-4000-8000-000000000001',current_date-20);
insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on)
values ('d1e00000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','d1700000-0000-4000-8000-000000000001','d1800000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001',current_date-20);
insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id,workflow_status,locked_by,locked_at)
values ('d1f00000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','d1700000-0000-4000-8000-000000000001','d1800000-0000-4000-8000-000000000001','d1a00000-0000-4000-8000-000000000001','d1e00000-0000-4000-8000-000000000001','LOCKED','d1200000-0000-4000-8000-000000000001',now());
insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,effective_from,created_by)
values ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001','Publication Scale',current_date-20,'d1200000-0000-4000-8000-000000000001');
insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,ranking_basis,tie_method,configuration,is_active,created_by)
values ('d2100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001','Publication Ranking','AVERAGE','DENSE','{}',true,'d1200000-0000-4000-8000-000000000001');
insert into public.result_calculation_runs(id,term_id,grade_level_id,version,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by)
values ('d2200000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001',1,'d2000000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000001',internal.results_input_checksum('d1500000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000001',null),repeat('b',64),'d1200000-0000-4000-8000-000000000001');
insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order)
values ('d2300000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000001','d1f00000-0000-4000-8000-000000000001','d1700000-0000-4000-8000-000000000001','d1800000-0000-4000-8000-000000000001',1,'d1a00000-0000-4000-8000-000000000001','d1900000-0000-4000-8000-000000000001',true,true,1);
insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied)
values ('d2400000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000001','d1d00000-0000-4000-8000-000000000001','d1700000-0000-4000-8000-000000000001',1,1,1,88,88,'A',3,'Advanced',true,true,88,1,1,1,1,false,false);
insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied)
values ('d2500000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000001','d1d00000-0000-4000-8000-000000000001','d1700000-0000-4000-8000-000000000001','d1800000-0000-4000-8000-000000000001','d1f00000-0000-4000-8000-000000000001','COMPLETE',88,'A',3,true,100,false,false,1,1,false);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"d2600000-0000-4000-8000-000000000001"}',true);
select public.set_my_active_membership('d1200000-0000-4000-8000-000000000001');

select extensions.throws_ok($$select * from public.authorize_report_artifact_generation('00000000-0000-0000-0000-000000000000')$$,'P0002','REPORT_NOT_FOUND','B01. unknown generation target is denied');
select extensions.lives_ok($$select * from public.generate_student_report_snapshot('d2200000-0000-4000-8000-000000000001','d1d00000-0000-4000-8000-000000000001')$$,'B02. effective authority generates a report');
select report_id into temporary report_publication_behavior_target from public.list_generated_reports('d2200000-0000-4000-8000-000000000001');
select extensions.is((select status from public.reports where id=(select report_id from report_publication_behavior_target)),'GENERATED'::public.report_status,'B03. generation starts in GENERATED');

reset role;
update public.staff_role_assignments set granted_at=now()+interval '1 day' where membership_id='d1200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select * from public.authorize_report_artifact_generation((select report_id from report_publication_behavior_target))$$,'42501','REPORT_FORBIDDEN','B04. future-dated generation authority is denied');
reset role;
update public.staff_role_assignments set granted_at=now()-interval '1 day' where membership_id='d1200000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.lives_ok($$select * from public.authorize_report_artifact_generation((select report_id from report_publication_behavior_target))$$,'B05. effective generation authority is accepted');

select extensions.throws_ok($$select * from public.review_generated_report((select report_id from report_publication_behavior_target),0)$$,'55000','REPORT_NOT_REVIEWABLE','B06. review without an artifact is denied');
select extensions.throws_ok($$select * from public.publish_reviewed_report((select report_id from report_publication_behavior_target),0)$$,'55000','REPORT_NOT_PUBLISHABLE','B07. publish from GENERATED is denied');

reset role;
insert into storage.objects(bucket_id,name,metadata)
values ('report-artifacts',(select report_id from report_publication_behavior_target)||'/'||repeat('e',64)||'.pdf','{"size":"19","mimetype":"application/pdf"}'::jsonb);
set local role authenticated;
select * into temporary report_publication_behavior_registered
from public.register_report_pdf_artifact((select report_id from report_publication_behavior_target),0,(select report_id from report_publication_behavior_target)||'/'||repeat('e',64)||'.pdf');
select extensions.is((select workflow_version from report_publication_behavior_registered),1::bigint,'B09. registration increments workflow exactly once');
select extensions.is((select file_checksum from report_publication_behavior_registered),repeat('e',64),'B10. checksum is derived from the canonical path');
select extensions.is((select file_size_bytes from report_publication_behavior_registered),19::bigint,'B11. size is derived from Storage metadata');
select extensions.is((select pdf_storage_path from public.reports where id=(select report_id from report_publication_behavior_target)),(select report_id from report_publication_behavior_target)||'/'||repeat('e',64)||'.pdf','B12. canonical path is stored');
select extensions.throws_ok($$select * from public.register_report_pdf_artifact((select report_id from report_publication_behavior_target),0,(select report_id from report_publication_behavior_target)||'/'||repeat('e',64)||'.pdf')$$,'40001','REPORT_WORKFLOW_CONFLICT','B13. stale registration cannot increment twice');
select extensions.throws_ok($$update public.reports set file_checksum=repeat('f',64) where id=(select report_id from report_publication_behavior_target)$$,'42501',null,'B14. direct artifact metadata mutation is denied');
select extensions.throws_ok($$insert into storage.objects(bucket_id,name,metadata) values ('report-artifacts','forged.pdf','{"size":"7","mimetype":"application/pdf"}'::jsonb)$$,'42501',null,'B15. authenticated direct Storage insert is denied');

select * into temporary report_publication_behavior_reviewed
from public.review_generated_report((select report_id from report_publication_behavior_target),1);
select extensions.is((select status from report_publication_behavior_reviewed),'REVIEWED'::public.report_status,'B16. GENERATED to REVIEWED is valid');
select extensions.is((select workflow_version from report_publication_behavior_reviewed),2::bigint,'B17. review increments workflow once');
select extensions.throws_ok($$select * from public.withdraw_published_report((select report_id from report_publication_behavior_target),2,'not published')$$,'55000','REPORT_NOT_WITHDRAWABLE','B18. REVIEWED to WITHDRAWN is denied');
select * into temporary report_publication_behavior_published
from public.publish_reviewed_report((select report_id from report_publication_behavior_target),2);
select extensions.is((select status from report_publication_behavior_published),'PUBLISHED'::public.report_status,'B19. REVIEWED to PUBLISHED is valid');
select extensions.is((select workflow_version from report_publication_behavior_published),3::bigint,'B20. publish increments workflow once');
select extensions.throws_ok($$select * from public.withdraw_published_report((select report_id from report_publication_behavior_target),3,'   ')$$,'22023','REPORT_WITHDRAWAL_REASON_REQUIRED','B21. whitespace withdrawal reason is denied');
select * into temporary report_publication_behavior_withdrawn
from public.withdraw_published_report((select report_id from report_publication_behavior_target),3,'  correction required  ');
select extensions.is((select status from report_publication_behavior_withdrawn),'WITHDRAWN'::public.report_status,'B22. PUBLISHED to WITHDRAWN is valid');
select extensions.is((select workflow_version from report_publication_behavior_withdrawn),4::bigint,'B23. withdrawal increments workflow once');
select extensions.is((select withdrawal_reason from public.reports where id=(select report_id from report_publication_behavior_target)),'correction required','B24. withdrawal reason is trimmed at the database edge');
select extensions.throws_ok($$select * from public.publish_reviewed_report((select report_id from report_publication_behavior_target),4)$$,'55000','REPORT_NOT_PUBLISHABLE','B25. WITHDRAWN to PUBLISHED is denied');
select extensions.lives_ok($$select public.record_report_artifact_access((select report_id from report_publication_behavior_target),repeat('e',64))$$,'B26. valid artifact access audit succeeds');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id=(select report_id from report_publication_behavior_target) and action='REPORT_ARTIFACT_ACCESSED'),1,'B27. successful artifact access emits one audit');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id=(select report_id from report_publication_behavior_target) and action='REPORT_ARTIFACT_STORED'),1,'B28. successful artifact registration emits one audit');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id=(select report_id from report_publication_behavior_target) and action='REPORT_REVIEWED'),1,'B29. successful review emits one audit');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id=(select report_id from report_publication_behavior_target) and action='REPORT_PUBLISHED'),1,'B30. successful publication emits one audit');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id=(select report_id from report_publication_behavior_target) and action='REPORT_WITHDRAWN'),1,'B31. successful withdrawal emits one audit');

select * from finish();
rollback;
