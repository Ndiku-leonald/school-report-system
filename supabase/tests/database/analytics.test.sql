select plan(43);

select extensions.has_function('internal', 'current_analytics_reader', array[]::text[], 'analytics reader helper exists');
select extensions.has_function('internal', 'require_analytics_reader', array[]::text[], 'analytics required helper exists');
select extensions.has_function('internal', 'analytics_run_is_current', array['uuid','uuid'], 'current run resolver exists');
select extensions.has_function('public', 'list_analytics_scopes', array[]::text[], 'scope RPC exists');
select extensions.has_function('public', 'get_school_analytics', array['uuid'], 'school RPC exists');
select extensions.has_function('public', 'get_grade_analytics', array['uuid'], 'grade RPC exists');
select extensions.has_function('public', 'list_analytics_class_summaries', array['uuid'], 'class summaries RPC exists');
select extensions.has_function('public', 'get_class_analytics', array['uuid','uuid'], 'class RPC exists');
select extensions.has_function('public', 'list_analytics_distributions', array['uuid','uuid'], 'distribution RPC exists');
select extensions.has_function('public', 'list_analytics_subject_performance', array['uuid','uuid'], 'subject RPC exists');
select extensions.has_function('public', 'list_analytics_top_students', array['uuid','uuid','integer'], 'ranking RPC exists');
select extensions.has_function('public', 'list_analytics_attention_students', array['uuid','uuid'], 'attention RPC exists');
select extensions.has_function('public', 'get_analytics_student', array['uuid','uuid'], 'student RPC exists');
select extensions.has_function('public', 'list_analytics_student_subjects', array['uuid','uuid'], 'student subjects RPC exists');

select extensions.is((select proconfig[1] from pg_proc where oid = 'internal.current_analytics_reader()'::regprocedure), 'search_path=pg_catalog, public, internal', 'reader helper fixes search path');
select extensions.ok(pg_get_functiondef('internal.require_analytics_reader()'::regprocedure) ~* 'ANALYTICS_FORBIDDEN', 'reader helper fails closed');
select extensions.ok(pg_get_functiondef('internal.current_analytics_reader()'::regprocedure) ~* 'current_auth_session_id', 'reader uses verified session');
select extensions.ok(pg_get_functiondef('internal.current_analytics_reader()'::regprocedure) ~* 'ANALYTICS_VIEW', 'reader uses independent analytics permission');
select extensions.ok(pg_get_functiondef('internal.current_analytics_reader()'::regprocedure) ~* 'membership.status = ''ACTIVE''', 'reader requires active membership');
select extensions.ok(pg_get_functiondef('internal.current_analytics_reader()'::regprocedure) ~* 'school.is_active', 'reader requires active school');
select extensions.ok(not has_function_privilege('anon', 'internal.current_analytics_reader()', 'EXECUTE'), 'anon cannot execute internal reader');
select extensions.ok(not has_function_privilege('authenticated', 'internal.current_analytics_reader()', 'EXECUTE'), 'authenticated cannot execute internal reader');
select extensions.ok(not has_function_privilege('public', 'internal.current_analytics_reader()', 'EXECUTE'), 'public cannot execute internal reader');

select extensions.ok(has_function_privilege('authenticated', 'public.list_analytics_scopes()', 'EXECUTE'), 'authenticated can execute public scope RPC');
select extensions.ok(has_function_privilege('authenticated', 'public.get_school_analytics(uuid)', 'EXECUTE'), 'authenticated can execute school RPC');
select extensions.ok(has_function_privilege('authenticated', 'public.get_grade_analytics(uuid)', 'EXECUTE'), 'authenticated can execute grade RPC');
select extensions.ok(has_function_privilege('authenticated', 'public.list_analytics_top_students(uuid,uuid,integer)', 'EXECUTE'), 'authenticated can execute ranking RPC');
select extensions.ok(not has_function_privilege('anon', 'public.list_analytics_scopes()', 'EXECUTE'), 'anon cannot execute scope RPC');
select extensions.ok(not has_function_privilege('public', 'public.list_analytics_scopes()', 'EXECUTE'), 'public cannot execute scope RPC');

select extensions.ok(not has_table_privilege('authenticated', 'public.calculated_student_results', 'INSERT,UPDATE,DELETE'), 'analytics adds no student result writes');
select extensions.ok(not has_table_privilege('authenticated', 'public.calculated_subject_results', 'INSERT,UPDATE,DELETE'), 'analytics adds no subject result writes');
select extensions.ok(not has_table_privilege('authenticated', 'public.calculated_subject_performance', 'INSERT,UPDATE,DELETE'), 'analytics adds no performance writes');
select extensions.ok(not exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like '%analytics%' and prokind = 'p'), 'analytics adds no procedures');
select extensions.ok(not has_table_privilege('authenticated', 'public.guardians', 'SELECT'), 'analytics grants no guardian reads');
select extensions.ok(not has_table_privilege('authenticated', 'public.student_access_credentials', 'SELECT'), 'analytics grants no credential reads');
select extensions.ok(not has_table_privilege('authenticated', 'public.parent_access_sessions', 'SELECT'), 'analytics grants no parent session reads');
select extensions.ok(not has_table_privilege('authenticated', 'public.promotion_decisions', 'SELECT'), 'analytics grants no promotion reads');
select extensions.ok(exists(select 1 from pg_enum where enumtypid = 'public.app_permission'::regtype and enumlabel = 'ANALYTICS_VIEW'), 'analytics permission remains existing enum value');
select extensions.ok(pg_get_functiondef('internal.analytics_run_is_current(uuid,uuid)'::regprocedure) ~* 'results_input_checksum', 'currentness reuses Stage 11 checksum');
select extensions.ok(pg_get_functiondef('internal.analytics_run_is_current(uuid,uuid)'::regprocedure) ~* 'workflow_status = ''LOCKED''', 'currentness requires locked sources');
select extensions.ok(pg_get_functiondef('public.list_analytics_top_students(uuid,uuid,integer)'::regprocedure) ~* 'ranking_eligible', 'ranking uses Stage 11 eligibility');
select extensions.ok(pg_get_functiondef('public.list_analytics_top_students(uuid,uuid,integer)'::regprocedure) ~* 'position', 'ranking uses persisted position');
select extensions.ok(pg_get_functiondef('public.list_analytics_attention_students(uuid,uuid)'::regprocedure) !~* 'promotion|repeat|retain', 'attention function has no promotion vocabulary');

select * from finish();
