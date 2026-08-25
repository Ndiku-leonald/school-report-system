begin;

select extensions.no_plan();

-- Entirely synthetic, transaction-scoped Stage 10 actors and academic scope.
insert into public.schools (id, name, slug, school_code)
values ('b1000000-0000-4000-8000-000000000001', 'Workflow Behavior School', 'workflow-behavior-school', 'WFB-PGTAP');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b1100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'workflow.teacher@example.invalid', extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b1100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'workflow.reviewer@example.invalid', extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b1100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'workflow.registrar@example.invalid', extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b1100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'workflow.unbound@example.invalid', extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles (id, first_name, last_name)
values
  ('b1100000-0000-4000-8000-000000000001', 'Workflow', 'Teacher'),
  ('b1100000-0000-4000-8000-000000000002', 'Workflow', 'Reviewer'),
  ('b1100000-0000-4000-8000-000000000003', 'Workflow', 'Registrar'),
  ('b1100000-0000-4000-8000-000000000004', 'Workflow', 'Unbound');

insert into public.school_staff_memberships (
  id, school_id, profile_id, employee_number, status, joined_at
)
values
  ('b1200000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001', 'WFB-TEACHER', 'ACTIVE', current_date - 90),
  ('b1200000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000002', 'WFB-REVIEWER', 'ACTIVE', current_date - 90),
  ('b1200000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000003', 'WFB-REGISTRAR', 'ACTIVE', current_date - 90),
  ('b1200000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000004', 'WFB-UNBOUND', 'ACTIVE', current_date - 90);

insert into public.staff_role_assignments (id, membership_id, role, granted_at)
values
  ('b1300000-0000-4000-8000-000000000001', 'b1200000-0000-4000-8000-000000000001', 'SUBJECT_TEACHER', now() - interval '1 day'),
  ('b1300000-0000-4000-8000-000000000002', 'b1200000-0000-4000-8000-000000000001', 'SCHOOL_ADMIN', now() - interval '1 day'),
  ('b1300000-0000-4000-8000-000000000003', 'b1200000-0000-4000-8000-000000000002', 'HEAD_TEACHER', now() - interval '1 day'),
  ('b1300000-0000-4000-8000-000000000004', 'b1200000-0000-4000-8000-000000000003', 'ACADEMIC_REGISTRAR', now() - interval '1 day'),
  ('b1300000-0000-4000-8000-000000000005', 'b1200000-0000-4000-8000-000000000004', 'SUBJECT_TEACHER', now() - interval '1 day');

