begin;

select extensions.no_plan();

-- These are runtime boundary checks. The signed-in fixture-backed product
-- suites prove the full lifecycle; this file keeps the parent RPC boundary
-- executable in the clean pgTAP database as well.
set local role service_role;

select extensions.is(
  internal.parent_normalize_access_code(' ab-cd ef '),
  'ABCDEF',
  'B01. runtime access-code normalization is canonical'
);
select extensions.is(
  length(internal.parent_access_lookup_hash('ABCD')),
  64,
  'B02. runtime access-code lookup hashing is one-way SHA-256'
);
select extensions.is(
  length(internal.parent_session_token_hash(repeat('x', 64))),
  64,
  'B03. runtime session hashing is one-way SHA-256'
);

select extensions.results_eq(
  $$select ok, session_token, retry_after_seconds
    from public.verify_parent_access(
      repeat('a', 64), '00000000', repeat('b', 64)
    )$$,
  $$values (false, null::text, 0)$$,
  'B04. unknown-code login fails generically and creates no session'
);
select extensions.is(
  (select request_count from public.parent_access_rate_limits
   where client_key_hash = repeat('b', 64)),
  1,
  'B05. runtime login increments the persistent throttle'
);
select extensions.is(
  (select count(*) from public.parent_access_sessions
   where session_token_hash = repeat('a', 64)),
  0::bigint,
  'B06. failed runtime login creates no parent session'
);
select extensions.is(
  (select count(*) from public.parent_security_events
   where client_key_hash = repeat('b', 64)
     and event_type = 'PARENT_LOGIN_SUCCEEDED'),
  0::bigint,
  'B07. failed runtime login writes no success audit'
);

select extensions.is(
  (select count(*) from public.validate_parent_access_session(repeat('c', 64))),
  0::bigint,
  'B08. unknown runtime session validates to no rows'
);
select extensions.is(
  (select count(*) from public.get_parent_published_reports(repeat('c', 64))),
  0::bigint,
  'B09. unknown runtime session lists no reports'
);
select extensions.is(
  (select count(*) from public.get_parent_report_detail(
    repeat('c', 64), '00000000-0000-0000-0000-000000000000'
  )),
  0::bigint,
  'B10. unknown runtime session reads no report detail'
);
select extensions.is(
  (select count(*) from public.get_parent_report_artifact_descriptor(
    repeat('c', 64), '00000000-0000-0000-0000-000000000000'
  )),
  0::bigint,
  'B11. unknown runtime session reads no artifact descriptor'
);

set local role anon;
select extensions.throws_ok(
  $$select * from public.verify_parent_access(repeat('a',64),'00000000',repeat('b',64))$$,
  '42501', null,
  'B12. anonymous runtime login remains denied'
);
select extensions.throws_ok(
  $$select * from public.get_parent_published_reports(repeat('c',64))$$,
  '42501', null,
  'B13. anonymous runtime report listing remains denied'
);
select extensions.throws_ok(
  $$select * from public.parent_access_rate_limits$$,
  '42501', null,
  'B14. anonymous runtime throttle table access remains denied'
);

reset role;
select * from finish();
rollback;
