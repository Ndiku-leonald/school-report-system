begin;

select extensions.plan(60);

select extensions.ok(not has_table_privilege('authenticated', 'public.students', 'INSERT,UPDATE,DELETE'), '1. direct student writes remain denied');
select extensions.ok(not has_table_privilege('authenticated', 'public.guardians', 'INSERT,UPDATE,DELETE'), '2. direct guardian writes remain denied');
select extensions.ok(not has_table_privilege('authenticated', 'public.student_guardians', 'INSERT,UPDATE,DELETE'), '3. direct relationship writes remain denied');
select extensions.ok(not has_table_privilege('authenticated', 'public.enrollments', 'INSERT,UPDATE,DELETE'), '4. direct enrolment writes remain denied');

select extensions.has_function('public', 'admit_student', array['text','text','text','text','text','date','date','uuid','uuid','text','enrollment_status','boolean','text','jsonb'], '5. admission RPC exists');
select extensions.has_function('public', 'update_student_profile', array['uuid','timestamp with time zone','text','text','text','text','text','date','date'], '6. profile update RPC exists');
select extensions.has_function('public', 'change_student_status', array['uuid','timestamp with time zone','student_status','date','text'], '7. student lifecycle RPC exists');
select extensions.has_function('public', 'create_student_enrollment', array['uuid','uuid','uuid','text','enrollment_status','date','boolean','text'], '8. enrolment creation RPC exists');
select extensions.has_function('public', 'update_student_enrollment', array['uuid','timestamp with time zone','text','date'], '9. enrolment update RPC exists');
select extensions.has_function('public', 'move_student_class', array['uuid','timestamp with time zone','uuid','text','boolean','text'], '10. class movement RPC exists');
select extensions.has_function('public', 'change_enrollment_status', array['uuid','timestamp with time zone','enrollment_status','date','text'], '11. enrolment lifecycle RPC exists');
select extensions.has_function('public', 'create_guardian', array['text','text','text','text','text'], '12. guardian creation RPC exists');
select extensions.has_function('public', 'update_guardian', array['uuid','timestamp with time zone','text','text','text','text','text','boolean'], '13. guardian update RPC exists');
select extensions.has_function('public', 'link_guardian_to_student', array['uuid','uuid','text','boolean','boolean'], '14. guardian link RPC exists');
select extensions.has_function('public', 'update_student_guardian_relationship', array['uuid','timestamp with time zone','text','boolean','boolean'], '15. guardian relationship update RPC exists');
select extensions.has_function('public', 'unlink_guardian_from_student', array['uuid','timestamp with time zone','text'], '16. guardian unlink RPC exists');
select extensions.has_function('public', 'set_student_photo_path', array['uuid','timestamp with time zone','text'], '17. photo metadata RPC exists');
select extensions.has_function('public', 'list_students', array['text','student_status','uuid','uuid','uuid','enrollment_status','integer','integer'], '18. paginated list RPC exists');
select extensions.has_function('public', 'get_student_details', array['uuid'], '19. detail RPC exists');
select extensions.has_function('public', 'get_student_enrollment_history', array['uuid'], '20. history RPC exists');
select extensions.has_function('public', 'get_student_guardians', array['uuid'], '21. private guardian read RPC exists');
select extensions.has_function('public', 'get_class_roster', array['uuid','integer','integer'], '22. class roster RPC exists');

select extensions.ok(not has_function_privilege('anon', 'public.admit_student(text,text,text,text,text,date,date,uuid,uuid,text,enrollment_status,boolean,text,jsonb)', 'EXECUTE'), '23. anonymous admission is denied');
select extensions.ok(has_function_privilege('authenticated', 'public.admit_student(text,text,text,text,text,date,date,uuid,uuid,text,enrollment_status,boolean,text,jsonb)', 'EXECUTE'), '24. authenticated callers can reach guarded admission');
select extensions.ok(not exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'public.admit_student(text,text,text,text,text,date,date,uuid,uuid,text,enrollment_status,boolean,text,jsonb)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'), '25. PUBLIC admission execution is revoked');
select extensions.ok((select prosecdef from pg_proc where oid = 'public.admit_student(text,text,text,text,text,date,date,uuid,uuid,text,enrollment_status,boolean,text,jsonb)'::regprocedure), '26. admission is security definer');
select extensions.is((select proconfig[1] from pg_proc where oid = 'public.admit_student(text,text,text,text,text,date,date,uuid,uuid,text,enrollment_status,boolean,text,jsonb)'::regprocedure), 'search_path=pg_catalog, public, internal', '27. admission has a fixed search path');

