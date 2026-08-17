begin;

select extensions.plan(52);

select extensions.has_function('public','get_or_create_draft_mark_sheet',array['uuid'],'1. draft initialization RPC exists');
select extensions.has_function('public','save_mark_entry',array['uuid','uuid','uuid','integer','numeric','assessment_attendance_status','text'],'2. single-cell RPC exists');
select extensions.has_function('public','save_mark_entries',array['uuid','jsonb'],'3. atomic batch RPC exists');
select extensions.has_function('public','list_my_mark_sheets',array[]::text[],'4. teacher list RPC exists');
select extensions.has_function('public','list_mark_sheets',array[]::text[],'5. school list RPC exists');
select extensions.has_function('public','get_mark_sheet',array['uuid'],'6. detail RPC exists');
select extensions.has_function('public','get_mark_entry_grid',array['uuid'],'7. grid RPC exists');
select extensions.ok(not has_function_privilege('anon','public.get_or_create_draft_mark_sheet(uuid)','EXECUTE'),'8. anonymous draft initialization denied');
select extensions.ok(not has_function_privilege('anon','public.save_mark_entries(uuid,jsonb)','EXECUTE'),'9. anonymous batch save denied');
select extensions.ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.save_mark_entry(uuid,uuid,uuid,integer,numeric,assessment_attendance_status,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'10. PUBLIC single save revoked');
select extensions.is((select proconfig[1] from pg_proc where oid='public.save_mark_entries(uuid,jsonb)'::regprocedure),'search_path=pg_catalog, public, internal','11. batch has fixed search path');
select extensions.is((select proconfig[1] from pg_proc where oid='public.get_mark_entry_grid(uuid)'::regprocedure),'search_path=pg_catalog, public, internal','12. grid has fixed search path');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.mark_sheets'::regclass),'13. mark-sheet RLS forced');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.marks'::regclass),'14. marks RLS forced');
select extensions.ok(not has_table_privilege('authenticated','public.mark_sheets','INSERT,UPDATE,DELETE'),'15. authenticated direct sheet writes denied');
select extensions.ok(not has_table_privilege('authenticated','public.marks','INSERT,UPDATE,DELETE'),'16. authenticated direct mark writes denied');
select extensions.ok(pg_get_functiondef('internal.current_marks_actor()'::regprocedure) ~* 'staff_session_active_memberships','17. actor uses selected session membership');
select extensions.ok(pg_get_functiondef('internal.current_marks_actor()'::regprocedure) ~* 'granted_at <= now\(\)' and pg_get_functiondef('internal.current_marks_actor()'::regprocedure) ~* 'revoked_at is null','18. actor uses live grants');
select extensions.ok(pg_get_functiondef('internal.require_marks_entry_actor()'::regprocedure) ~* 'MARKS_ENTER','19. mutation actor requires MARKS_ENTER');
select extensions.ok(pg_get_functiondef('internal.membership_has_live_subject_teacher_role(uuid)'::regprocedure) ~* 'SUBJECT_TEACHER','20. teacher role is exact');
select extensions.ok(pg_get_functiondef('internal.membership_has_current_subject_assignment(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'assignment.id = target_assignment_id','21. assignment ID is authoritative');
select extensions.ok(pg_get_functiondef('internal.membership_has_current_subject_assignment(uuid,uuid,uuid,uuid,uuid)'::regprocedure) ~* 'current_date between assignment.starts_on','22. future and ended assignments rejected');
select extensions.ok(pg_get_functiondef('public.get_or_create_draft_mark_sheet(uuid)'::regprocedure) ~* 'assignment_school_id is distinct from actor.school_id','23. cross-school draft creation rejected');
select extensions.ok(pg_get_functiondef('public.get_or_create_draft_mark_sheet(uuid)'::regprocedure) ~* 'selected_assignment.class_section_id','24. class comes from assignment');
select extensions.ok(pg_get_functiondef('public.get_or_create_draft_mark_sheet(uuid)'::regprocedure) ~* 'selected_assignment.subject_id','25. subject comes from assignment');
select extensions.ok(pg_get_functiondef('public.get_or_create_draft_mark_sheet(uuid)'::regprocedure) ~* 'selected_term.status <> ''MARKS_ENTRY''','26. only MARKS_ENTRY is editable');
select extensions.ok(
  pg_get_functiondef('internal.assert_editable_mark_sheet(uuid,uuid,uuid)'::regprocedure) ~* 'workflow_status <> ''DRAFT'''
  and regexp_count(lower(pg_get_functiondef('internal.assert_editable_mark_sheet(uuid,uuid,uuid)'::regprocedure)), 'for update') >= 3,
  '27. save locks assignment, term, and DRAFT sheet authority rows'
);
select extensions.ok(pg_get_functiondef('public.get_or_create_draft_mark_sheet(uuid)'::regprocedure) ~* 'scheme.status = ''ACTIVE''','28. new sheet requires active scheme');
select extensions.ok(pg_get_functiondef('public.get_or_create_draft_mark_sheet(uuid)'::regprocedure) ~* 'weight_total <> 100','29. scheme weight must total 100');
select extensions.ok(
  regexp_count(lower(pg_get_functiondef('public.get_or_create_draft_mark_sheet(uuid)'::regprocedure)), 'for update') >= 4,
  '30. initialization serializes assignment, term, sheet, and scheme state'
);
select extensions.ok(pg_get_functiondef('public.get_or_create_draft_mark_sheet(uuid)'::regprocedure) ~* '''DRAFT'', 1','31. only revision one DRAFT is created');
select extensions.ok(exists(select 1 from pg_trigger where tgname='zz_mark_sheets_protect_identity_stage9' and not tgisinternal),'32. sheet identity trigger exists');
select extensions.ok(pg_get_functiondef('internal.protect_mark_sheet_identity()'::regprocedure) ~* 'assessment_scheme_id','33. scheme binding immutable');
select extensions.ok(pg_get_functiondef('internal.protect_mark_sheet_identity()'::regprocedure) ~* 'MARK_SHEET_DELETE_FORBIDDEN','34. sheet deletion denied');
select extensions.ok(exists(select 1 from pg_trigger where tgname='marks_protect_identity_stage9' and not tgisinternal),'35. mark identity trigger exists');
select extensions.ok(pg_get_functiondef('internal.protect_mark_identity()'::regprocedure) ~* 'assessment_component_id' and pg_get_functiondef('internal.protect_mark_identity()'::regprocedure) ~* 'enrollment_id','36. mark cell identity immutable');
select extensions.ok(pg_get_functiondef('internal.protect_mark_identity()'::regprocedure) ~* 'MARK_ENTRY_DELETE_FORBIDDEN','37. mark deletion denied');
select extensions.ok(pg_get_functiondef('internal.validate_mark_scope_and_score()'::regprocedure) ~* 'component_scheme_id is distinct from sheet_scheme_id','38. component must belong to bound scheme');
select extensions.ok(pg_get_functiondef('internal.validate_mark_scope_and_score()'::regprocedure) ~* 'enrollment_class_id is distinct from sheet_class_id','39. learner class scope enforced');
select extensions.ok(pg_get_functiondef('internal.validate_mark_scope_and_score()'::regprocedure) ~* 'enrollment_student_school_id is distinct from sheet_school_id','40. learner school scope enforced');
select extensions.ok(pg_get_functiondef('internal.validate_mark_scope_and_score()'::regprocedure) ~* 'new.score > component_maximum','41. maximum score enforced');
select extensions.ok((select pg_get_constraintdef(oid) from pg_constraint where conname='mark_attendance_score_consistent') ~* 'PRESENT','42. attendance/score constraint remains');
select extensions.ok(pg_get_functiondef('internal.save_mark_entry_core(uuid,uuid,uuid,integer,numeric,assessment_attendance_status,text,uuid)'::regprocedure) ~* 'entered_score < 0','43. negative score rejected');
select extensions.ok(pg_get_functiondef('internal.save_mark_entry_core(uuid,uuid,uuid,integer,numeric,assessment_attendance_status,text,uuid)'::regprocedure) ~* 'expected_row_version is distinct from existing_mark.row_version','44. expected row version enforced');
select extensions.ok(pg_get_functiondef('internal.increment_mark_row_version()'::regprocedure) ~* 'old.row_version \+ 1','45. update increments version once');
select extensions.ok(pg_get_functiondef('internal.raise_mark_entry_conflict()'::regprocedure) ~* 'PT409','46. conflicts use PT409');
select extensions.ok(pg_get_functiondef('public.save_mark_entries(uuid,jsonb)'::regprocedure) ~* 'MARK_ENTRY_BATCH_DUPLICATE_CELL','47. duplicate batch cells rejected');
select extensions.ok(pg_get_functiondef('public.save_mark_entries(uuid,jsonb)'::regprocedure) ~* 'entry_count > 500','48. batch size bounded');
select extensions.ok(pg_get_functiondef('public.save_mark_entries(uuid,jsonb)'::regprocedure) ~* 'MARK_ENTRY_BATCH_SAVED','49. successful batch audited compactly');
select extensions.ok(pg_get_functiondef('internal.normalize_teacher_remark(text)'::regprocedure) ~* 'length\(normalized\) > 500' and pg_get_functiondef('internal.normalize_teacher_remark(text)'::regprocedure) ~* '\[:cntrl:\]','50. remarks normalized and bounded');
select extensions.ok(pg_get_function_result('public.get_mark_entry_grid(uuid)'::regprocedure) !~* 'guardian|phone|email|contact','51. grid contract omits contacts');
select extensions.ok(to_regprocedure('public.submit_mark_sheet(uuid)') is null and to_regprocedure('public.approve_mark_sheet(uuid)') is null and to_regprocedure('public.lock_mark_sheet(uuid)') is null,'52. Stage 10 transitions are not exposed');

select * from extensions.finish();
rollback;
