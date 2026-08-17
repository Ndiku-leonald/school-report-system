begin;

select extensions.plan(81);

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
select extensions.ok(pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'MARKS_ENTER','19. mutation actor requires MARKS_ENTER');
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

select extensions.has_function('internal','lock_and_require_marks_write_authority',array[]::text[],'53. internal marks-write authority-lock helper exists');
select extensions.is(
  (select proconfig[1] from pg_proc where oid='internal.lock_and_require_marks_write_authority()'::regprocedure),
  'search_path=pg_catalog, public, internal',
  '54. authority-lock helper has a fixed search path'
);
select extensions.ok(
  (select prosecdef from pg_proc where oid='internal.lock_and_require_marks_write_authority()'::regprocedure),
  '55. authority-lock helper uses definer rights for protected authority rows'
);
select extensions.ok(
  not exists(
    select 1
    from pg_proc function_row
    cross join lateral aclexplode(coalesce(function_row.proacl,acldefault('f',function_row.proowner))) privilege
    where function_row.oid='internal.lock_and_require_marks_write_authority()'::regprocedure
      and privilege.grantee=0
      and privilege.privilege_type='EXECUTE'
  ),
  '56. PUBLIC cannot execute the authority-lock helper'
);
select extensions.ok(not has_function_privilege('anon','internal.lock_and_require_marks_write_authority()','EXECUTE'),'57. anon cannot execute the authority-lock helper');
select extensions.ok(not has_function_privilege('authenticated','internal.lock_and_require_marks_write_authority()','EXECUTE'),'58. authenticated cannot execute the authority-lock helper directly');
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'staff_session_active_memberships'
  and pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'selection.session_id = current_session_id'
  and pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'for update',
  '59. current Auth session selection is locked and revalidated'
);
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'membership.id = selected_selection.membership_id',
  '60. locked membership comes only from the selected session row'
);
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'selected_membership.status <> ''ACTIVE''',
  '61. membership ACTIVE state is revalidated after locking'
);
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'not selected_school.is_active',
  '62. selected school active state is revalidated after locking'
);
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'granted_at <= now\(\)'
  and pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'revoked_at is null',
  '63. only live role grants contribute authority'
);
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'SUBJECT_TEACHER',
  '64. live SUBJECT_TEACHER authority is revalidated'
);
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'MARKS_ENTER',
  '65. effective MARKS_ENTER permission is revalidated'
);
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'order by role_assignment.id',
  '66. role authority rows use deterministic UUID lock order'
);
select extensions.ok(
  pg_get_functiondef('internal.lock_and_require_marks_write_authority()'::regprocedure) ~* 'order by mapping.id',
  '67. permission authority rows use deterministic UUID lock order'
);
select extensions.ok(
  regexp_count(lower(pg_get_functiondef('internal.assert_editable_mark_sheet(uuid,uuid,uuid)'::regprocedure)), 'for update') >= 3,
  '68. assignment, term and mark-sheet authority remain locked for saves'
);
select extensions.ok(
  pg_get_functiondef('internal.assert_editable_mark_sheet(uuid,uuid,uuid)'::regprocedure) ~* 'selected_term.status <> ''MARKS_ENTRY''',
  '69. locked term state remains part of final save authority'
);
select extensions.ok(
  pg_get_functiondef('internal.assert_editable_mark_sheet(uuid,uuid,uuid)'::regprocedure) ~* 'workflow_status <> ''DRAFT''',
  '70. locked DRAFT sheet state remains part of final save authority'
);
select extensions.ok(
  pg_get_functiondef('internal.protect_mark_sheet_identity()'::regprocedure) ~* 'old.version is distinct from new.version',
  '71. mark-sheet version is structurally part of immutable revision identity'
);

