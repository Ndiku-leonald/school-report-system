-- Stage 14 database boundary checks. Behavioral lifecycle coverage lives in
-- the signed-in integration suite; these checks execute against the rebuilt
-- local schema and do not use production data.
select plan(41);

select extensions.ok(exists (select 1 from storage.buckets where id = 'report-artifacts'), 'bucket exists');
select extensions.is((select public from storage.buckets where id = 'report-artifacts'), false, 'bucket is private');
select extensions.is((select file_size_limit from storage.buckets where id = 'report-artifacts'), 10485760::bigint, 'bucket is limited to 10 MiB');
select extensions.ok((select 'application/pdf' = any(allowed_mime_types) from storage.buckets where id = 'report-artifacts'), 'bucket only allows PDF MIME type');

select extensions.ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='reports' and column_name='workflow_version'), 'workflow version column exists');
select extensions.ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='reports' and column_name='pdf_size_bytes'), 'artifact size column exists');
select extensions.ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='reports' and column_name='pdf_stored_at'), 'artifact stored timestamp exists');
select extensions.ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='reports' and column_name='pdf_renderer_version'), 'renderer version column exists');
select extensions.ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='reports' and column_name='withdrawal_reason'), 'withdrawal reason column exists');
select extensions.ok(exists (select 1 from pg_indexes where schemaname='public' and indexname='reports_current_published_unique'), 'one current published report index exists');
select extensions.ok(exists (select 1 from pg_constraint where conname='reports_artifact_metadata_complete'), 'artifact metadata constraint exists');
select extensions.ok(exists (select 1 from pg_constraint where conname='reports_workflow_version_valid'), 'workflow version constraint exists');

select extensions.ok(to_regprocedure('public.authorize_report_artifact_generation(uuid)') is not null, 'artifact generation authorization RPC exists');
select extensions.ok(to_regprocedure('public.register_report_pdf_artifact(uuid,bigint,text)') is not null, 'narrow artifact registration RPC exists');
select extensions.ok(to_regprocedure('public.register_report_pdf_artifact(uuid,bigint,text,text,bigint,text)') is null, 'caller metadata registration RPC is absent');
select extensions.ok(to_regprocedure('public.review_generated_report(uuid,bigint)') is not null, 'review RPC exists');
select extensions.ok(to_regprocedure('public.publish_reviewed_report(uuid,bigint)') is not null, 'publish RPC exists');
select extensions.ok(to_regprocedure('public.withdraw_published_report(uuid,bigint,text)') is not null, 'withdraw RPC exists');
select extensions.ok(to_regprocedure('public.get_report_artifact_descriptor(uuid)') is not null, 'descriptor RPC exists');
select extensions.ok(to_regprocedure('public.record_report_artifact_access(uuid,text)') is not null, 'artifact access audit RPC exists');
select extensions.ok(to_regprocedure('internal.lock_and_require_report_authority(uuid,public.app_permission[])') is not null, 'authority lock helper exists');
select extensions.ok(to_regprocedure('internal.report_artifact_access(text,boolean)') is not null, 'storage access helper exists');

select extensions.is(internal.report_artifact_access('invalid', false), false, 'invalid artifact path is denied');
select extensions.is(internal.report_artifact_access('00000000-0000-0000-0000-000000000000/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.pdf', false), false, 'noncanonical checksum path is denied');
select extensions.is(internal.report_artifact_access('00000000-0000-0000-0000-000000000000/' || repeat('a',64) || '.pdf', false), false, 'unknown report path is denied');

select extensions.ok(not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and roles @> array['anon']::name[] and policyname like 'report_artifacts%'), 'no anonymous report artifact policy exists');
select extensions.ok(not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'report_artifacts%'), 'direct report artifact Storage policies are absent');
select extensions.ok(not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'report_artifacts%update%'), 'storage UPDATE policy is absent');

select extensions.ok(not has_table_privilege('authenticated', 'public.reports', 'UPDATE'), 'authenticated users cannot update reports directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.reports', 'DELETE'), 'authenticated users cannot delete reports directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.report_snapshots', 'UPDATE'), 'authenticated users cannot update snapshots directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.report_subject_results', 'DELETE'), 'authenticated users cannot delete subject snapshots directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.report_snapshot_sources', 'UPDATE'), 'authenticated users cannot update snapshot lineage directly');

select extensions.ok(pg_get_functiondef('internal.prevent_generated_report_mutation()'::regprocedure) like '%app.report_publication_workflow%', 'generated report guard has a separate workflow context');
select extensions.ok(pg_get_functiondef('internal.prevent_generated_report_mutation()'::regprocedure) like '%app.report_snapshot_generation%', 'Stage 12 generation context remains supported');
select extensions.ok(pg_get_functiondef('public.record_report_artifact_access(uuid,text)'::regprocedure) like '%REPORT_ARTIFACT_ACCESSED%', 'artifact access emits the required audit action');
select extensions.ok(pg_get_functiondef('internal.lock_and_require_report_authority(uuid,public.app_permission[])'::regprocedure) like '%assignment.granted_at <= now()%', 'future role assignments do not grant authority');
select extensions.ok(exists (select 1 from pg_trigger where tgname = 'a_reports_generation_supersession_status'), 'generation supersession status trigger exists');
select extensions.ok(pg_get_functiondef('internal.apply_report_generation_supersession_status()'::regprocedure) like '%SUPERSEDED%', 'generation supersession status is applied by trigger');
select extensions.ok(pg_get_functiondef('public.register_report_pdf_artifact(uuid,bigint,text)'::regprocedure) like '%metadata%size%', 'registration derives size from Storage metadata');
select extensions.ok(pg_get_functiondef('public.register_report_pdf_artifact(uuid,bigint,text)'::regprocedure) like '%report-card-v1%', 'registration uses fixed trusted renderer contract');

select * from finish();
