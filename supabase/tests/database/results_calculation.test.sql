begin;

select extensions.no_plan();

select extensions.has_type('public', 'calculated_subject_status', 'calculated subject status exists');
select extensions.has_table('public', 'aggregate_classification_scales', 'classification scales exist');
select extensions.has_table('public', 'aggregate_classification_bands', 'classification bands exist');
select extensions.has_table('public', 'result_calculation_runs', 'calculation runs exist');
select extensions.has_table('public', 'result_calculation_sources', 'source manifests exist');
select extensions.has_table('public', 'calculated_student_results', 'student results exist');
select extensions.has_table('public', 'calculated_subject_results', 'subject results exist');
select extensions.has_table('public', 'calculated_component_explanations', 'calculation explanations exist');
select extensions.has_table('public', 'calculated_subject_performance', 'subject performance exists');

select extensions.has_function('public', 'calculate_grade_results', array['uuid','uuid','uuid','uuid','uuid'], 'calculation RPC exists');
select extensions.has_function('public', 'list_result_calculation_terms', array[]::text[], 'calculation scope read RPC exists');
select extensions.has_function('public', 'get_result_calculation_run', array['uuid'], 'run detail RPC exists');
select extensions.has_function('public', 'list_calculated_student_results', array['uuid'], 'student result read RPC exists');
select extensions.has_function('public', 'list_calculated_subject_results', array['uuid','uuid'], 'subject result read RPC exists');
select extensions.has_function('public', 'list_result_component_explanations', array['uuid','uuid'], 'explanation read RPC exists');
select extensions.has_function('public', 'list_result_subject_performance', array['uuid'], 'performance read RPC exists');
select extensions.has_function('public', 'save_aggregate_classification_scale', array['uuid','timestamp with time zone','uuid','uuid','text','jsonb'], 'classification draft RPC exists');
select extensions.has_function('public', 'create_aggregate_classification_scale_version', array['uuid','timestamp with time zone','text','jsonb'], 'classification version RPC exists');

select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.result_calculation_runs'::regclass), 'runs use forced RLS');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.result_calculation_sources'::regclass), 'sources use forced RLS');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.calculated_student_results'::regclass), 'student results use forced RLS');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.calculated_subject_results'::regclass), 'subject results use forced RLS');
select extensions.ok(not has_table_privilege('authenticated', 'public.result_calculation_runs', 'INSERT,UPDATE,DELETE'), 'browser cannot mutate runs directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.result_calculation_sources', 'INSERT,UPDATE,DELETE'), 'browser cannot mutate sources directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.calculated_student_results', 'INSERT,UPDATE,DELETE'), 'browser cannot mutate student results directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.calculated_subject_results', 'INSERT,UPDATE,DELETE'), 'browser cannot mutate subject results directly');
select extensions.ok(not has_function_privilege('anon', 'public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot calculate');
select extensions.ok(not has_function_privilege('authenticated', 'internal.require_results_actor()', 'EXECUTE'), 'authenticated cannot call calculation actor helper');
select extensions.ok(not has_function_privilege('authenticated', 'internal.validate_results_grading_scale(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE'), 'authenticated cannot call grading helper');
select extensions.is((select proconfig[1] from pg_proc where oid = 'public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure), 'search_path=pg_catalog, public, internal', 'calculation RPC has fixed search path');
select extensions.is((select proconfig[1] from pg_proc where oid = 'public.list_result_calculation_terms()'::regprocedure), 'search_path=pg_catalog, public, internal', 'calculation read RPC has fixed search path');

select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'status <> ''LOCKED''', 'calculation rejects non-locked terms');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'row_number\(\) over\(partition by sheet.term_id, sheet.class_section_id, sheet.subject_id order by sheet.version desc', 'latest source revision is derived in the database');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'workflow_status <> ''LOCKED''', 'latest source must be locked');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'included_weight', 'weight renormalization is calculated');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'round\(sum\(explanation.weighted_contribution\)', 'subject scores use deterministic numeric rounding');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'PRESENT.*ABSENT', 'present and absent states are explicit');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'NOT_ASSESSED', 'not-assessed inputs remain incomplete');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'aggregate_points is null', 'missing aggregate points abort');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'ranking_eligible', 'ranking eligibility is separately calculated');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'pg_advisory_xact_lock', 'calculation version races are serialized');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'input_checksum', 'input checksum is persisted');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'output_checksum', 'output checksum is persisted');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'previous.input_checksum = input_hash', 'identical inputs reuse a run');
select extensions.ok(pg_get_functiondef('public.calculate_grade_results(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'previous.id', 'correction runs supersede the previous version');

select extensions.ok(exists(select 1 from pg_trigger where tgname = 'result_calculation_runs_append_only'), 'runs are append-only');
select extensions.ok(exists(select 1 from pg_trigger where tgname = 'result_calculation_sources_append_only'), 'sources are append-only');
select extensions.ok(exists(select 1 from pg_trigger where tgname = 'calculated_student_results_append_only'), 'student results are append-only');
select extensions.ok(exists(select 1 from pg_trigger where tgname = 'calculated_subject_results_append_only'), 'subject results are append-only');
select extensions.ok(exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'result_calculation_one_direct_successor_idx' and indexdef ilike '%unique%'), 'successor uniqueness index exists');
select extensions.ok(exists(select 1 from pg_constraint where conname = 'aggregate_classification_band_range_exclusion'), 'classification ranges cannot overlap');
select extensions.ok(pg_get_functiondef('public.list_calculated_student_results(uuid)'::regprocedure) !~* 'guardian|phone|email', 'result read output has no guardian contacts');

select * from extensions.finish();
rollback;