insert into public.schools (id,name,slug,school_code)
values ('20000000-0000-4000-8000-000000000001','Revision Runtime School','revision-runtime-school','REV-RUNTIME');
insert into auth.users (
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '20100000-0000-4000-8000-000000000001','authenticated','authenticated',
  'revision.runtime@example.invalid',extensions.crypt('synthetic-local-password',extensions.gen_salt('bf')),
  now(),'{"provider":"email","providers":["email"]}','{}',now(),now()
);
insert into public.profiles (id,first_name,last_name)
values ('20100000-0000-4000-8000-000000000001','Revision','Runtime');
insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status)
values ('20200000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','20100000-0000-4000-8000-000000000001','REV-STAFF','ACTIVE');
insert into public.academic_years (id,school_id,name,starts_on,ends_on,status)
values ('20300000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Revision window',current_date-180,current_date+180,'ACTIVE');
insert into public.terms (id,academic_year_id,name,term_number,starts_on,ends_on,status)
values ('20400000-0000-4000-8000-000000000001','20300000-0000-4000-8000-000000000001','Revision term',1,current_date-180,current_date+180,'MARKS_ENTRY');
insert into public.grade_levels (id,school_id,code,name,sort_order)
values ('20500000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','REV','Revision Grade',1);
insert into public.class_sections (id,academic_year_id,grade_level_id,name,class_code)
values ('20600000-0000-4000-8000-000000000001','20300000-0000-4000-8000-000000000001','20500000-0000-4000-8000-000000000001','Revision Class','REV-C');
insert into public.subjects (id,school_id,code,name,sort_order)
values ('20700000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','REV','Revision Subject',1);
insert into public.grade_level_subjects (grade_level_id,subject_id,sort_order)
values ('20500000-0000-4000-8000-000000000001','20700000-0000-4000-8000-000000000001',1);
insert into public.teaching_assignments (
  id,term_id,class_section_id,subject_id,staff_membership_id,starts_on
) values (
  '20800000-0000-4000-8000-000000000001','20400000-0000-4000-8000-000000000001',
  '20600000-0000-4000-8000-000000000001','20700000-0000-4000-8000-000000000001',
  '20200000-0000-4000-8000-000000000001',current_date-30
);
insert into public.assessment_schemes (
  id,term_id,grade_level_id,subject_id,name,version,status,effective_from
) values (
  '20900000-0000-4000-8000-000000000001','20400000-0000-4000-8000-000000000001',
  '20500000-0000-4000-8000-000000000001','20700000-0000-4000-8000-000000000001',
  'Revision Scheme',1,'DRAFT',current_date-180
);
insert into public.assessment_components (
  id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order
) values (
  '20a00000-0000-4000-8000-000000000001','20900000-0000-4000-8000-000000000001',
  'Revision Component','REV',100,100,1
);
update public.assessment_schemes set status='ACTIVE'
where id='20900000-0000-4000-8000-000000000001';
insert into public.mark_sheets (
  id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id,version
) values (
  '20b00000-0000-4000-8000-000000000001','20400000-0000-4000-8000-000000000001',
  '20600000-0000-4000-8000-000000000001','20700000-0000-4000-8000-000000000001',
  '20900000-0000-4000-8000-000000000001','20800000-0000-4000-8000-000000000001',1
);
create temporary table mark_sheet_revision_snapshot on commit drop as
select * from public.mark_sheets where id='20b00000-0000-4000-8000-000000000001';

select extensions.throws_ok(
  $$ update public.mark_sheets set version=version+1 where id='20b00000-0000-4000-8000-000000000001' $$,
  '55000','MARK_SHEET_IDENTITY_IMMUTABLE',
  '72. privileged direct mark-sheet version change fails at runtime'
);
select extensions.is((select count(*)::integer from public.mark_sheets where id='20b00000-0000-4000-8000-000000000001'),1,'73. original mark-sheet row still exists');
select extensions.is((select sheet.version from public.mark_sheets sheet where sheet.id='20b00000-0000-4000-8000-000000000001'),(select snapshot.version from mark_sheet_revision_snapshot snapshot),'74. original mark-sheet version is unchanged');
select extensions.is((select sheet.term_id from public.mark_sheets sheet where sheet.id='20b00000-0000-4000-8000-000000000001'),(select snapshot.term_id from mark_sheet_revision_snapshot snapshot),'75. original mark-sheet term is unchanged');
select extensions.is((select sheet.class_section_id from public.mark_sheets sheet where sheet.id='20b00000-0000-4000-8000-000000000001'),(select snapshot.class_section_id from mark_sheet_revision_snapshot snapshot),'76. original mark-sheet class is unchanged');
select extensions.is((select sheet.subject_id from public.mark_sheets sheet where sheet.id='20b00000-0000-4000-8000-000000000001'),(select snapshot.subject_id from mark_sheet_revision_snapshot snapshot),'77. original mark-sheet subject is unchanged');
select extensions.is((select sheet.assessment_scheme_id from public.mark_sheets sheet where sheet.id='20b00000-0000-4000-8000-000000000001'),(select snapshot.assessment_scheme_id from mark_sheet_revision_snapshot snapshot),'78. original mark-sheet scheme is unchanged');
select extensions.is((select sheet.teaching_assignment_id from public.mark_sheets sheet where sheet.id='20b00000-0000-4000-8000-000000000001'),(select snapshot.teaching_assignment_id from mark_sheet_revision_snapshot snapshot),'79. original mark-sheet assignment is unchanged');
select extensions.is((select sheet.created_at from public.mark_sheets sheet where sheet.id='20b00000-0000-4000-8000-000000000001'),(select snapshot.created_at from mark_sheet_revision_snapshot snapshot),'80. original mark-sheet creation identity is unchanged');
select extensions.lives_ok(
  $$ update public.mark_sheets set workflow_status='SUBMITTED' where id='20b00000-0000-4000-8000-000000000001' $$,
  '81. workflow status remains changeable outside the identity trigger'
);

select * from extensions.finish();
rollback;
