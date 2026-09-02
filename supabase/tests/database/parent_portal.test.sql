begin;

select extensions.no_plan();

select extensions.has_table('public', 'parent_access_rate_limits', 'P01. persistent parent throttles exist');
select extensions.has_table('public', 'parent_security_events', 'P02. parent security events exist');
select extensions.has_function('public', 'verify_parent_access', ARRAY['text','text','text'], 'P03. custom login RPC exists');
select extensions.has_function('public', 'validate_parent_access_session', ARRAY['text'], 'P04. session validation RPC exists');
select extensions.has_function('public', 'get_parent_published_reports', ARRAY['text'], 'P05. report list RPC exists');
select extensions.has_function('public', 'get_parent_report_detail', ARRAY['text','uuid'], 'P06. report detail RPC exists');
select extensions.has_function('public', 'get_parent_report_artifact_descriptor', ARRAY['text','uuid'], 'P07. artifact descriptor RPC exists');
select extensions.has_function('public', 'record_parent_report_artifact_access', ARRAY['text','uuid','text'], 'P08. artifact audit RPC exists');
select extensions.has_function('public', 'get_student_parent_access_status', ARRAY['uuid'], 'P09. staff status RPC exists');
select extensions.has_function('public', 'issue_student_parent_access_credential', ARRAY['uuid','timestamp with time zone'], 'P10. staff issue RPC exists');
select extensions.has_function('public', 'revoke_student_parent_access_credential', ARRAY['uuid'], 'P11. staff revoke RPC exists');

select extensions.is((select relrowsecurity from pg_class where oid='public.parent_access_rate_limits'::regclass), true, 'P12. throttle table has RLS');
select extensions.is((select relforcerowsecurity from pg_class where oid='public.parent_access_rate_limits'::regclass), true, 'P13. throttle table forces RLS');
select extensions.is((select relrowsecurity from pg_class where oid='public.parent_security_events'::regclass), true, 'P14. security events have RLS');
select extensions.is((select relforcerowsecurity from pg_class where oid='public.parent_security_events'::regclass), true, 'P15. security events force RLS');
select extensions.is((select count(*) from pg_indexes where indexname='student_one_active_access_credential_idx'), 1::bigint, 'P16. one active credential index remains');
select extensions.is((select count(*) from pg_proc where proname='parent_generate_access_code'), 1::bigint, 'P17. random access-code generator exists');
select extensions.is((select count(*) from pg_proc where proname='parent_generate_pin'), 1::bigint, 'P18. random PIN generator exists');
select extensions.is((select length(internal.parent_generate_access_code())), 35, 'P19. access code has grouped 128-bit representation');
select extensions.is((select length(internal.parent_generate_pin())), 8, 'P20. PIN is exactly eight digits');
select extensions.is((select internal.parent_normalize_access_code(' abcd- efgh ')), 'ABCDEFGH', 'P21. separators normalize at database edge');
select extensions.is((select length(internal.parent_access_lookup_hash('ABCD'))), 64, 'P22. lookup hash is SHA-256 width');
select extensions.is((select length(internal.parent_session_token_hash(repeat('a', 64)))), 64, 'P23. session hash is SHA-256 width');

set local role anon;
select extensions.throws_ok($$select * from public.verify_parent_access(repeat('0',64),'00000000',repeat('1',64))$$, '42501', null, 'P24. anon cannot verify parent credentials');
select extensions.throws_ok($$select * from public.validate_parent_access_session(repeat('0',64))$$, '42501', null, 'P25. anon cannot validate parent sessions');
select extensions.throws_ok($$select * from public.get_parent_published_reports(repeat('0',64))$$, '42501', null, 'P26. anon cannot list parent reports');
select extensions.throws_ok($$select * from public.get_parent_report_detail(repeat('0',64),'00000000-0000-0000-0000-000000000000')$$, '42501', null, 'P27. anon cannot read report detail');
select extensions.throws_ok($$select * from public.get_parent_report_artifact_descriptor(repeat('0',64),'00000000-0000-0000-0000-000000000000')$$, '42501', null, 'P28. anon cannot read artifact metadata');
select extensions.throws_ok($$select * from public.record_parent_report_artifact_access(repeat('0',64),'00000000-0000-0000-0000-000000000000',repeat('0',64))$$, '42501', null, 'P29. anon cannot record artifact access');
select extensions.throws_ok($$select * from public.parent_access_rate_limits$$, '42501', null, 'P30. anon cannot read throttle rows');
select extensions.throws_ok($$select * from public.parent_security_events$$, '42501', null, 'P31. anon cannot read security events');
select extensions.throws_ok($$select * from public.get_student_parent_access_status('00000000-0000-0000-0000-000000000000')$$, '42501', null, 'P32. anon cannot inspect staff credential status');
select extensions.throws_ok($$select * from public.issue_student_parent_access_credential('00000000-0000-0000-0000-000000000000')$$, '42501', null, 'P33. anon cannot issue credentials');
select extensions.throws_ok($$select public.revoke_student_parent_access_credential('00000000-0000-0000-0000-000000000000')$$, '42501', null, 'P34. anon cannot revoke credentials');
reset role;

select extensions.is((select count(*) from information_schema.routines where routine_schema='public' and routine_name='verify_parent_access'), 1::bigint, 'P35. login remains a single public routine signature');
select extensions.like(
  pg_get_functiondef('public.get_parent_report_detail(text,uuid)'::regprocedure),
  '%result.subject_code%',
  'P36. parent detail reads frozen subject codes'
);
select extensions.like(
  pg_get_functiondef('public.get_parent_report_detail(text,uuid)'::regprocedure),
  '%result.subject_name%',
  'P37. parent detail reads frozen subject names'
);
select extensions.unlike(
  lower(pg_get_functiondef('public.get_parent_report_detail(text,uuid)'::regprocedure)),
  '%join public.subjects%',
  'P38. parent detail does not join live subject identity'
);
select extensions.like(
  pg_get_functiondef('public.verify_parent_access(text,text,text)'::regprocedure),
  '%parent_has_report_eligibility%',
  'P39. login performs a database eligibility check'
);
select * from finish();
rollback;
