begin;

select extensions.no_plan();

select extensions.has_function('internal','lock_and_require_marks_workflow_authority',array['app_permission'],'generic locked workflow authority exists');
select extensions.has_function('public','submit_mark_sheet',array['uuid','timestamp with time zone'],'submit RPC exists');
select extensions.has_function('public','resubmit_returned_mark_sheet',array['uuid','timestamp with time zone'],'resubmit RPC exists');
select extensions.has_function('public','start_mark_sheet_review',array['uuid','timestamp with time zone'],'review-start RPC exists');
select extensions.has_function('public','return_mark_sheet',array['uuid','timestamp with time zone','text'],'return RPC exists');
select extensions.has_function('public','approve_mark_sheet',array['uuid','timestamp with time zone'],'approval RPC exists');
select extensions.has_function('public','lock_mark_sheet',array['uuid','timestamp with time zone'],'sheet-lock RPC exists');
select extensions.has_function('public','open_term_marks_entry',array['uuid','timestamp with time zone'],'term entry RPC exists');
select extensions.has_function('public','advance_term_marks_to_review',array['uuid','timestamp with time zone'],'term review RPC exists');
select extensions.has_function('public','lock_term_marks',array['uuid','timestamp with time zone'],'term lock RPC exists');
select extensions.has_function('public','reopen_locked_term_for_mark_correction',array['uuid','timestamp with time zone','text'],'controlled reopen RPC exists');
select extensions.has_function('public','create_mark_sheet_correction_revision',array['uuid','timestamp with time zone','text'],'correction revision RPC exists');
select extensions.has_function('public','list_marks_review_queue',array['uuid','uuid','uuid','uuid','uuid','uuid','mark_sheet_status','integer','integer'],'review queue RPC exists');
select extensions.has_function('public','get_mark_sheet_workflow_detail',array['uuid'],'workflow detail RPC exists');
select extensions.has_function('public','get_mark_sheet_workflow_history',array['uuid'],'workflow history RPC exists');
select extensions.has_function('public','get_term_marks_workflow_readiness',array['uuid'],'term readiness RPC exists');
select extensions.has_function('public','list_marks_workflow_terms',array[]::text[],'term workflow list RPC exists');

select extensions.ok(not has_function_privilege('anon','public.submit_mark_sheet(uuid,timestamp with time zone)','EXECUTE'),'anon cannot submit');
select extensions.ok(not has_function_privilege('anon','public.start_mark_sheet_review(uuid,timestamp with time zone)','EXECUTE'),'anon cannot review');
select extensions.ok(not has_function_privilege('anon','public.approve_mark_sheet(uuid,timestamp with time zone)','EXECUTE'),'anon cannot approve');
select extensions.ok(not has_function_privilege('anon','public.lock_mark_sheet(uuid,timestamp with time zone)','EXECUTE'),'anon cannot lock sheets');
select extensions.ok(not has_function_privilege('anon','public.reopen_locked_term_for_mark_correction(uuid,timestamp with time zone,text)','EXECUTE'),'anon cannot reopen terms');
select extensions.ok(not has_function_privilege('authenticated','internal.lock_and_require_marks_workflow_authority(app_permission)','EXECUTE'),'authenticated cannot call the internal authority helper');
select extensions.ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.submit_mark_sheet(uuid,timestamp with time zone)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC submit execution is revoked');
select extensions.ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.return_mark_sheet(uuid,timestamp with time zone,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC return execution is revoked');
select extensions.ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.lock_term_marks(uuid,timestamp with time zone)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC term-lock execution is revoked');

select extensions.is((select proconfig[1] from pg_proc where oid='public.submit_mark_sheet(uuid,timestamp with time zone)'::regprocedure),'search_path=pg_catalog, public, internal','submit has fixed search path');
select extensions.is((select proconfig[1] from pg_proc where oid='public.return_mark_sheet(uuid,timestamp with time zone,text)'::regprocedure),'search_path=pg_catalog, public, internal','return has fixed search path');
select extensions.is((select proconfig[1] from pg_proc where oid='public.lock_mark_sheet(uuid,timestamp with time zone)'::regprocedure),'search_path=pg_catalog, public, internal','sheet lock has fixed search path');
select extensions.is((select proconfig[1] from pg_proc where oid='public.advance_term_marks_to_review(uuid,timestamp with time zone)'::regprocedure),'search_path=pg_catalog, public, internal','term review has fixed search path');
select extensions.is((select proconfig[1] from pg_proc where oid='public.create_mark_sheet_correction_revision(uuid,timestamp with time zone,text)'::regprocedure),'search_path=pg_catalog, public, internal','correction creation has fixed search path');
select extensions.is((select proconfig[1] from pg_proc where oid='public.list_marks_review_queue(uuid,uuid,uuid,uuid,uuid,uuid,mark_sheet_status,integer,integer)'::regprocedure),'search_path=pg_catalog, public, internal','queue read has fixed search path');

select extensions.has_column('public','mark_sheets','supersedes_mark_sheet_id','correction lineage column exists');
select extensions.fk_ok('public','mark_sheets','supersedes_mark_sheet_id','public','mark_sheets','id','lineage references mark sheets');
select extensions.ok(exists(select 1 from pg_constraint where conname='mark_sheet_not_self_superseding'),'self-superseding revision is forbidden');
select extensions.ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='mark_sheet_one_direct_successor_idx' and indexdef ilike '%unique%'),'one direct successor is structurally enforced');
select extensions.ok(pg_get_functiondef('internal.protect_mark_sheet_identity()'::regprocedure) ~* 'supersedes_mark_sheet_id' and pg_get_functiondef('internal.protect_mark_sheet_identity()'::regprocedure) ~* 'old.version is distinct from new.version','revision lineage and version are immutable');
select extensions.ok(exists(select 1 from pg_trigger where tgname='zy_mark_sheets_protect_workflow_stage10' and not tgisinternal),'direct sheet workflow guard is installed');
select extensions.ok(exists(select 1 from pg_trigger where tgname='zy_terms_protect_marks_workflow_stage10' and not tgisinternal),'direct term workflow guard is installed');
select extensions.ok(exists(select 1 from pg_trigger where tgname='zz_marks_protect_frozen_state_stage10' and not tgisinternal),'frozen mark guard is installed');
select extensions.ok(exists(select 1 from pg_trigger where tgname='zz_enrollments_lock_terms_stage10' and not tgisinternal),'enrollment roster workflow guard is installed');
select extensions.ok(pg_get_functiondef('internal.lock_enrollment_terms_for_marks_workflow()'::regprocedure) ~* 'ENROLLMENT_MARKS_WORKFLOW_FROZEN' and pg_get_functiondef('internal.lock_enrollment_terms_for_marks_workflow()'::regprocedure) ~* 'SUBMITTED.*UNDER_REVIEW.*APPROVED.*LOCKED','enrollment roster changes reject frozen term or sheet scope');
select extensions.ok(pg_get_functiondef('internal.lock_enrollment_terms_for_marks_workflow()'::regprocedure) ~* 'for update nowait' and pg_get_functiondef('internal.lock_enrollment_terms_for_marks_workflow()'::regprocedure) ~* 'ENROLLMENT_MARKS_WORKFLOW_CONFLICT','enrollment roster locking fails fast instead of forming a term-to-enrollment deadlock');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.mark_sheets'::regclass),'mark-sheet RLS remains forced');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.marks'::regclass),'marks RLS remains forced');
select extensions.ok(not has_table_privilege('authenticated','public.mark_sheets','INSERT,UPDATE,DELETE'),'authenticated direct sheet writes remain denied');
select extensions.ok(not has_table_privilege('authenticated','public.marks','INSERT,UPDATE,DELETE'),'authenticated direct mark writes remain denied');