insert into public.academic_years (id, school_id, name, starts_on, ends_on, status)
values ('b1400000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Workflow behavior year', current_date - 90, current_date + 90, 'ACTIVE');
insert into public.terms (id, academic_year_id, name, term_number, starts_on, ends_on, status)
values ('b1500000-0000-4000-8000-000000000001', 'b1400000-0000-4000-8000-000000000001', 'Workflow behavior term', 1, current_date - 30, current_date + 30, 'MARKS_ENTRY');
insert into public.grade_levels (id, school_id, code, name, sort_order)
values ('b1600000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'WFB', 'Workflow Behavior Grade', 1);
insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code)
values ('b1700000-0000-4000-8000-000000000001', 'b1400000-0000-4000-8000-000000000001', 'b1600000-0000-4000-8000-000000000001', 'Workflow Behavior Class', 'WFB-C');
insert into public.subjects (id, school_id, code, name, sort_order)
values ('b1800000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'WFS', 'Workflow Behavior Subject', 1);
insert into public.grade_level_subjects (id, grade_level_id, subject_id, sort_order)
values ('b1900000-0000-4000-8000-000000000001', 'b1600000-0000-4000-8000-000000000001', 'b1800000-0000-4000-8000-000000000001', 1);
insert into public.assessment_schemes (id, term_id, grade_level_id, subject_id, name, version, status, effective_from)
values ('b1a00000-0000-4000-8000-000000000001', 'b1500000-0000-4000-8000-000000000001', 'b1600000-0000-4000-8000-000000000001', 'b1800000-0000-4000-8000-000000000001', 'Workflow Behavior Scheme', 1, 'DRAFT', current_date - 30);
insert into public.assessment_components (id, assessment_scheme_id, name, component_code, maximum_score, weight_percentage, sort_order)
values ('b1b00000-0000-4000-8000-000000000001', 'b1a00000-0000-4000-8000-000000000001', 'Assessment', 'ASS', 100, 100, 1);
update public.assessment_schemes set status = 'ACTIVE' where id = 'b1a00000-0000-4000-8000-000000000001';
insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values ('b1c00000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'WFB-001', 'Workflow', 'Learner', current_date - 90);
insert into public.enrollments (id, student_id, academic_year_id, class_section_id, status, enrolled_on)
values ('b1d00000-0000-4000-8000-000000000001', 'b1c00000-0000-4000-8000-000000000001', 'b1400000-0000-4000-8000-000000000001', 'b1700000-0000-4000-8000-000000000001', 'ACTIVE', current_date - 30);
insert into public.teaching_assignments (id, term_id, class_section_id, subject_id, staff_membership_id, starts_on)
values ('b1e00000-0000-4000-8000-000000000001', 'b1500000-0000-4000-8000-000000000001', 'b1700000-0000-4000-8000-000000000001', 'b1800000-0000-4000-8000-000000000001', 'b1200000-0000-4000-8000-000000000001', current_date - 30);
insert into public.mark_sheets (id, term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id)
values ('b1f00000-0000-4000-8000-000000000001', 'b1500000-0000-4000-8000-000000000001', 'b1700000-0000-4000-8000-000000000001', 'b1800000-0000-4000-8000-000000000001', 'b1a00000-0000-4000-8000-000000000001', 'b1e00000-0000-4000-8000-000000000001');
create temporary table workflow_sheet_clock on commit drop as
select updated_at from public.mark_sheets
where id = 'b1f00000-0000-4000-8000-000000000001';
grant select on workflow_sheet_clock to authenticated;

-- Bind four independent JWT sessions to their selected memberships.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select public.set_my_active_membership('b1200000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select public.set_my_active_membership('b1200000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000003","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000003"}', true);
select public.set_my_active_membership('b1200000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000004","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000004"}', true);
select public.set_my_active_membership('b1200000-0000-4000-8000-000000000004');

-- Submission: incomplete, unbound, stale, successful, and no-op behavior.
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select extensions.is((select can_submit from public.get_mark_sheet_workflow_detail('b1f00000-0000-4000-8000-000000000001')), false, 'B01. incomplete DRAFT capability is false');
select extensions.throws_ok($$select public.submit_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, '23514', 'MARK_SHEET_INCOMPLETE', 'B02. incomplete DRAFT submission fails');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'DRAFT'::public.mark_sheet_status, 'B03. failed incomplete submission leaves DRAFT');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_SUBMITTED'), 0, 'B04. failed incomplete submission has no success audit');

select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000004","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000004"}', true);
select extensions.is((select count(*)::integer from public.get_mark_sheet_workflow_detail('b1f00000-0000-4000-8000-000000000001')), 0, 'B05. unrelated teacher cannot read workflow detail');
select extensions.throws_ok($$select public.submit_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from workflow_sheet_clock))$$, '42501', 'MARKS_WORKFLOW_BOUND_TEACHER_REQUIRED', 'B06. unrelated teacher cannot submit');