select extensions.ok(exists (select 1 from pg_indexes where indexname = 'student_school_admission_normalized_idx'), '28. normalized admission uniqueness exists');
select extensions.ok(exists (select 1 from pg_indexes where indexname = 'enrollment_current_class_number_idx'), '29. current class-number uniqueness exists');
select extensions.ok(exists (select 1 from storage.buckets where id = 'student-photos'), '30. photo bucket exists');
select extensions.ok(not (select public from storage.buckets where id = 'student-photos'), '31. photo bucket is private');
select extensions.is((select file_size_limit from storage.buckets where id = 'student-photos'), 5242880::bigint, '32. photo bucket limit is five MiB');
select extensions.is((select array_length(allowed_mime_types, 1) from storage.buckets where id = 'student-photos'), 3, '33. photo bucket restricts MIME types');
select extensions.is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'student_photos_%'), 4::bigint, '34. photo CRUD has four scoped policies');
select extensions.ok(
  has_function_privilege('authenticated', 'internal.student_photo_access(text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'internal.student_photo_access(text,boolean)', 'EXECUTE')
  and (select namespace.nspname = 'internal' from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where procedure.oid = 'internal.student_photo_access(text,boolean)'::regprocedure),
  '35. photo policy helper is authenticated-only and remains outside the exposed public schema'
);

select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.students'::regclass), '36. student RLS remains forced');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.guardians'::regclass), '37. guardian RLS remains forced');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.student_guardians'::regclass), '38. relationship RLS remains forced');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.enrollments'::regclass), '39. enrolment RLS remains forced');
select extensions.ok(not has_table_privilege('authenticated', 'public.student_access_credentials', 'SELECT'), '40. student credentials remain denied');
select extensions.ok(not has_table_privilege('authenticated', 'public.parent_access_sessions', 'SELECT'), '41. parent sessions remain denied');

insert into public.schools (id, name, slug, school_code)
values ('f7000000-0000-4000-8000-000000000001', 'Synthetic Stage Seven School', 'synthetic-stage-seven', 'SYN-STG7');
insert into public.academic_years (id, school_id, name, starts_on, ends_on, status)
values ('f7100000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', 'Synthetic 2026', '2026-01-01', '2026-12-31', 'ACTIVE');
insert into public.grade_levels (id, school_id, code, name, sort_order)
values ('f7200000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', 'P1', 'Primary One', 1);
insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code, capacity)
values ('f7300000-0000-4000-8000-000000000001', 'f7100000-0000-4000-8000-000000000001', 'f7200000-0000-4000-8000-000000000001', 'P1 North', 'P1-N', 30);
insert into public.students (id, school_id, admission_number, first_name, middle_name, last_name, admission_date)
values ('f7400000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', ' stg-001 ', ' Ada ', '  M.  ', ' O''Neil-Smith ', '2026-01-03');
insert into public.guardians (id, school_id, first_name, last_name, phone, email)
values ('f7500000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', ' Grace ', ' Hopper ', '+14155552671', ' GRACE@EXAMPLE.INVALID ');
insert into public.enrollments (id, student_id, academic_year_id, class_section_id, class_number, status, enrolled_on)
values ('f7600000-0000-4000-8000-000000000001', 'f7400000-0000-4000-8000-000000000001', 'f7100000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', ' 7 ', 'ACTIVE', '2026-01-03');

