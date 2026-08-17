begin;

select extensions.plan(41);

select extensions.has_function('public', 'create_teaching_assignment', array['uuid','uuid','uuid','uuid','date','date'], '1. subject assignment creation RPC exists');
select extensions.has_function('public', 'update_teaching_assignment', array['uuid','timestamp with time zone','date','date'], '2. subject assignment update RPC exists');
select extensions.has_function('public', 'end_teaching_assignment', array['uuid','timestamp with time zone','date','text'], '3. subject assignment end RPC exists');
select extensions.has_function('public', 'create_class_teacher_assignment', array['uuid','uuid','uuid','boolean','date','date'], '4. class assignment creation RPC exists');
select extensions.has_function('public', 'update_class_teacher_assignment', array['uuid','timestamp with time zone','date','date'], '5. class assignment update RPC exists');
select extensions.has_function('public', 'end_class_teacher_assignment', array['uuid','timestamp with time zone','date','text'], '6. class assignment end RPC exists');
select extensions.has_function('public', 'replace_primary_class_teacher', array['uuid','uuid','uuid','date','text'], '7. primary replacement RPC exists');
select extensions.has_function('public', 'list_teaching_assignments', array['uuid','uuid','uuid','uuid','uuid','uuid','text','integer','integer'], '8. subject assignment list RPC exists');
select extensions.has_function('public', 'list_class_teacher_assignments', array['uuid','uuid','uuid','uuid','uuid','boolean','text','integer','integer'], '9. class assignment list RPC exists');
select extensions.has_function('public', 'get_teaching_assignment', array['uuid'], '10. subject assignment detail RPC exists');
select extensions.has_function('public', 'get_class_teacher_assignment', array['uuid'], '11. class assignment detail RPC exists');
select extensions.has_function('public', 'list_eligible_subject_teachers', array['uuid','uuid','uuid','date','date'], '12. eligible subject teacher RPC exists');
select extensions.has_function('public', 'list_eligible_class_teachers', array['uuid','uuid','date','date','boolean'], '13. eligible class teacher RPC exists');
select extensions.ok(
  to_regprocedure('public.get_my_teacher_assignments()') is not null
  and to_regprocedure('public.list_assignment_teachers()') is not null,
  '14. own-assignment and narrow teacher-filter directory RPCs exist'
);

select extensions.ok(not has_function_privilege('anon', 'public.create_teaching_assignment(uuid,uuid,uuid,uuid,date,date)', 'EXECUTE'), '15. anonymous mutation execution is denied');
select extensions.ok(not exists (select 1 from pg_proc procedure cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege where procedure.oid = 'public.create_teaching_assignment(uuid,uuid,uuid,uuid,date,date)'::regprocedure and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'), '16. PUBLIC mutation execution is revoked');
select extensions.ok(has_function_privilege('authenticated', 'public.create_teaching_assignment(uuid,uuid,uuid,uuid,date,date)', 'EXECUTE'), '17. authenticated callers can reach guarded mutations');
select extensions.is((select proconfig[1] from pg_proc where oid = 'public.create_teaching_assignment(uuid,uuid,uuid,uuid,date,date)'::regprocedure), 'search_path=pg_catalog, public, internal', '18. mutation has a fixed search path');

select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.teaching_assignments'::regclass), '19. teaching assignment RLS is forced');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.class_teacher_assignments'::regclass), '20. class assignment RLS is forced');
select extensions.ok(not has_table_privilege('authenticated', 'public.teaching_assignments', 'INSERT,UPDATE,DELETE'), '21. direct authenticated subject writes remain denied');
select extensions.ok(not has_table_privilege('authenticated', 'public.class_teacher_assignments', 'INSERT,UPDATE,DELETE'), '22. direct authenticated class writes remain denied');

