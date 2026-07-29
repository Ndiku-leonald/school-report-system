begin;

select extensions.plan(18);

insert into public.schools (id, name, slug, school_code, is_active)
values
  (
    '95000000-0000-4000-8000-000000000001',
    'Synthetic Activation School',
    'synthetic-activation-school',
    'ACT-ONE',
    true
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    'Synthetic Inactive School',
    'synthetic-inactive-school',
    'ACT-TWO',
    false
  ),
  (
    '95000000-0000-4000-8000-000000000003',
    'Synthetic Activation School Two',
    'synthetic-activation-school-two',
    'ACT-THREE',
    true
  );

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '96000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'synthetic.activation.one@example.invalid',
    extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'synthetic.activation.two@example.invalid',
    extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (id, first_name, last_name)
values
  ('96000000-0000-4000-8000-000000000001', 'Synthetic', 'Activation One'),
  ('96000000-0000-4000-8000-000000000002', 'Synthetic', 'Activation Two');

insert into public.school_staff_memberships (
  id, school_id, profile_id, employee_number, status
)
values
  (
    '97000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    'ACT-INVITED-ONE',
    'INVITED'
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000003',
    '96000000-0000-4000-8000-000000000001',
    'ACT-INVITED-TWO',
    'INVITED'
  ),
  (
    '97000000-0000-4000-8000-000000000003',
    '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    'ACT-SUSPENDED',
    'SUSPENDED'
  ),
  (
    '97000000-0000-4000-8000-000000000004',
    '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000002',
    'ACT-OTHER-PROFILE',
    'INVITED'
  ),
  (
    '97000000-0000-4000-8000-000000000005',
    '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    'ACT-DISABLED',
    'DISABLED'
  ),
  (
    '97000000-0000-4000-8000-000000000006',
    '95000000-0000-4000-8000-000000000002',
    '96000000-0000-4000-8000-000000000001',
    'ACT-INACTIVE-SCHOOL',
    'INVITED'
  );

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.activate_staff_invitation(uuid,uuid[])',
    'EXECUTE'
  ),
  'service role can execute invitation activation'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.activate_staff_invitation(uuid,uuid[])',
    'EXECUTE'
  ),
  'anonymous callers cannot execute invitation activation'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.activate_staff_invitation(uuid,uuid[])',
    'EXECUTE'
  ),
  'authenticated callers cannot execute invitation activation'
);
select extensions.ok(
  (
    select not prosecdef
    from pg_proc
    where oid = 'public.activate_staff_invitation(uuid,uuid[])'::regprocedure
  ),
  'the service-only function uses invoker rights'
);
select extensions.is(
  (
    select proconfig::text
    from pg_proc
    where oid = 'public.activate_staff_invitation(uuid,uuid[])'::regprocedure
  ),
  '{"search_path=pg_catalog, public"}',
  'the function has a fixed safe search path'
);

select extensions.results_eq(
  $$
    select membership_id
    from public.activate_staff_invitation(
      '96000000-0000-4000-8000-000000000001',
      array[
        '97000000-0000-4000-8000-000000000002',
        '97000000-0000-4000-8000-000000000001'
      ]::uuid[]
    )
  $$,
  $$
    values
      ('97000000-0000-4000-8000-000000000001'::uuid),
      ('97000000-0000-4000-8000-000000000002'::uuid)
  $$,
  'all expected invited membership IDs are returned exactly'
);
select extensions.is(
  (
    select count(*)
    from public.school_staff_memberships
    where id in (
      '97000000-0000-4000-8000-000000000001',
      '97000000-0000-4000-8000-000000000002'
    )
      and status = 'ACTIVE'
  ),
  2::bigint,
  'all expected memberships activate together'
);
select extensions.is(
  (
    select count(*)
    from public.audit_logs
    where entity_id in (
      '97000000-0000-4000-8000-000000000001',
      '97000000-0000-4000-8000-000000000002'
    )
      and action in (
        'STAFF_INVITATION_COMPLETED',
        'STAFF_MEMBERSHIP_ACTIVATED'
      )
  ),
  4::bigint,
  'successful activation writes both audit events per membership'
);

select extensions.throws_ok(
  $$
    select public.activate_staff_invitation(
      '96000000-0000-4000-8000-000000000001',
      array[
        '97000000-0000-4000-8000-000000000003',
        '97000000-0000-4000-8000-000000000006'
      ]::uuid[]
    )
  $$,
  'P0001',
  'One or more expected invitations are no longer eligible.'
);
select extensions.is(
  (
    select status::text
    from public.school_staff_memberships
    where id = '97000000-0000-4000-8000-000000000006'
  ),
  'INVITED',
  'a changed membership state prevents every expected activation'
);
select extensions.throws_ok(
  $$
    select public.activate_staff_invitation(
      '96000000-0000-4000-8000-000000000001',
      array['97000000-0000-4000-8000-000000000004']::uuid[]
    )
  $$,
  'P0001',
  'One or more expected invitations are no longer eligible.'
);
select extensions.is(
  (
    select status::text
    from public.school_staff_memberships
    where id = '97000000-0000-4000-8000-000000000004'
  ),
  'INVITED',
  'another profile membership remains invited'
);
select extensions.throws_ok(
  $$
    select public.activate_staff_invitation(
      '96000000-0000-4000-8000-000000000001',
      array['97000000-0000-4000-8000-000000000003']::uuid[]
    )
  $$,
  'P0001',
  'One or more expected invitations are no longer eligible.'
);
select extensions.throws_ok(
  $$
    select public.activate_staff_invitation(
      '96000000-0000-4000-8000-000000000001',
      array['97000000-0000-4000-8000-000000000005']::uuid[]
    )
  $$,
  'P0001',
  'One or more expected invitations are no longer eligible.'
);
select extensions.throws_ok(
  $$
    select public.activate_staff_invitation(
      '96000000-0000-4000-8000-000000000001',
      array['97000000-0000-4000-8000-000000000006']::uuid[]
    )
  $$,
  'P0001',
  'One or more expected invitations are no longer eligible.'
);
select extensions.is(
  (
    select count(*)
    from public.audit_logs
    where entity_id in (
      '97000000-0000-4000-8000-000000000003',
      '97000000-0000-4000-8000-000000000004',
      '97000000-0000-4000-8000-000000000005',
      '97000000-0000-4000-8000-000000000006'
    )
      and action in (
        'STAFF_INVITATION_COMPLETED',
        'STAFF_MEMBERSHIP_ACTIVATED'
      )
  ),
  0::bigint,
  'failed activation creates no false successful audit events'
);
select extensions.throws_ok(
  $$
    select public.activate_staff_invitation(
      '96000000-0000-4000-8000-000000000001',
      array[
        '97000000-0000-4000-8000-000000000006',
        '97000000-0000-4000-8000-000000000006'
      ]::uuid[]
    )
  $$,
  '22023',
  'Invitation membership IDs must be non-null and unique.'
);
select extensions.throws_ok(
  $$
    select public.activate_staff_invitation(
      '96000000-0000-4000-8000-000000000001',
      array['97000000-0000-4000-8000-000000000099']::uuid[]
    )
  $$,
  'P0001',
  'One or more expected invitations are unavailable.'
);

select * from extensions.finish();
rollback;