select extensions.is((select admission_number || '|' || first_name || '|' || middle_name || '|' || last_name from public.students where id = 'f7400000-0000-4000-8000-000000000001'), 'STG-001|Ada|M.|O''Neil-Smith', '42. student identity is canonically trimmed without damaging punctuation');
select extensions.is((select email from public.guardians where id = 'f7500000-0000-4000-8000-000000000001'), 'grace@example.invalid', '43. guardian email is lowercase and trimmed');
select extensions.is((select phone from public.guardians where id = 'f7500000-0000-4000-8000-000000000001'), '+14155552671', '44. internationally valid E.164 phone is preserved');
select extensions.throws_ok($$insert into public.guardians (school_id, first_name, last_name, email) values ('f7000000-0000-4000-8000-000000000001', 'Bad', 'Email', 'not-an-email')$$, '22023', 'GUARDIAN_EMAIL_INVALID', '45. malformed guardian email is rejected');
select extensions.throws_ok($$insert into public.guardians (school_id, first_name, last_name, phone) values ('f7000000-0000-4000-8000-000000000001', 'Bad', 'Phone', '0772123456')$$, '22023', 'GUARDIAN_PHONE_INVALID', '46. non-E.164 guardian phone is rejected');
select extensions.throws_ok($$insert into public.students (school_id, admission_number, first_name, last_name, admission_date) values ('f7000000-0000-4000-8000-000000000001', ' stg-001 ', 'Other', 'Student', '2026-01-03')$$, '23505', null, '47. normalized duplicate admission is rejected');

insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values ('f7400000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001', 'STG-002', 'Katherine', 'Johnson', '2026-01-03');
select extensions.throws_ok($$insert into public.enrollments (student_id, academic_year_id, class_section_id, class_number, status, enrolled_on) values ('f7400000-0000-4000-8000-000000000002', 'f7100000-0000-4000-8000-000000000001', 'f7300000-0000-4000-8000-000000000001', ' 7 ', 'ACTIVE', '2026-01-03')$$, '23505', null, '48. duplicate current class number is rejected');
select extensions.throws_ok($$delete from public.students where id = 'f7400000-0000-4000-8000-000000000001'$$, '55000', 'HISTORICAL_RECORD_DELETE_FORBIDDEN', '49. students cannot be physically deleted');
select extensions.throws_ok($$delete from public.guardians where id = 'f7500000-0000-4000-8000-000000000001'$$, '55000', 'HISTORICAL_RECORD_DELETE_FORBIDDEN', '50. guardians cannot be physically deleted');
select extensions.throws_ok($$delete from public.enrollments where id = 'f7600000-0000-4000-8000-000000000001'$$, '55000', 'HISTORICAL_RECORD_DELETE_FORBIDDEN', '51. enrolments cannot be physically deleted');
select extensions.ok(exists (select 1 from pg_indexes where indexname = 'student_one_primary_guardian_idx'), '52. one-primary-guardian uniqueness remains enforced');
select extensions.ok(exists (select 1 from pg_trigger where tgname = 'audit_logs_prevent_mutation' and not tgisinternal), '53. audit events remain append-only');
select extensions.ok(not has_table_privilege('authenticated', 'public.guardians', 'SELECT'), '54. broad guardian contact reads remain denied');
select extensions.ok(not has_table_privilege('authenticated', 'public.student_guardians', 'SELECT'), '55. broad relationship reads remain denied');
select extensions.ok(has_function_privilege('authenticated', 'public.get_student_guardians(uuid)', 'EXECUTE'), '56. authenticated callers can reach guarded guardian reads');
select extensions.ok(not has_function_privilege('anon', 'public.get_student_guardians(uuid)', 'EXECUTE'), '57. anonymous guardian reads are denied');
select extensions.ok(has_function_privilege('authenticated', 'public.list_students(text,student_status,uuid,uuid,uuid,enrollment_status,integer,integer)', 'EXECUTE'), '58. authenticated callers can reach guarded student lists');
select extensions.ok(not has_function_privilege('anon', 'public.list_students(text,student_status,uuid,uuid,uuid,enrollment_status,integer,integer)', 'EXECUTE'), '59. anonymous student lists are denied');
select extensions.is((select class_number from public.enrollments where id = 'f7600000-0000-4000-8000-000000000001'), '7', '60. class numbers are canonically trimmed');

select * from extensions.finish();
rollback;
