begin;

select extensions.plan(21);

insert into public.schools (id, name, slug, school_code)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'Synthetic Auth School One',
    'synthetic-auth-school-one',
    'AUTH-ONE'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'Synthetic Auth School Two',
    'synthetic-auth-school-two',
    'AUTH-TWO'
  );

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '92000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'synthetic.auth.one@example.invalid',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'synthetic.auth.two@example.invalid',
    extensions.crypt('local-test-only', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (id, first_name, last_name)
values
  ('92000000-0000-4000-8000-000000000001', 'Synthetic', 'Auth One'),
  ('92000000-0000-4000-8000-000000000002', 'Synthetic', 'Auth Two');

insert into public.school_staff_memberships (
  id, school_id, profile_id, employee_number, status
)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'AUTH-EMP-ONE',
    'ACTIVE'
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'AUTH-EMP-TWO',
    'SUSPENDED'
  );

insert into public.staff_role_assignments (
  id, membership_id, role
)
values
  (
    '94000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    'SCHOOL_ADMIN'
  ),
  (
    '94000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000002',
    'SUBJECT_TEACHER'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000001',
  true
);

select extensions.is(
  (select count(*) from public.profiles),
  1::bigint,
  'authenticated staff can read only their profile'
);
select extensions.is(
  (select count(*) from public.school_staff_memberships),
  1::bigint,
  'authenticated staff can read only their memberships'
);
select extensions.is(
  (select count(*) from public.staff_role_assignments),
  1::bigint,
  'authenticated staff can read only their role assignments'
);
select extensions.is(
  (select count(*) from public.schools),
  1::bigint,
  'authenticated staff can read only their schools'
);
select extensions.is(
  (select first_name from public.profiles),
  'Synthetic',
  'the own profile row is readable'
);
select extensions.is(
  (select status::text from public.school_staff_memberships),
  'ACTIVE',
  'the own membership status is readable'
);
select extensions.is(
  (select role::text from public.staff_role_assignments),
  'SCHOOL_ADMIN',
  'the own active role is readable'
);
select extensions.is(
  (select school_code from public.schools),
  'AUTH-ONE',
  'the own membership school is readable'
);
select extensions.throws_ok(
  $$ update public.profiles set first_name = 'Denied' $$,
  '42501'
);
select extensions.throws_ok(
  $$ update public.school_staff_memberships set status = 'ACTIVE' $$,
  '42501'
);
select extensions.throws_ok(
  $$
    insert into public.staff_role_assignments (membership_id, role)
    values (
      '93000000-0000-4000-8000-000000000001',
      'SUPER_ADMIN'
    )
  $$,
  '42501'
);
select extensions.throws_ok(
  $$ update public.schools set name = 'Denied' $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.students $$,
  '42501'
);

reset role;
set local role anon;
select extensions.throws_ok(
  $$ select * from public.profiles $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.school_staff_memberships $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.schools $$,
  '42501'
);

reset role;
select extensions.ok(
  has_table_privilege('service_role', 'public.schools', 'SELECT'),
  'service role can resolve a provisioning school'
);
select extensions.ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT, INSERT, UPDATE, DELETE'),
  'service role has the profile lifecycle privileges used by provisioning'
);
select extensions.ok(
  has_table_privilege(
    'service_role',
    'public.school_staff_memberships',
    'SELECT, INSERT, UPDATE, DELETE'
  ),
  'service role has the membership lifecycle privileges used by provisioning'
);
select extensions.ok(
  has_table_privilege(
    'service_role',
    'public.staff_role_assignments',
    'SELECT, INSERT, UPDATE, DELETE'
  ),
  'service role has the role-label lifecycle privileges used by provisioning'
);
select extensions.ok(
  has_table_privilege('service_role', 'public.audit_logs', 'INSERT'),
  'service role can append authentication audit events'
);

select * from extensions.finish();
rollback;
