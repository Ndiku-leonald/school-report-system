begin;

select extensions.no_plan();

select extensions.has_table('public', 'report_snapshot_sources', 'snapshot lineage table exists');
select extensions.has_function('public', 'generate_student_report_snapshot', array['uuid','uuid'], 'single snapshot generation RPC exists');
select extensions.has_function('public', 'generate_grade_report_snapshots', array['uuid'], 'batch snapshot generation RPC exists');
select extensions.has_function('public', 'get_report_generation_readiness', array['uuid'], 'snapshot readiness RPC exists');
select extensions.has_function('public', 'list_generated_reports', array['uuid'], 'generated report list RPC exists');
select extensions.has_function('public', 'get_generated_report', array['uuid'], 'generated report detail RPC exists');
select extensions.has_function('public', 'get_report_snapshot', array['uuid'], 'snapshot read RPC exists');
select extensions.has_function('public', 'get_report_subject_results', array['uuid'], 'subject snapshot read RPC exists');
select extensions.has_function('public', 'get_student_report_history', array['uuid','uuid'], 'report history RPC exists');

select extensions.ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.report_snapshot_sources'::regclass),
  'snapshot lineage uses forced RLS'
);
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.report_snapshots'::regclass),
  'snapshots use forced RLS'
);
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.report_subject_results'::regclass),
  'subject snapshots use forced RLS'
);