select extensions.ok(pg_get_functiondef('public.submit_mark_sheet(uuid,timestamp with time zone)'::regprocedure) ~* 'internal.mark_sheet_completion' and pg_get_functiondef('public.submit_mark_sheet(uuid,timestamp with time zone)'::regprocedure) ~* 'MARK_SHEET_INCOMPLETE','submission checks authoritative completeness');
select extensions.ok(pg_get_functiondef('public.start_mark_sheet_review(uuid,timestamp with time zone)'::regprocedure) ~* 'submitted_by = actor.membership_id','review start enforces submitter separation');
select extensions.ok(pg_get_functiondef('public.approve_mark_sheet(uuid,timestamp with time zone)'::regprocedure) ~* 'submitted_by = actor.membership_id','approval enforces submitter separation');
select extensions.ok(pg_get_functiondef('public.lock_mark_sheet(uuid,timestamp with time zone)'::regprocedure) ~* 'submitted_by = actor.membership_id','sheet lock enforces submitter separation');
select extensions.ok(pg_get_functiondef('internal.lock_term_marks_workflow_context(uuid,uuid,timestamp with time zone)'::regprocedure) ~* 'order by assignment.id' and pg_get_functiondef('internal.lock_term_marks_workflow_context(uuid,uuid,timestamp with time zone)'::regprocedure) ~* 'order by sheet.id','term-wide academic locks are deterministic');
select extensions.ok(pg_get_functiondef('public.get_term_marks_workflow_readiness(uuid)'::regprocedure) ~* 'internal.term_marks_workflow_readiness','readiness derives server-side scope counts');
select extensions.ok(pg_get_functiondef('public.reopen_locked_term_for_mark_correction(uuid,timestamp with time zone,text)'::regprocedure) ~* 'report_batches' and pg_get_functiondef('public.reopen_locked_term_for_mark_correction(uuid,timestamp with time zone,text)'::regprocedure) ~* 'promotion_decisions','term reopen checks downstream dependencies');
select extensions.ok(pg_get_functiondef('public.reopen_locked_term_for_mark_correction(uuid,timestamp with time zone,text)'::regprocedure) ~* 'batch.status <> ''COMPLETED''' and pg_get_functiondef('public.reopen_locked_term_for_mark_correction(uuid,timestamp with time zone,text)'::regprocedure) ~* 'report.status not in \(''PUBLISHED'', ''WITHDRAWN'', ''SUPERSEDED''\)','finalized report history remains correctable while active downstream work stays blocked');
select extensions.ok(pg_get_functiondef('public.create_mark_sheet_correction_revision(uuid,timestamp with time zone,text)'::regprocedure) ~* 'source_sheet.version \+ 1' and pg_get_functiondef('public.create_mark_sheet_correction_revision(uuid,timestamp with time zone,text)'::regprocedure) ~* 'from public.marks source_mark','correction creation increments a new row and clones marks');
select extensions.ok(pg_get_functiondef('internal.validate_mark_sheet_scope()'::regprocedure) ~* 'source_sheet.workflow_status <> ''LOCKED''' and pg_get_functiondef('internal.validate_mark_sheet_scope()'::regprocedure) ~* 'assessment_scheme_id is distinct from source_sheet.assessment_scheme_id','only exact locked-source schemes continue into corrections');
select extensions.ok(pg_get_function_result('public.get_mark_sheet_workflow_history(uuid)'::regprocedure) !~* 'email|phone|token|password|guardian','workflow history contract omits contacts and credentials');
select extensions.ok(pg_get_function_result('public.get_term_marks_workflow_readiness(uuid)'::regprocedure) !~* 'score|grade|average|position|rank','readiness contract contains no Stage 11 calculations');

select * from extensions.finish();
rollback;