select extensions.ok(exists (select 1 from pg_constraint where conname = 'teaching_assignment_period_no_overlap' and contype = 'x'), '23. subject periods have a database exclusion constraint');
select extensions.ok(
  exists (select 1 from pg_constraint where conname = 'primary_class_teacher_period_no_overlap' and contype = 'x')
  and exists (select 1 from pg_constraint where conname = 'class_teacher_assignment_period_no_overlap' and contype = 'x'),
  '24. primary scope and same-teacher class periods have database exclusion constraints'
);
select extensions.ok(
  pg_get_functiondef('internal.current_assignment_actor()'::regprocedure) ~* 'staff_session_active_memberships'
  and pg_get_functiondef('internal.current_user_has_permission(uuid,app_permission)'::regprocedure) ~* 'granted_at <= now\(\)'
  and pg_get_functiondef('public.get_my_effective_permissions(uuid)'::regprocedure) ~* 'granted_at <= now\(\)',
  '25. selected-membership actors and shared permission helpers require effective role grants'
);
select extensions.ok(pg_get_functiondef('internal.require_assignment_manager()'::regprocedure) ~* 'ASSIGNMENTS_MANAGE', '26. every manager actor requires the assignment management permission');
select extensions.ok(pg_get_functiondef('internal.assert_teacher_eligibility(uuid,uuid,staff_role)'::regprocedure) ~* 'granted_at <= now\(\)' and pg_get_functiondef('internal.assert_teacher_eligibility(uuid,uuid,staff_role)'::regprocedure) ~* 'revoked_at is null', '27. eligibility requires a currently live teacher role');
select extensions.ok(pg_get_functiondef('internal.current_user_is_subject_teacher_assigned(uuid,uuid,uuid)'::regprocedure) ~* 'SUBJECT_TEACHER' and pg_get_functiondef('internal.current_user_is_subject_teacher_assigned(uuid,uuid,uuid)'::regprocedure) ~* 'current_date between assignment.starts_on', '28. subject access requires a live role and effective dates');
select extensions.ok(pg_get_functiondef('internal.current_user_is_class_teacher_assigned(uuid,uuid)'::regprocedure) ~* 'CLASS_TEACHER' and pg_get_functiondef('internal.current_user_is_class_teacher_assigned(uuid,uuid)'::regprocedure) ~* 'current_date between assignment.starts_on', '29. class access requires a live role and effective dates');
select extensions.ok(exists (select 1 from pg_trigger where tgname = 'teaching_assignments_preserve_history_stage8' and not tgisinternal) and exists (select 1 from pg_trigger where tgname = 'class_teacher_assignments_preserve_history_stage8' and not tgisinternal), '30. both assignment tables preserve historical rows');
select extensions.ok(pg_get_functiondef('internal.teaching_assignment_has_unsafe_dependencies(uuid,date,date)'::regprocedure) ~* 'mark_sheets' and pg_get_functiondef('internal.teaching_assignment_has_unsafe_dependencies(uuid,date,date)'::regprocedure) ~* 'marks', '31. subject date corrections inspect marks dependencies');
select extensions.ok(pg_get_functiondef('internal.class_assignment_has_unsafe_dependencies(uuid,uuid,date,date)'::regprocedure) ~* 'term_attendance' and pg_get_functiondef('internal.class_assignment_has_unsafe_dependencies(uuid,uuid,date,date)'::regprocedure) ~* 'student_term_comments' and pg_get_functiondef('internal.class_assignment_has_unsafe_dependencies(uuid,uuid,date,date)'::regprocedure) ~* 'reports' and pg_get_functiondef('internal.class_assignment_has_unsafe_dependencies(uuid,uuid,date,date)'::regprocedure) ~* 'report_batches' and pg_get_functiondef('internal.class_assignment_has_unsafe_dependencies(uuid,uuid,date,date)'::regprocedure) ~* 'promotion_decisions', '32. class date corrections inspect downstream academic dependencies');
select extensions.ok(pg_get_functiondef('internal.record_assignment_audit(uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,text)'::regprocedure) !~* 'email|phone|jwt|token|cookie', '33. assignment audit helper contains no staff contacts or authentication material');
select extensions.ok(pg_get_functiondef('public.replace_primary_class_teacher(uuid,uuid,uuid,date,text)'::regprocedure) ~* 'class_sections[\s\S]*for update', '34. primary replacement serializes on the class scope');
select extensions.is((select count(*) from regexp_matches(pg_get_functiondef('public.replace_primary_class_teacher(uuid,uuid,uuid,date,text)'::regprocedure), 'record_assignment_audit', 'g')), 2::bigint, '35. primary replacement records exactly two explicit audit events');
select extensions.ok(pg_get_functiondef('public.replace_primary_class_teacher(uuid,uuid,uuid,date,text)'::regprocedure) ~* 'replacement_starts_on - 1', '36. replacement ends the former inclusive period before the new start');
select extensions.ok(pg_get_expr((select polqual from pg_policy where polname = 'teaching_assignments_select_authorized'), (select polrelid from pg_policy where polname = 'teaching_assignments_select_authorized')) ~* 'ASSIGNMENTS_VIEW_ALL' and pg_get_expr((select polqual from pg_policy where polname = 'teaching_assignments_select_authorized'), (select polrelid from pg_policy where polname = 'teaching_assignments_select_authorized')) ~* 'ASSIGNMENTS_MANAGE', '37. subject policy grants selected-school schoolwide reads to readers and managers');
select extensions.ok(
  pg_get_expr((select polqual from pg_policy where polname = 'class_teacher_assignments_select_authorized'), (select polrelid from pg_policy where polname = 'class_teacher_assignments_select_authorized')) ~* 'current_user_owns_active_membership'
  and pg_get_functiondef('public.list_teaching_assignments(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,integer)'::regprocedure) ~* 'SUBJECT_TEACHER'
  and pg_get_functiondef('public.list_class_teacher_assignments(uuid,uuid,uuid,uuid,uuid,boolean,text,integer,integer)'::regprocedure) ~* 'CLASS_TEACHER',
  '38. own reads bind to one selected membership and the matching live teacher role'
);
select extensions.ok(pg_get_function_result('public.list_eligible_subject_teachers(uuid,uuid,uuid,date,date)'::regprocedure) !~* 'email|phone|profile_id|auth', '39. eligible teacher results omit staff contacts and authentication identifiers');
select extensions.ok(pg_get_function_arguments('public.update_teaching_assignment(uuid,timestamp with time zone,date,date)'::regprocedure) ~* 'expected_updated_at' and pg_get_function_arguments('public.end_class_teacher_assignment(uuid,timestamp with time zone,date,text)'::regprocedure) ~* 'expected_updated_at', '40. update and end workflows require optimistic concurrency');
select extensions.ok(
  to_regclass('public.teaching_assignments') is not null
  and to_regclass('public.class_teacher_assignments') is not null
  and not has_function_privilege('anon', 'public.get_my_teacher_assignments()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_assignment_teachers()', 'EXECUTE'),
  '41. original tables remain and anonymous or parent-style callers cannot read assignments'
);

select * from extensions.finish();
rollback;