select extensions.ok(not has_table_privilege('anon', 'public.report_snapshot_sources', 'SELECT,INSERT,UPDATE,DELETE'), 'anonymous has no lineage table access');
select extensions.ok(not has_table_privilege('authenticated', 'public.report_snapshot_sources', 'INSERT,UPDATE,DELETE'), 'authenticated cannot write lineage directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.report_snapshots', 'INSERT,UPDATE,DELETE'), 'authenticated cannot write snapshots directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.report_subject_results', 'INSERT,UPDATE,DELETE'), 'authenticated cannot write subject snapshots directly');
select extensions.ok(not has_function_privilege('anon', 'public.generate_student_report_snapshot(uuid,uuid)', 'EXECUTE'), 'anonymous cannot generate a snapshot');
select extensions.ok(not has_function_privilege('anon', 'public.generate_grade_report_snapshots(uuid)', 'EXECUTE'), 'anonymous cannot batch generate snapshots');
select extensions.ok(not has_function_privilege('anon', 'public.get_generated_report(uuid)', 'EXECUTE'), 'anonymous cannot read a snapshot');
select extensions.ok(not has_function_privilege('authenticated', 'internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated cannot call snapshot helper');

select extensions.ok(exists(select 1 from pg_trigger where tgname = 'reports_generated_prevent_mutation'), 'generated reports have mutation protection');
select extensions.ok(exists(select 1 from pg_trigger where tgname = 'report_subject_results_generated_prevent_mutation'), 'subject snapshots have mutation protection');
select extensions.ok(exists(select 1 from pg_trigger where tgname = 'report_snapshot_sources_prevent_mutation'), 'lineage has mutation protection');
select extensions.ok(exists(select 1 from pg_trigger where tgname = 'report_snapshot_sources_validate_scope'), 'lineage scope is validated');
select extensions.ok(not exists(select 1 from pg_indexes where indexname = 'report_calculation_enrollment_context_unique'), 'historical context checksum uniqueness is removed');
select extensions.ok(exists(select 1 from pg_indexes where indexname = 'report_one_direct_successor_unique'), 'one direct report successor is enforced');
select extensions.ok(exists(select 1 from pg_indexes where indexname = 'report_batch_calculation_run_unique'), 'one report batch exists per calculation run');
select extensions.ok(
  exists(select 1 from pg_indexes where indexname = 'report_batch_calculation_run_unique' and indexdef !~* 'where'),
  'batch uniqueness is a normal unique index that supports ON CONFLICT inference'
);
select extensions.ok(
  not exists(select 1 from pg_indexes where indexname = 'report_calculation_run_enrollment_unique'),
  'legacy run and enrollment uniqueness is removed'
);
select extensions.ok(
  not exists(select 1 from pg_constraint where conname = 'report_snapshot_source_run_student_unique'),
  'legacy lineage run and student uniqueness is removed'
);
select extensions.ok(exists(select 1 from pg_indexes where indexname = 'report_term_enrollment_version_unique'), 'report history version uniqueness remains the identity boundary');

select extensions.ok(exists(select 1 from pg_attribute where attrelid = 'public.reports'::regclass and attname = 'calculation_run_id'), 'reports link to calculation runs');
select extensions.ok(exists(select 1 from pg_attribute where attrelid = 'public.reports'::regclass and attname = 'snapshot_context_checksum'), 'reports store context checksum');
select extensions.ok(exists(select 1 from pg_attribute where attrelid = 'public.report_snapshots'::regclass and attname = 'snapshot_schema_version'), 'snapshots store schema version');
select extensions.ok(exists(select 1 from pg_attribute where attrelid = 'public.report_snapshots'::regclass and attname = 'snapshot_checksum'), 'snapshots store checksum');
select extensions.ok(exists(select 1 from pg_attribute where attrelid = 'public.report_subject_results'::regclass and attname = 'subject_name'), 'subject snapshots store subject identity');
select extensions.ok(exists(select 1 from pg_attribute where attrelid = 'public.report_subject_results'::regclass and attname = 'subject_status'), 'subject snapshots store status');
select extensions.ok(exists(select 1 from pg_trigger where tgname = 'report_snapshots_generated_prevent_mutation'), 'generated snapshot rows have explicit mutation protection');

select extensions.is((select proconfig[1] from pg_proc where oid = 'public.generate_student_report_snapshot(uuid,uuid)'::regprocedure), 'search_path=pg_catalog, public, internal', 'single generation has fixed search path');
select extensions.is((select proconfig[1] from pg_proc where oid = 'public.generate_grade_report_snapshots(uuid)'::regprocedure), 'search_path=pg_catalog, public, internal', 'batch generation has fixed search path');
select extensions.ok(pg_get_functiondef('public.generate_student_report_snapshot(uuid,uuid)'::regprocedure) ~* 'lock_and_require_results_authority', 'single generation locks selected authority');
select extensions.ok(pg_get_functiondef('public.generate_grade_report_snapshots(uuid)'::regprocedure) ~* 'pg_advisory_xact_lock', 'batch generation serializes concurrent requests');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'snapshot_schema_version', 'snapshot schema version is explicit');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'extensions.digest', 'snapshot checksum uses SHA-256 digest');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'calculation_run_id', 'snapshot payload contains calculation lineage');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'student_row', 'snapshot freezes student identity');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'school_row', 'snapshot freezes school identity');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'attendance_row.id is null then null', 'missing attendance remains unavailable');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'comment_row.id is null then null', 'missing comments remain unavailable');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) !~* 'pdf_storage_path|published_at|student_access_credentials', 'generation does not publish or create parent access');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'current_report', 'new report versions supersede the current report');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'current_report', 'same source is idempotently reused only from the current report');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'snapshot_context_hash', 'context checksum is calculated before idempotence');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'class_teacher_name is null', 'unverified class teacher identity is not invented');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'starts_on > current_term.ends_on', 'next term starts after the current term ends');
select extensions.ok(pg_get_functiondef('internal.lock_and_require_current_report_calculation_source(uuid,uuid)'::regprocedure) ~* 'REPORT_SOURCE_NOT_FINALIZED', 'generation requires a finalized source');
select extensions.ok(pg_get_functiondef('internal.lock_and_require_current_report_calculation_source(uuid,uuid)'::regprocedure) ~* 'REPORT_SOURCE_STALE', 'generation requires the latest current calculation');
select extensions.ok(pg_get_functiondef('internal.generate_student_report_snapshot(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* '11013', 'report history is serialized by term and enrollment');
select extensions.ok(pg_get_functiondef('public.get_report_generation_readiness(uuid)'::regprocedure) ~* 'population > 0', 'readiness requires a populated Stage 11 source');
select extensions.ok(pg_get_functiondef('public.get_report_generation_readiness(uuid)'::regprocedure) ~* 'count\(distinct report.enrollment_id\)', 'readiness counts persisted snapshots rather than report versions');
select extensions.ok(pg_get_functiondef('internal.validate_report_calculation_lineage(public.reports,public.result_calculation_runs)'::regprocedure) ~* 'supersedes_run_id', 'report versions require direct calculation lineage');
select extensions.ok(pg_get_functiondef('internal.validate_report_snapshot_source_scope()'::regprocedure) ~* 'snapshot_checksum', 'lineage validates stored snapshot checksum');
select extensions.ok(pg_get_functiondef('public.get_generated_report(uuid)'::regprocedure) !~* 'students|subjects|enrollments', 'report detail reads the stored snapshot without live-data fallback');

select * from extensions.finish();
rollback;