select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select extensions.lives_ok($$select public.save_mark_entry('b1f00000-0000-4000-8000-000000000001', 'b1b00000-0000-4000-8000-000000000001', 'b1d00000-0000-4000-8000-000000000001', null, 70, 'PRESENT', null)$$, 'B07. bound teacher completes the DRAFT through the product RPC');
select extensions.is((select can_submit from public.get_mark_sheet_workflow_detail('b1f00000-0000-4000-8000-000000000001')), true, 'B08. complete ordinary DRAFT capability is true in MARKS_ENTRY');
select extensions.throws_ok($$select public.submit_mark_sheet('b1f00000-0000-4000-8000-000000000001', '-infinity'::timestamptz)$$, 'PT409', 'MARK_SHEET_WORKFLOW_CONFLICT', 'B09. stale submission returns PT409');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_SUBMITTED'), 0, 'B10. stale submission creates no success audit');
select extensions.lives_ok($$select public.submit_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, 'B11. complete DRAFT submission succeeds');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'SUBMITTED'::public.mark_sheet_status, 'B12. successful submission enters SUBMITTED');
select extensions.is((select version from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 1, 'B13. submission does not change the revision version');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_SUBMITTED'), 1, 'B14. submission emits exactly one success audit');
select extensions.throws_ok($$select public.submit_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, '55000', 'MARK_SHEET_WORKFLOW_TRANSITION_INVALID', 'B15. second submission fails');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_SUBMITTED'), 1, 'B16. second submission adds no audit');

-- Review, reason validation, return, edit, and resubmission.
select extensions.throws_ok($$select public.start_mark_sheet_review('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, '42501', 'MARK_SHEET_SELF_REVIEW_FORBIDDEN', 'B17. submitting SCHOOL_ADMIN cannot self-review');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_REVIEW_STARTED'), 0, 'B18. failed self-review adds no audit');
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.lives_ok($$select public.start_mark_sheet_review('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, 'B19. different authorized reviewer starts review');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'UNDER_REVIEW'::public.mark_sheet_status, 'B20. review transition enters UNDER_REVIEW');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_REVIEW_STARTED'), 1, 'B21. review start emits exactly one audit');
select extensions.throws_ok($$select public.return_mark_sheet('b1f00000-0000-4000-8000-000000000001', '-infinity'::timestamptz, 'Valid reason')$$, 'PT409', 'MARK_SHEET_WORKFLOW_CONFLICT', 'B22. stale return fails');
select extensions.throws_ok($$select public.return_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), '')$$, '22023', 'MARKS_WORKFLOW_REASON_REQUIRED', 'B23. empty return reason fails');
select extensions.throws_ok($$select public.return_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), '   ')$$, '22023', 'MARKS_WORKFLOW_REASON_REQUIRED', 'B24. whitespace return reason fails');
select extensions.throws_ok($$select public.return_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), E'bad\nreason')$$, '22021', 'MARKS_WORKFLOW_REASON_CONTROL_CHARACTERS', 'B25. control-character return reason fails');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_RETURNED'), 0, 'B26. invalid returns create no success audit');
select extensions.lives_ok($$select public.return_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), '  Check source register  ')$$, 'B27. valid return succeeds');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'RETURNED'::public.mark_sheet_status, 'B28. valid return enters RETURNED');
select extensions.is((select return_reason from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'Check source register', 'B29. return reason is normalized');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_RETURNED'), 1, 'B30. valid return emits exactly one audit');

select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select extensions.lives_ok($$select public.save_mark_entry('b1f00000-0000-4000-8000-000000000001', 'b1b00000-0000-4000-8000-000000000001', 'b1d00000-0000-4000-8000-000000000001', 1, 72, 'PRESENT', 'Corrected')$$, 'B31. returned MARKS_ENTRY sheet is writable by bound teacher');
select extensions.is((select score from public.marks where mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'), 72::numeric, 'B32. returned edit persists');
select extensions.is((select can_resubmit from public.get_mark_sheet_workflow_detail('b1f00000-0000-4000-8000-000000000001')), true, 'B33. complete returned capability agrees in MARKS_ENTRY');

select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000004","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000004"}', true);
select extensions.throws_ok($$select public.save_mark_entry('b1f00000-0000-4000-8000-000000000001', 'b1b00000-0000-4000-8000-000000000001', 'b1d00000-0000-4000-8000-000000000001', 2, 73, 'PRESENT', null)$$, '42501', null, 'B34. unrelated teacher cannot edit returned sheet');

reset role;
insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values ('b1c00000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'WFB-002', 'Second', 'Learner', current_date - 90);
insert into public.enrollments (id, student_id, academic_year_id, class_section_id, status, enrolled_on)
values ('b1d00000-0000-4000-8000-000000000002', 'b1c00000-0000-4000-8000-000000000002', 'b1400000-0000-4000-8000-000000000001', 'b1700000-0000-4000-8000-000000000001', 'ACTIVE', current_date - 30);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select extensions.throws_ok($$select public.resubmit_returned_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, '23514', 'MARK_SHEET_INCOMPLETE', 'B35. incomplete returned sheet cannot resubmit');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_RESUBMITTED'), 0, 'B36. failed resubmit creates no success audit');
select extensions.lives_ok($$select public.save_mark_entry('b1f00000-0000-4000-8000-000000000001', 'b1b00000-0000-4000-8000-000000000001', 'b1d00000-0000-4000-8000-000000000002', null, 64, 'PRESENT', null)$$, 'B37. teacher completes newly required returned cell');
select extensions.lives_ok($$select public.resubmit_returned_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, 'B38. completed returned sheet resubmits');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'SUBMITTED'::public.mark_sheet_status, 'B39. resubmission returns to SUBMITTED');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_RESUBMITTED'), 1, 'B40. resubmission emits exactly one audit');

-- Approval, lock authority, separation of duties, and frozen marks.
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.lives_ok($$select public.start_mark_sheet_review('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, 'B41. resubmitted sheet starts a fresh review');
select extensions.throws_ok($$select public.approve_mark_sheet('b1f00000-0000-4000-8000-000000000001', '-infinity'::timestamptz)$$, 'PT409', 'MARK_SHEET_WORKFLOW_CONFLICT', 'B42. stale approval fails');
select extensions.lives_ok($$select public.approve_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, 'B43. valid approval succeeds');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'APPROVED'::public.mark_sheet_status, 'B44. approval enters APPROVED');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_APPROVED'), 1, 'B45. approval emits exactly one audit');
select extensions.throws_ok($$select public.lock_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, '55000', 'MARK_SHEET_WORKFLOW_TRANSITION_INVALID', 'B46. sheet cannot lock outside REVIEW');

reset role;
select set_config('app.term_marks_workflow_transition', 'allowed', true);
update public.terms set status = 'REVIEW' where id = 'b1500000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000003","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000003"}', true);
select extensions.throws_ok($$select public.lock_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, '42501', null, 'B47. MARKS_LOCK authority is required');
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select extensions.throws_ok($$select public.lock_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, '42501', 'MARK_SHEET_SELF_REVIEW_FORBIDDEN', 'B48. submitter cannot lock despite SCHOOL_ADMIN authority');
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.lives_ok($$select public.lock_mark_sheet('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'))$$, 'B49. authorized non-submitter locks in REVIEW');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'LOCKED'::public.mark_sheet_status, 'B50. successful lock enters LOCKED');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1f00000-0000-4000-8000-000000000001' and action = 'MARK_SHEET_LOCKED'), 1, 'B51. sheet lock emits exactly one audit');

reset role;
select extensions.throws_ok($$update public.marks set score = 80 where mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001' and enrollment_id = 'b1d00000-0000-4000-8000-000000000001'$$, '55000', 'MARK_SHEET_MARKS_FROZEN', 'B52. privileged mark UPDATE fails while LOCKED');
select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets set workflow_status = 'SUBMITTED' where id = 'b1f00000-0000-4000-8000-000000000001';
select extensions.throws_ok($$update public.marks set score = 80 where mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001' and enrollment_id = 'b1d00000-0000-4000-8000-000000000001'$$, '55000', 'MARK_SHEET_MARKS_FROZEN', 'B53. privileged mark UPDATE fails while SUBMITTED');
update public.mark_sheets set workflow_status = 'UNDER_REVIEW' where id = 'b1f00000-0000-4000-8000-000000000001';
select extensions.throws_ok($$update public.marks set score = 80 where mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001' and enrollment_id = 'b1d00000-0000-4000-8000-000000000001'$$, '55000', 'MARK_SHEET_MARKS_FROZEN', 'B54. privileged mark UPDATE fails while UNDER_REVIEW');
update public.mark_sheets set workflow_status = 'APPROVED' where id = 'b1f00000-0000-4000-8000-000000000001';
select extensions.throws_ok($$update public.marks set score = 80 where mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001' and enrollment_id = 'b1d00000-0000-4000-8000-000000000001'$$, '55000', 'MARK_SHEET_MARKS_FROZEN', 'B55. privileged mark UPDATE fails while APPROVED');
update public.terms set status = 'MARKS_ENTRY' where id = 'b1500000-0000-4000-8000-000000000001';
update public.mark_sheets set workflow_status = 'DRAFT' where id = 'b1f00000-0000-4000-8000-000000000001';
select extensions.lives_ok($$update public.marks set score = 74 where mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001' and enrollment_id = 'b1d00000-0000-4000-8000-000000000001'$$, 'B56. ordinary DRAFT mark remains writable in MARKS_ENTRY');
update public.mark_sheets set workflow_status = 'RETURNED', returned_by = 'b1200000-0000-4000-8000-000000000002', returned_at = now(), return_reason = 'Fixture return' where id = 'b1f00000-0000-4000-8000-000000000001';
select extensions.lives_ok($$update public.marks set score = 75 where mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001' and enrollment_id = 'b1d00000-0000-4000-8000-000000000001'$$, 'B57. RETURNED mark remains writable in MARKS_ENTRY');

-- Runtime capability/mutation agreement for historical REVIEW returns.
insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code)
values ('b1700000-0000-4000-8000-000000000002', 'b1400000-0000-4000-8000-000000000001', 'b1600000-0000-4000-8000-000000000001', 'Historical Behavior Class', 'WFB-H');
insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values ('b1c00000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'WFB-003', 'Historical', 'Learner', current_date - 90);
insert into public.enrollments (id, student_id, academic_year_id, class_section_id, status, enrolled_on)
values ('b1d00000-0000-4000-8000-000000000003', 'b1c00000-0000-4000-8000-000000000003', 'b1400000-0000-4000-8000-000000000001', 'b1700000-0000-4000-8000-000000000002', 'ACTIVE', current_date - 30);
insert into public.teaching_assignments (id, term_id, class_section_id, subject_id, staff_membership_id, starts_on, ends_on)
values ('b1e00000-0000-4000-8000-000000000002', 'b1500000-0000-4000-8000-000000000001', 'b1700000-0000-4000-8000-000000000002', 'b1800000-0000-4000-8000-000000000001', 'b1200000-0000-4000-8000-000000000001', current_date - 30, current_date - 1);
insert into public.mark_sheets (
  id, term_id, class_section_id, subject_id, assessment_scheme_id,
  teaching_assignment_id
)
values (
  'b1f00000-0000-4000-8000-000000000002',
  'b1500000-0000-4000-8000-000000000001',
  'b1700000-0000-4000-8000-000000000002',
  'b1800000-0000-4000-8000-000000000001',
  'b1a00000-0000-4000-8000-000000000001',
  'b1e00000-0000-4000-8000-000000000002'
);
insert into public.marks (
  mark_sheet_id, assessment_component_id, enrollment_id, score,
  attendance_status, created_by, updated_by
)
values (
  'b1f00000-0000-4000-8000-000000000002',
  'b1b00000-0000-4000-8000-000000000001',
  'b1d00000-0000-4000-8000-000000000003', 75, 'PRESENT',
  'b1200000-0000-4000-8000-000000000001',
  'b1200000-0000-4000-8000-000000000001'
);
select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets
set workflow_status = 'RETURNED',
    returned_by = 'b1200000-0000-4000-8000-000000000002',
    returned_at = now(),
    return_reason = 'Historical return'
where id = 'b1f00000-0000-4000-8000-000000000002';
update public.terms set status = 'REVIEW'
where id = 'b1500000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select extensions.is((select can_resubmit from public.get_mark_sheet_workflow_detail('b1f00000-0000-4000-8000-000000000002')), true, 'B58. historical bound RETURNED capability is true in REVIEW');
select extensions.lives_ok($$select public.save_mark_entry('b1f00000-0000-4000-8000-000000000002', 'b1b00000-0000-4000-8000-000000000001', 'b1d00000-0000-4000-8000-000000000003', 1, 76, 'PRESENT', 'Historical correction')$$, 'B59. bound historical teacher edits RETURNED sheet in REVIEW');
select extensions.lives_ok($$select public.resubmit_returned_mark_sheet('b1f00000-0000-4000-8000-000000000002', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000002'))$$, 'B60. capability and historical REVIEW resubmission mutation agree');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000002'), 'SUBMITTED'::public.mark_sheet_status, 'B61. historical REVIEW resubmission enters SUBMITTED');

-- Term readiness is derived at runtime from expected scopes and latest sheets.
reset role;
select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets set workflow_status = 'SUBMITTED'
where id = 'b1f00000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select missing_teaching_assignments from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000001')), 0::bigint, 'B62. readiness sees the required assignment');
select extensions.is((select missing_mark_sheets from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000001')), 0::bigint, 'B63. readiness sees the required sheet');
select extensions.is((select submitted_sheets from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000001')), 2::bigint, 'B64. latest SUBMITTED revisions satisfy review readiness');
select extensions.is((select ready_for_review from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000001')), true, 'B65. authoritative review readiness is true');
select extensions.throws_ok($$select public.lock_term_marks('b1500000-0000-4000-8000-000000000001', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000001'))$$, '23514', 'TERM_MARKS_NOT_READY_FOR_LOCK', 'B66. term cannot lock while latest sheet is not locked');

-- Term transitions and every readiness state execute against a second term.
reset role;
insert into public.schools (id, name, slug, school_code)
values ('b1000000-0000-4000-8000-000000000002', 'Workflow Term School', 'workflow-term-school', 'WFT-PGTAP');
insert into public.school_staff_memberships (
  id, school_id, profile_id, employee_number, status, joined_at
)
values
  ('b1200000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000002', 'b1100000-0000-4000-8000-000000000001', 'WFT-TEACHER', 'ACTIVE', current_date - 90),
  ('b1200000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000002', 'b1100000-0000-4000-8000-000000000002', 'WFT-REVIEWER', 'ACTIVE', current_date - 90);
insert into public.staff_role_assignments (id, membership_id, role, granted_at)
values
  ('b1300000-0000-4000-8000-000000000006', 'b1200000-0000-4000-8000-000000000005', 'SUBJECT_TEACHER', now() - interval '1 day'),
  ('b1300000-0000-4000-8000-000000000007', 'b1200000-0000-4000-8000-000000000006', 'HEAD_TEACHER', now() - interval '1 day');
insert into public.academic_years (id, school_id, name, starts_on, ends_on, status)
values ('b1400000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Workflow term year', current_date - 90, current_date + 90, 'ACTIVE');
insert into public.terms (
  id, academic_year_id, name, term_number, starts_on, ends_on, status
)
values (
  'b1500000-0000-4000-8000-000000000002',
  'b1400000-0000-4000-8000-000000000002',
  'Workflow transition term', 1, current_date - 15, current_date + 45, 'OPEN'
);
insert into public.grade_levels (id, school_id, code, name, sort_order)
values ('b1600000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'WFT', 'Workflow Term Grade', 1);
insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code)
values
  ('b1700000-0000-4000-8000-000000000003', 'b1400000-0000-4000-8000-000000000002', 'b1600000-0000-4000-8000-000000000002', 'Workflow Term Class A', 'WFT-A'),
  ('b1700000-0000-4000-8000-000000000004', 'b1400000-0000-4000-8000-000000000002', 'b1600000-0000-4000-8000-000000000002', 'Workflow Term Class B', 'WFT-B');
insert into public.subjects (id, school_id, code, name, sort_order)
values ('b1800000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'WFTS', 'Workflow Term Subject', 1);
insert into public.grade_level_subjects (id, grade_level_id, subject_id, sort_order)
values ('b1900000-0000-4000-8000-000000000002', 'b1600000-0000-4000-8000-000000000002', 'b1800000-0000-4000-8000-000000000002', 1);
insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values
  ('b1c00000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002', 'WFT-001', 'Term', 'Learner A', current_date - 90),
  ('b1c00000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000002', 'WFT-002', 'Term', 'Learner B', current_date - 90);
insert into public.enrollments (id, student_id, academic_year_id, class_section_id, status, enrolled_on)
values
  ('b1d00000-0000-4000-8000-000000000004', 'b1c00000-0000-4000-8000-000000000004', 'b1400000-0000-4000-8000-000000000002', 'b1700000-0000-4000-8000-000000000003', 'ACTIVE', current_date - 15),
  ('b1d00000-0000-4000-8000-000000000005', 'b1c00000-0000-4000-8000-000000000005', 'b1400000-0000-4000-8000-000000000002', 'b1700000-0000-4000-8000-000000000004', 'ACTIVE', current_date - 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select public.set_my_active_membership('b1200000-0000-4000-8000-000000000006');
select extensions.lives_ok($$select public.open_term_marks_entry('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'))$$, 'B67. OPEN term enters marks entry under valid dates and authority');
select extensions.is((select status from public.terms where id = 'b1500000-0000-4000-8000-000000000002'), 'MARKS_ENTRY'::public.term_status, 'B68. term status becomes MARKS_ENTRY');
select extensions.throws_ok($$select public.open_term_marks_entry('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'))$$, '55000', 'TERM_MARKS_WORKFLOW_TRANSITION_INVALID', 'B69. no-op term transition fails');
select extensions.throws_ok($$select public.open_term_marks_entry('b1500000-0000-4000-8000-000000000002', '-infinity'::timestamptz)$$, 'PT409', 'TERM_MARKS_WORKFLOW_CONFLICT', 'B70. stale term transition returns PT409');
select extensions.is((select missing_teaching_assignments from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), 2::bigint, 'B71. missing assignments block readiness');

reset role;
insert into public.teaching_assignments (
  id, term_id, class_section_id, subject_id, staff_membership_id, starts_on
)
values
  ('b1e00000-0000-4000-8000-000000000003', 'b1500000-0000-4000-8000-000000000002', 'b1700000-0000-4000-8000-000000000003', 'b1800000-0000-4000-8000-000000000002', 'b1200000-0000-4000-8000-000000000005', current_date - 15),
  ('b1e00000-0000-4000-8000-000000000004', 'b1500000-0000-4000-8000-000000000002', 'b1700000-0000-4000-8000-000000000004', 'b1800000-0000-4000-8000-000000000002', 'b1200000-0000-4000-8000-000000000005', current_date - 15);
insert into public.assessment_schemes (
  id, term_id, grade_level_id, subject_id, name, version, status,
  effective_from
)
values (
  'b1a00000-0000-4000-8000-000000000002',
  'b1500000-0000-4000-8000-000000000002',
  'b1600000-0000-4000-8000-000000000002',
  'b1800000-0000-4000-8000-000000000002',
  'Transition Scheme', 1, 'DRAFT', current_date - 15
);
insert into public.assessment_components (
  id, assessment_scheme_id, name, component_code, maximum_score,
  weight_percentage, sort_order
)
values (
  'b1b00000-0000-4000-8000-000000000002',
  'b1a00000-0000-4000-8000-000000000002',
  'Transition Assessment', 'TASS', 100, 100, 1
);
update public.assessment_schemes set status = 'ACTIVE'
where id = 'b1a00000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select missing_mark_sheets from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), 2::bigint, 'B72. assigned scopes without sheets block readiness');
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select public.set_my_active_membership('b1200000-0000-4000-8000-000000000005');
select extensions.lives_ok($$select public.get_or_create_draft_mark_sheet('b1e00000-0000-4000-8000-000000000003')$$, 'B73. teacher opens first required DRAFT');
select extensions.lives_ok($$select public.get_or_create_draft_mark_sheet('b1e00000-0000-4000-8000-000000000004')$$, 'B74. teacher opens second required DRAFT');
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select draft_sheets from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), 2::bigint, 'B75. latest DRAFT sheets are counted');
select extensions.is((select ready_for_review from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), false, 'B76. latest DRAFT blocks review');

reset role;
select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets
set workflow_status = 'UNDER_REVIEW',
    submitted_by = 'b1200000-0000-4000-8000-000000000005',
    submitted_at = now(),
    reviewed_by = 'b1200000-0000-4000-8000-000000000006',
    reviewed_at = now()
where teaching_assignment_id = 'b1e00000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.throws_ok($$select public.approve_mark_sheet((select id from public.mark_sheets where teaching_assignment_id = 'b1e00000-0000-4000-8000-000000000003'), (select updated_at from public.mark_sheets where teaching_assignment_id = 'b1e00000-0000-4000-8000-000000000003'))$$, '23514', 'MARK_SHEET_INCOMPLETE', 'B77. incomplete approval fails defensively');
select extensions.is((select count(*)::integer from public.audit_logs where action = 'MARK_SHEET_APPROVED' and entity_id = (select id from public.mark_sheets where teaching_assignment_id = 'b1e00000-0000-4000-8000-000000000003')), 0, 'B78. failed incomplete approval creates no success audit');

reset role;
select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets
set workflow_status = 'RETURNED',
    returned_by = 'b1200000-0000-4000-8000-000000000006',
    returned_at = now(), return_reason = 'Fixture return'
where term_id = 'b1500000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select returned_sheets from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), 2::bigint, 'B79. latest RETURNED sheets are counted');
select extensions.is((select ready_for_review from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), false, 'B80. latest RETURNED blocks review');

reset role;
select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets
set workflow_status = 'SUBMITTED',
    submitted_by = 'b1200000-0000-4000-8000-000000000005',
    submitted_at = now(), returned_by = null, returned_at = null,
    return_reason = null
where term_id = 'b1500000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select submitted_sheets from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), 2::bigint, 'B81. latest SUBMITTED sheets satisfy review-stage readiness');
select extensions.is((select ready_for_review from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), true, 'B82. complete scope is ready for review');
select extensions.lives_ok($$select public.advance_term_marks_to_review('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'))$$, 'B83. ready MARKS_ENTRY term advances to REVIEW');
select extensions.is((select status from public.terms where id = 'b1500000-0000-4000-8000-000000000002'), 'REVIEW'::public.term_status, 'B84. advanced term status is REVIEW');

reset role;
select set_config('app.marks_workflow_transition', 'allowed', true);
update public.mark_sheets set workflow_status = 'UNDER_REVIEW'
where term_id = 'b1500000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select ready_for_review from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), true, 'B85. UNDER_REVIEW latest sheets satisfy review-stage readiness');
reset role;
update public.mark_sheets set workflow_status = 'APPROVED'
where term_id = 'b1500000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select ready_for_review from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), true, 'B86. APPROVED latest sheets satisfy review-stage readiness');

reset role;
update public.mark_sheets set workflow_status = 'LOCKED'
where teaching_assignment_id = 'b1e00000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select ready_for_lock from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), false, 'B87. one unlocked latest scope blocks term lock');
select extensions.throws_ok($$select public.lock_term_marks('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'))$$, '23514', 'TERM_MARKS_NOT_READY_FOR_LOCK', 'B88. term lock fails until every latest scope is locked');
reset role;
update public.mark_sheets set workflow_status = 'LOCKED'
where term_id = 'b1500000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.is((select ready_for_lock from public.get_term_marks_workflow_readiness('b1500000-0000-4000-8000-000000000002')), true, 'B89. every latest LOCKED scope satisfies term readiness');
select extensions.lives_ok($$select public.lock_term_marks('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'))$$, 'B90. ready REVIEW term locks');
select extensions.is((select status from public.terms where id = 'b1500000-0000-4000-8000-000000000002'), 'LOCKED'::public.term_status, 'B91. successful term lock enters LOCKED');
select extensions.throws_ok($$select public.reopen_locked_term_for_mark_correction('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'), '   ')$$, '22023', 'MARKS_WORKFLOW_REASON_REQUIRED', 'B92. locked term requires a non-empty correction reason');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1500000-0000-4000-8000-000000000002' and action = 'TERM_MARKS_REOPENED_FOR_CORRECTION'), 0, 'B93. failed term reopen creates no success audit');
select extensions.lives_ok($$select public.reopen_locked_term_for_mark_correction('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'), 'Verified correction request')$$, 'B94. locked term with no downstream dependency reopens');
select extensions.is((select status from public.terms where id = 'b1500000-0000-4000-8000-000000000002'), 'REVIEW'::public.term_status, 'B95. controlled reopen returns term to REVIEW');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1500000-0000-4000-8000-000000000002' and action = 'TERM_MARKS_REOPENED_FOR_CORRECTION'), 1, 'B96. controlled reopen emits exactly one success audit');
select extensions.lives_ok($$select public.lock_term_marks('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'))$$, 'B97. unchanged locked scopes allow term relock');

reset role;
insert into public.report_batches (
  id, term_id, class_section_id, requested_by
)
values (
  'b2100000-0000-4000-8000-000000000001',
  'b1500000-0000-4000-8000-000000000002',
  'b1700000-0000-4000-8000-000000000003',
  'b1200000-0000-4000-8000-000000000006'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.throws_ok($$select public.reopen_locked_term_for_mark_correction('b1500000-0000-4000-8000-000000000002', (select updated_at from public.terms where id = 'b1500000-0000-4000-8000-000000000002'), 'Blocked downstream request')$$, '55000', 'TERM_MARKS_CORRECTION_DOWNSTREAM_DEPENDENCY', 'B98. report batch dependency blocks reopen');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = 'b1500000-0000-4000-8000-000000000002' and action = 'TERM_MARKS_REOPENED_FOR_CORRECTION'), 1, 'B99. downstream rejection adds no false reopen audit');

-- Correction lineage keeps a retired historical source byte-for-byte intact.
select public.set_my_active_membership('b1200000-0000-4000-8000-000000000002');
reset role;
select set_config('app.marks_workflow_transition', 'allowed', true);
select set_config('app.term_marks_workflow_transition', 'allowed', true);
update public.terms set status = 'REVIEW'
where id = 'b1500000-0000-4000-8000-000000000001';
update public.mark_sheets
set workflow_status = 'LOCKED'
where id in (
  'b1f00000-0000-4000-8000-000000000001',
  'b1f00000-0000-4000-8000-000000000002'
);
update public.assessment_schemes set status = 'RETIRED'
where id = 'b1a00000-0000-4000-8000-000000000001';
create temporary table workflow_source_marks on commit drop as
select assessment_component_id, enrollment_id, score, attendance_status,
  teacher_remark
from public.marks
where mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001';
grant select on workflow_source_marks to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000002"}', true);
select extensions.lives_ok($$select public.create_mark_sheet_correction_revision('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'Correct source transcription')$$, 'B100. exact successor may reuse its retired source scheme');
select extensions.is((select count(*)::integer from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'), 1, 'B101. one direct successor is created');
select extensions.is((select version from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'), 2, 'B102. correction version is source version plus one');
select extensions.is((select supersedes_mark_sheet_id from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'), 'b1f00000-0000-4000-8000-000000000001'::uuid, 'B103. correction lineage points to the exact source');
select extensions.is((select workflow_status from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'LOCKED'::public.mark_sheet_status, 'B104. historical source remains LOCKED');
select extensions.is((select version from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 1, 'B105. historical source version remains unchanged');
select extensions.is((select count(*)::integer from public.marks where mark_sheet_id = (select id from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001')), (select count(*)::integer from workflow_source_marks), 'B106. correction clones every source mark');
select extensions.is((select jsonb_agg(jsonb_build_object('component', assessment_component_id, 'enrollment', enrollment_id, 'score', score, 'attendance', attendance_status, 'remark', teacher_remark) order by assessment_component_id, enrollment_id) from public.marks where mark_sheet_id = (select id from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001')), (select jsonb_agg(jsonb_build_object('component', assessment_component_id, 'enrollment', enrollment_id, 'score', score, 'attendance', attendance_status, 'remark', teacher_remark) order by assessment_component_id, enrollment_id) from workflow_source_marks), 'B107. cloned mark values exactly match the source');
select extensions.is((select assessment_scheme_id from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'), 'b1a00000-0000-4000-8000-000000000001'::uuid, 'B108. correction preserves retired scheme identity');
select extensions.throws_ok($$select public.create_mark_sheet_correction_revision('b1f00000-0000-4000-8000-000000000001', (select updated_at from public.mark_sheets where id = 'b1f00000-0000-4000-8000-000000000001'), 'Competing successor')$$, '23505', 'MARK_SHEET_CORRECTION_SUCCESSOR_EXISTS', 'B109. a second direct successor is rejected');
reset role;
select extensions.throws_ok($$update public.mark_sheets set version = version + 1 where id = 'b1f00000-0000-4000-8000-000000000001'$$, '55000', 'MARK_SHEET_IDENTITY_IMMUTABLE', 'B110. source revision version is immutable');
select extensions.throws_ok($$update public.mark_sheets set supersedes_mark_sheet_id = null where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'$$, '55000', 'MARK_SHEET_IDENTITY_IMMUTABLE', 'B111. correction lineage is immutable');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b2000000-0000-4000-8000-000000000001"}', true);
select public.set_my_active_membership('b1200000-0000-4000-8000-000000000001');
select extensions.is((select can_submit from public.get_mark_sheet_workflow_detail((select id from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'))), true, 'B112. correction DRAFT capability is true in REVIEW');
select extensions.lives_ok($$select public.submit_mark_sheet((select id from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'), (select updated_at from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'))$$, 'B113. correction DRAFT mutation agrees with capability');
select extensions.is((select workflow_status from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001'), 'SUBMITTED'::public.mark_sheet_status, 'B114. correction DRAFT submission enters SUBMITTED');
select extensions.is((select count(*)::integer from public.audit_logs where entity_id = (select id from public.mark_sheets where supersedes_mark_sheet_id = 'b1f00000-0000-4000-8000-000000000001') and action = 'MARK_SHEET_CORRECTION_REVISION_CREATED'), 1, 'B115. correction creation emits exactly one audit');

select * from extensions.finish();
rollback;
