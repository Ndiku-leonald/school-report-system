begin;

select extensions.no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'authorization.admin@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'authorization.subject@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'authorization.class@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'authorization.unassigned@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'authorization.other-school@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'authorization.revoked@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'authorization.suspended@example.invalid', extensions.crypt('local-only-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles (id, first_name, last_name)
select id, 'Synthetic', 'Authorization'
from auth.users
where id::text like 'a2000000-%';

insert into public.school_staff_memberships (
  id, school_id, profile_id, employee_number, status
)
values
  ('a3000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'AUTHZ-ADMIN-A', 'ACTIVE'),
  ('a3000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'AUTHZ-SUBJECT-A', 'ACTIVE'),
  ('a3000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'AUTHZ-CLASS-A', 'ACTIVE'),
  ('a3000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'AUTHZ-UNASSIGNED-A', 'ACTIVE'),
  ('a3000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000099', 'a2000000-0000-4000-8000-000000000005', 'AUTHZ-ADMIN-B', 'ACTIVE'),
  ('a3000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000006', 'AUTHZ-REVOKED-A', 'ACTIVE'),
  ('a3000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000007', 'AUTHZ-SUSPENDED-A', 'SUSPENDED'),
  ('a3000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000099', 'a2000000-0000-4000-8000-000000000001', 'AUTHZ-SUBJECT-B', 'ACTIVE'),
  ('a3000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'AUTHZ-INVITED-A', 'INVITED'),
  ('a3000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'AUTHZ-DISABLED-A', 'DISABLED');

insert into public.staff_role_assignments (
  id, membership_id, role, revoked_at
)
values
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'SCHOOL_ADMIN', null),
  ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'SUBJECT_TEACHER', null),
  ('a4000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'CLASS_TEACHER', null),
  ('a4000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000004', 'SUBJECT_TEACHER', null),
  ('a4000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000005', 'SCHOOL_ADMIN', null),
  ('a4000000-0000-4000-8000-000000000006', 'a3000000-0000-4000-8000-000000000006', 'SUBJECT_TEACHER', now()),
  ('a4000000-0000-4000-8000-000000000007', 'a3000000-0000-4000-8000-000000000007', 'SCHOOL_ADMIN', null),
  ('a4000000-0000-4000-8000-000000000008', 'a3000000-0000-4000-8000-000000000008', 'SUBJECT_TEACHER', null);

insert into public.academic_years (
  id, school_id, name, starts_on, ends_on, status
)
values (
  'a5000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000099',
  'Synthetic 2026',
  '2026-02-01',
  '2026-12-05',
  'ACTIVE'
);

insert into public.terms (
  id, academic_year_id, name, term_number, starts_on, ends_on, status
)
values (
  'a5100000-0000-4000-8000-000000000099',
  'a5000000-0000-4000-8000-000000000099',
  'Synthetic Term',
  1,
  '2026-05-25',
  '2026-08-28',
  'OPEN'
);

insert into public.grade_levels (
  id, school_id, code, name, sort_order
)
values (
  'a5200000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000099',
  'P1',
  'Synthetic Primary One',
  1
);

insert into public.class_sections (
  id, academic_year_id, grade_level_id, name, class_code
)
values
  ('a5300000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Authorization A', 'AUTHZ-A'),
  ('a5300000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Authorization B', 'AUTHZ-B'),
  ('a5300000-0000-4000-8000-000000000099', 'a5000000-0000-4000-8000-000000000099', 'a5200000-0000-4000-8000-000000000099', 'Authorization Other', 'AUTHZ-Z');

insert into public.subjects (
  id, school_id, code, name, sort_order
)
values (
  'a5400000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000099',
  'AUTHZ',
  'Synthetic Authorization Subject',
  1
);

insert into public.students (
  id, school_id, admission_number, first_name, last_name, admission_date
)
values
  ('a6000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'AUTHZ-STUDENT-A', 'Synthetic', 'Assigned', '2026-02-02'),
  ('a6000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'AUTHZ-STUDENT-B', 'Synthetic', 'Other Class', '2026-02-02'),
  ('a6000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099', 'AUTHZ-STUDENT-Z', 'Synthetic', 'Other School', '2026-02-02');

insert into public.enrollments (
  id, student_id, academic_year_id, class_section_id, enrolled_on
)
values
  ('a6100000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'a5300000-0000-4000-8000-000000000001', '2026-02-02'),
  ('a6100000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'a5300000-0000-4000-8000-000000000002', '2026-02-02'),
  ('a6100000-0000-4000-8000-000000000099', 'a6000000-0000-4000-8000-000000000099', 'a5000000-0000-4000-8000-000000000099', 'a5300000-0000-4000-8000-000000000099', '2026-02-02');

insert into public.enrollments (
  id, student_id, academic_year_id, class_section_id, enrolled_on, exited_on,
  status
)
values
  ('a6100000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'a5300000-0000-4000-8000-000000000001', '2025-02-02', '2025-06-01', 'WITHDRAWN'),
  ('a6100000-0000-4000-8000-000000000004', 'a6000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'a5300000-0000-4000-8000-000000000001', '2025-02-02', '2025-06-01', 'TRANSFERRED'),
  ('a6100000-0000-4000-8000-000000000005', 'a6000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'a5300000-0000-4000-8000-000000000001', '2025-02-02', '2025-12-01', 'COMPLETED');

insert into public.teaching_assignments (
  id, term_id, class_section_id, subject_id, staff_membership_id, starts_on
)
values
  ('a6200000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', '2026-05-25'),
  ('a6200000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', '2026-05-25'),
  ('a6200000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '2026-05-25'),
  ('a6200000-0000-4000-8000-000000000099', 'a5100000-0000-4000-8000-000000000099', 'a5300000-0000-4000-8000-000000000099', 'a5400000-0000-4000-8000-000000000099', 'a3000000-0000-4000-8000-000000000008', '2026-05-25');

insert into public.teaching_assignments (
  id, term_id, class_section_id, subject_id, staff_membership_id, starts_on
)
values (
  'a6200000-0000-4000-8000-000000000004',
  '21000000-0000-4000-8000-000000000001',
  'a5300000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',
  '2026-02-02'
);

insert into public.class_teacher_assignments (
  id, term_id, class_section_id, staff_membership_id, starts_on
)
values (
  'a6300000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  'a5300000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003',
  '2026-05-25'
);

insert into public.assessment_schemes (
  id, term_id, grade_level_id, subject_id, name, status, effective_from
)
values
  ('a6400000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Authorization English', 'DRAFT', '2026-05-25'),
  ('a6400000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Authorization Mathematics', 'DRAFT', '2026-05-25');

insert into public.assessment_components (
  id, assessment_scheme_id, name, component_code, maximum_score,
  weight_percentage, sort_order
)
values
  ('a6500000-0000-4000-8000-000000000001', 'a6400000-0000-4000-8000-000000000001', 'Assessment', 'AUTHZ', 100, 100, 1),
  ('a6500000-0000-4000-8000-000000000002', 'a6400000-0000-4000-8000-000000000002', 'Assessment', 'AUTHZ', 100, 100, 1);

update public.assessment_schemes
set status = 'ACTIVE'
where id in (
  'a6400000-0000-4000-8000-000000000001',
  'a6400000-0000-4000-8000-000000000002'
);

insert into public.mark_sheets (
  id, term_id, class_section_id, subject_id, assessment_scheme_id,
  teaching_assignment_id
)
values
  ('a6600000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'a6400000-0000-4000-8000-000000000001', 'a6200000-0000-4000-8000-000000000001'),
  ('a6600000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'a6400000-0000-4000-8000-000000000002', 'a6200000-0000-4000-8000-000000000002'),
  ('a6600000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'a6400000-0000-4000-8000-000000000001', 'a6200000-0000-4000-8000-000000000003');

insert into public.marks (
  id, mark_sheet_id, assessment_component_id, enrollment_id, score
)
values
  ('a6700000-0000-4000-8000-000000000001', 'a6600000-0000-4000-8000-000000000001', 'a6500000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000001', 80),
  ('a6700000-0000-4000-8000-000000000002', 'a6600000-0000-4000-8000-000000000002', 'a6500000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000001', 75),
  ('a6700000-0000-4000-8000-000000000003', 'a6600000-0000-4000-8000-000000000003', 'a6500000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000002', 70);

insert into public.report_templates (
  id, school_id, name, template_configuration
)
values (
  'a6800000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic Authorization',
  '{}'
);

insert into public.report_batches (
  id, term_id, class_section_id, requested_by
)
values
  ('a6900000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001'),
  ('a6900000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'a5300000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001');

insert into public.reports (
  id, batch_id, term_id, enrollment_id, template_id
)
values
  ('a7000000-0000-4000-8000-000000000001', 'a6900000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000001', 'a6800000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000002', 'a6900000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000002', 'a6800000-0000-4000-8000-000000000001');

insert into public.report_snapshots (
  id, report_id, snapshot_data, source_checksum
)
values (
  'a7100000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  '{}',
  'synthetic-authorization-checksum'
);

insert into public.report_subject_results (
  id, report_id, subject_id, sort_order
)
values (
  'a7200000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  1
);

insert into public.guardians (
  id, school_id, first_name, last_name
)
values (
  'a7300000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Synthetic',
  'Guardian'
);

insert into public.audit_logs (
  id, school_id, action, entity_type
)
values
  ('a7400000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'AUTHORIZATION_TEST', 'synthetic'),
  ('a7400000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099', 'AUTHORIZATION_TEST', 'synthetic');

select extensions.is(
  (select count(*) from unnest(enum_range(null::public.app_permission))),
  35::bigint,
  'the permission enum contains all 35 Stage 5 values'
);
select extensions.is(
  (select count(*) from public.role_permissions),
  123::bigint,
  'every role permission is seeded intentionally'
);
select extensions.is(
  (select count(*) from public.role_permissions)
    - (select count(distinct (role, permission)) from public.role_permissions),
  0::bigint,
  'the role matrix contains no duplicate role-permission pairs'
);
select extensions.is(
  (select count(*) from public.role_permissions where role = 'SUPER_ADMIN'),
  35::bigint,
  'SUPER_ADMIN has the complete permission set'
);
select extensions.is(
  (select count(*) from public.role_permissions where role = 'SCHOOL_ADMIN'),
  35::bigint,
  'SCHOOL_ADMIN has the complete permission set'
);
select extensions.is(
  (select count(*) from public.role_permissions where role = 'HEAD_TEACHER'),
  21::bigint,
  'HEAD_TEACHER has the documented permission count'
);
select extensions.is(
  (select count(*) from public.role_permissions where role = 'ACADEMIC_REGISTRAR'),
  17::bigint,
  'ACADEMIC_REGISTRAR has the documented permission count'
);
select extensions.is(
  (select count(*) from public.role_permissions where role = 'CLASS_TEACHER'),
  8::bigint,
  'CLASS_TEACHER has the documented permission count'
);
select extensions.is(
  (select count(*) from public.role_permissions where role = 'SUBJECT_TEACHER'),
  7::bigint,
  'SUBJECT_TEACHER has the documented permission count'
);
select extensions.ok(
  not exists (
    select 1 from public.role_permissions
    where role = 'HEAD_TEACHER'
      and permission in ('STAFF_MANAGE', 'SCHOOL_SETTINGS_MANAGE')
  ),
  'head teachers do not receive staff or settings mutation authority'
);
select extensions.ok(
  not exists (
    select 1 from public.role_permissions
    where role = 'ACADEMIC_REGISTRAR'
      and permission in ('REPORTS_PUBLISH', 'MARKS_LOCK', 'PROMOTION_CONFIRM')
  ),
  'registrars do not receive final publication, locking, or promotion authority'
);
select extensions.ok(
  not exists (
    select 1 from public.role_permissions
    where role = 'SUBJECT_TEACHER'
      and permission in ('REPORTS_VIEW_ASSIGNED', 'MARKS_APPROVE')
  ),
  'subject teachers do not receive complete-report or approval authority'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select extensions.is(
  public.get_my_active_membership(),
  null::uuid,
  'a missing session claim produces no active selection'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"not-a-uuid"}',
  true
);
select extensions.is(
  public.get_my_active_membership(),
  null::uuid,
  'a malformed session claim produces no active selection'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);

select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000001')),
  0::bigint,
  'a session without a selected membership receives no permissions'
);
select extensions.is(
  (select count(*) from public.students where id::text like 'a6000000-%'),
  0::bigint,
  'a session without a selected membership receives no academic rows'
);
select extensions.is(
  public.get_my_active_membership(),
  null::uuid,
  'a session without a selection reports no active membership'
);
select extensions.throws_ok(
  $$ select public.set_my_active_membership(
       'a3000000-0000-4000-8000-000000000002'
     ) $$,
  'P0001'
);
select extensions.throws_ok(
  $$ select public.set_my_active_membership(
       'a3000000-0000-4000-8000-000000000009'
     ) $$,
  'P0001'
);
select extensions.throws_ok(
  $$ select public.set_my_active_membership(
       'a3000000-0000-4000-8000-000000000010'
     ) $$,
  'P0001'
);
select extensions.is(
  public.set_my_active_membership(
    'a3000000-0000-4000-8000-000000000001'
  ),
  'a3000000-0000-4000-8000-000000000001'::uuid,
  'a session selects one of its own active memberships'
);
select extensions.is(
  public.get_my_active_membership(),
  'a3000000-0000-4000-8000-000000000001'::uuid,
  'the current session reads only its selected membership'
);
select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000001')),
  35::bigint,
  'the selected school-A administrator membership grants its permissions'
);
select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000008')),
  0::bigint,
  'another own but non-selected membership returns no permissions'
);
select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000005')),
  0::bigint,
  'a caller cannot retrieve another user permissions'
);
select extensions.is(
  (select count(*) from public.academic_years where id = 'a5000000-0000-4000-8000-000000000099'),
  0::bigint,
  'school-B academic rows remain hidden while school A is selected'
);
select extensions.is(
  public.set_my_active_membership(
    'a3000000-0000-4000-8000-000000000008'
  ),
  'a3000000-0000-4000-8000-000000000008'::uuid,
  'switching replaces the selected membership for the same session'
);
select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000008')),
  7::bigint,
  'the selected school-B subject membership grants only teacher permissions'
);
select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000001')),
  0::bigint,
  'school-A administrator permissions stop after switching to school B'
);
select extensions.is(
  (select count(*) from public.students where id::text like 'a6000000-%'),
  1::bigint,
  'one direct query returns only the selected school-B assigned roster'
);
select extensions.is(
  (select id from public.students where id::text like 'a6000000-%'),
  'a6000000-0000-4000-8000-000000000099'::uuid,
  'the school-B session cannot combine school-A rows'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.is(
  public.set_my_active_membership(
    'a3000000-0000-4000-8000-000000000008'
  ),
  'a3000000-0000-4000-8000-000000000008'::uuid,
  'a second session can select school B independently'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.is(
  public.set_my_active_membership(
    'a3000000-0000-4000-8000-000000000001'
  ),
  'a3000000-0000-4000-8000-000000000001'::uuid,
  'session one can switch to school A'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000002"}',
  true
);
select extensions.is(
  public.get_my_active_membership(),
  'a3000000-0000-4000-8000-000000000008'::uuid,
  'changing session one does not alter session two'
);
select extensions.ok(
  public.clear_my_active_membership(),
  'clear removes the current session selection'
);
select extensions.is(
  public.get_my_active_membership(),
  null::uuid,
  'the cleared session reports no selection'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
select extensions.is(
  public.get_my_active_membership(),
  'a3000000-0000-4000-8000-000000000001'::uuid,
  'clearing session two does not alter session one'
);
select extensions.is(
  (select count(*) from public.students where id::text like 'a6000000-%'),
  2::bigint,
  'an administrator reads all students in the authorized school only'
);
select extensions.is(
  (select count(*) from public.enrollments where id::text like 'a6100000-%'),
  5::bigint,
  'a schoolwide administrator retains historical enrollment visibility'
);
select extensions.is(
  (select count(*) from public.mark_sheets where id::text like 'a6600000-%'),
  3::bigint,
  'a broad academic role reads all school mark sheets'
);
select extensions.is(
  (select count(*) from public.marks where id::text like 'a6700000-%'),
  3::bigint,
  'a broad academic role reads all school marks'
);
select extensions.is(
  (select count(*) from public.audit_logs where id::text like 'a7400000-%'),
  1::bigint,
  'AUDIT_VIEW exposes only audit rows in an authorized school'
);
select extensions.throws_ok(
  $$ insert into public.students (
       school_id, admission_number, first_name, last_name, admission_date
     ) values (
       '10000000-0000-4000-8000-000000000001',
       'DENIED-WRITE', 'Denied', 'Write', current_date
     ) $$,
  '42501'
);
select extensions.throws_ok(
  $$ update public.mark_sheets set workflow_status = 'LOCKED' $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.role_permissions $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from internal.staff_session_active_memberships $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.guardians $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.student_access_credentials $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.parent_access_sessions $$,
  '42501'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000010"}',
  true
);
select public.set_my_active_membership(
  'a3000000-0000-4000-8000-000000000002'
);
select extensions.is(
  (select count(*) from public.students where id::text like 'a6000000-%'),
  1::bigint,
  'a subject teacher reads only students in assigned classes'
);
select extensions.is(
  (select id from public.students where id::text like 'a6000000-%'),
  'a6000000-0000-4000-8000-000000000001'::uuid,
  'the subject teacher roster contains the assigned learner'
);
select extensions.is(
  (select count(*) from public.enrollments where id::text like 'a6100000-%'),
  1::bigint,
  'a subject teacher reads only assigned-class enrollments'
);
select extensions.is(
  (
    select count(*)
    from public.enrollments
    where id::text like 'a6100000-%'
      and status in ('WITHDRAWN', 'TRANSFERRED', 'COMPLETED')
  ),
  0::bigint,
  'an assigned teacher cannot enumerate historical roster statuses'
);
select extensions.is(
  (select count(*) from public.teaching_assignments where id::text like 'a6200000-%'),
  2::bigint,
  'a subject teacher reads only their own selected-membership assignment history'
);
select extensions.is(
  (select count(*) from public.mark_sheets where id::text like 'a6600000-%'),
  1::bigint,
  'a subject teacher reads only the assigned subject mark sheet'
);
select extensions.is(
  (select count(*) from public.marks where id::text like 'a6700000-%'),
  1::bigint,
  'a subject teacher reads only marks on the assigned mark sheet'
);
select extensions.is(
  (select count(*) from public.reports where id::text like 'a7000000-%'),
  0::bigint,
  'a subject teacher cannot read complete reports'
);
select extensions.ok(
  internal.current_user_is_subject_teacher_assigned(
    '21000000-0000-4000-8000-000000000002',
    'a5300000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  ),
  'the subject assignment helper accepts the exact authorized scope'
);
select extensions.ok(
  not internal.current_user_is_subject_teacher_assigned(
    '21000000-0000-4000-8000-000000000002',
    'a5300000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001'
  ),
  'forged class identifiers do not bypass subject assignment scope'
);
select extensions.ok(
  not internal.current_user_is_subject_teacher_assigned(
    '21000000-0000-4000-8000-000000000001',
    'a5300000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  ),
  'a null assignment end date cannot extend access past the term end'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000011"}',
  true
);
select public.set_my_active_membership(
  'a3000000-0000-4000-8000-000000000003'
);
select extensions.is(
  (select count(*) from public.students where id::text like 'a6000000-%'),
  1::bigint,
  'a class teacher reads only students in the assigned class'
);
select extensions.is(
  (select count(*) from public.mark_sheets where id::text like 'a6600000-%'),
  2::bigint,
  'a class teacher reads all subjects in the assigned class'
);
select extensions.is(
  (select count(*) from public.marks where id::text like 'a6700000-%'),
  2::bigint,
  'a class teacher reads marks across assigned-class subjects'
);
select extensions.is(
  (select count(*) from public.reports where id::text like 'a7000000-%'),
  1::bigint,
  'an assigned class teacher reads the assigned learner report'
);
select extensions.is(
  (select count(*) from public.report_snapshots where id::text like 'a7100000-%'),
  1::bigint,
  'report snapshot visibility follows report visibility'
);
select extensions.is(
  (select count(*) from public.report_subject_results where id::text like 'a7200000-%'),
  1::bigint,
  'report subject-result visibility follows report visibility'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000004","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000012"}',
  true
);
select public.set_my_active_membership(
  'a3000000-0000-4000-8000-000000000004'
);
select extensions.is(
  (select count(*) from public.students where id::text like 'a6000000-%'),
  0::bigint,
  'an unassigned teacher cannot read a student roster'
);
select extensions.is(
  (select count(*) from public.mark_sheets where id::text like 'a6600000-%'),
  0::bigint,
  'an unassigned teacher cannot read mark sheets'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000006","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000013"}',
  true
);
select public.set_my_active_membership(
  'a3000000-0000-4000-8000-000000000006'
);
select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000006')),
  0::bigint,
  'a revoked role grants no effective permission'
);
select extensions.is(
  (select count(*) from public.students where id::text like 'a6000000-%'),
  0::bigint,
  'a revoked role grants no roster access'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000007","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000014"}',
  true
);
select extensions.throws_ok(
  $$ select public.set_my_active_membership(
       'a3000000-0000-4000-8000-000000000007'
     ) $$,
  'P0001'
);
select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000007')),
  0::bigint,
  'a suspended membership grants no permission'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000015"}',
  true
);
select public.set_my_active_membership(
  'a3000000-0000-4000-8000-000000000005'
);
reset role;
update public.schools
set is_active = false
where id = '10000000-0000-4000-8000-000000000099';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"b1000000-0000-4000-8000-000000000015"}',
  true
);
select extensions.is(
  public.get_my_active_membership(),
  null::uuid,
  'a stale selection does not survive an inactive school'
);
select extensions.is(
  (select count(*) from public.get_my_effective_permissions('a3000000-0000-4000-8000-000000000005')),
  0::bigint,
  'an inactive school grants no permission'
);
select extensions.throws_ok(
  $$ select public.set_my_active_membership(
       'a3000000-0000-4000-8000-000000000005'
     ) $$,
  'P0001'
);

reset role;
set local role anon;
select extensions.throws_ok(
  $$ select * from public.get_my_effective_permissions(
       'a3000000-0000-4000-8000-000000000001'
     ) $$,
  '42501'
);
select extensions.throws_ok(
  $$ select public.set_my_active_membership(
       'a3000000-0000-4000-8000-000000000001'
     ) $$,
  '42501'
);
select extensions.throws_ok(
  $$ select public.get_my_active_membership() $$,
  '42501'
);
select extensions.throws_ok(
  $$ select public.clear_my_active_membership() $$,
  '42501'
);
select extensions.throws_ok(
  $$ select * from public.students $$,
  '42501'
);

reset role;
select extensions.is(
  (
    select membership_id
    from internal.staff_session_active_memberships
    where session_id = 'b1000000-0000-4000-8000-000000000001'
      and profile_id = 'a2000000-0000-4000-8000-000000000001'
  ),
  'a3000000-0000-4000-8000-000000000001'::uuid,
  'selection storage is keyed by the verified JWT session ID'
);
select extensions.is(
  (
    select count(*)
    from internal.staff_session_active_memberships
    where session_id = 'b1000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'clear deletes only the selected session row'
);
select extensions.ok(
  not has_table_privilege(
    'authenticated',
    'internal.staff_session_active_memberships',
    'SELECT'
  )
    and not has_table_privilege(
      'authenticated',
      'internal.staff_session_active_memberships',
      'INSERT'
    )
    and not has_table_privilege(
      'authenticated',
      'internal.staff_session_active_memberships',
      'UPDATE'
    )
    and not has_table_privilege(
      'authenticated',
      'internal.staff_session_active_memberships',
      'DELETE'
    ),
  'authenticated callers have no direct selection-table privileges'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.set_my_active_membership(uuid)',
    'EXECUTE'
  )
    and has_function_privilege(
      'authenticated',
      'public.get_my_active_membership()',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.clear_my_active_membership()',
      'EXECUTE'
    ),
  'authenticated callers have only the narrow public selection RPCs'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.set_my_active_membership(uuid)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.get_my_active_membership()',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.clear_my_active_membership()',
      'EXECUTE'
    ),
  'anonymous callers have no selection RPC execution grants'
);
select extensions.ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.role_permissions'::regclass
  ),
  'role_permissions has enabled and forced RLS'
);
select extensions.is(
  (
    select count(*)
    from pg_class
    where oid = any(array[
      'public.students'::regclass,
      'public.enrollments'::regclass,
      'public.mark_sheets'::regclass,
      'public.marks'::regclass,
      'public.reports'::regclass,
      'public.audit_logs'::regclass
    ])
      and relrowsecurity
      and relforcerowsecurity
  ),
  6::bigint,
  'forced RLS remains enabled on authorization-sensitive tables'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.students', 'INSERT')
    and not has_table_privilege('authenticated', 'public.marks', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.audit_logs', 'INSERT'),
  'authenticated browser mutations remain unprivileged'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.get_my_effective_permissions(uuid)',
    'EXECUTE'
  ),
  'authenticated callers have only the caller-scoped permission RPC'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.get_my_effective_permissions(uuid)',
    'EXECUTE'
  ),
  'anonymous callers have no permission RPC execution grant'
);

select * from extensions.finish();
rollback;
