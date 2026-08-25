begin;

select extensions.no_plan();

insert into public.schools (id, name, slug, school_code)
values
  ('15000000-0000-4000-8000-000000000001', 'Continuity Fixture School', 'continuity-fixture-school', 'CONT-ONE'),
  ('15000000-0000-4000-8000-000000000099', 'Continuity Other School', 'continuity-other-school', 'CONT-OTHER');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '15100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'continuity.fixture@example.invalid', extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb, now(), now()
);

insert into public.profiles (id, first_name, last_name)
values ('15100000-0000-4000-8000-000000000001', 'Continuity', 'Fixture');

insert into public.school_staff_memberships (id, school_id, profile_id, employee_number, status)
values
  ('15200000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', '15100000-0000-4000-8000-000000000001', 'CONT-STAFF', 'ACTIVE'),
  ('15200000-0000-4000-8000-000000000099', '15000000-0000-4000-8000-000000000099', '15100000-0000-4000-8000-000000000001', 'CONT-OTHER-STAFF', 'ACTIVE');

insert into public.academic_years (id, school_id, name, starts_on, ends_on, status)
values
  ('15300000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'Continuity 2038', '2038-01-01', '2038-12-31', 'DRAFT'),
  ('15300000-0000-4000-8000-000000000099', '15000000-0000-4000-8000-000000000099', 'Other 2038', '2038-01-01', '2038-12-31', 'DRAFT');

insert into public.terms (id, academic_year_id, name, term_number, starts_on, ends_on, status, is_promotion_term)
values
  ('15400000-0000-4000-8000-000000000001', '15300000-0000-4000-8000-000000000001', 'Continuity Term', 1, '2038-01-01', '2038-06-30', 'MARKS_ENTRY', false),
  ('15400000-0000-4000-8000-000000000099', '15300000-0000-4000-8000-000000000099', 'Other Term', 1, '2038-01-01', '2038-06-30', 'DRAFT', false);

insert into public.grade_levels (id, school_id, code, name, sort_order)
values
  ('15500000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'C1', 'Continuity One', 1),
  ('15500000-0000-4000-8000-000000000099', '15000000-0000-4000-8000-000000000099', 'CO', 'Continuity Other', 1);

insert into public.subjects (id, school_id, code, name, sort_order)
values
  ('15600000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'CS1', 'Continuity Subject', 1),
  ('15600000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000001', 'CS2', 'Continuity Other Subject', 2),
  ('15600000-0000-4000-8000-000000000099', '15000000-0000-4000-8000-000000000099', 'CSO', 'Other School Subject', 1);

insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code, capacity)
values
  ('15700000-0000-4000-8000-000000000001', '15300000-0000-4000-8000-000000000001', '15500000-0000-4000-8000-000000000001', 'Continuity Class', 'CONT-C', 30),
  ('15700000-0000-4000-8000-000000000099', '15300000-0000-4000-8000-000000000099', '15500000-0000-4000-8000-000000000099', 'Other Class', 'CONT-O', 30);

insert into public.teaching_assignments (id, term_id, class_section_id, subject_id, staff_membership_id, starts_on)
values
  ('15800000-0000-4000-8000-000000000001', '15400000-0000-4000-8000-000000000001', '15700000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000001', '15200000-0000-4000-8000-000000000001', '2038-01-01'),
  ('15800000-0000-4000-8000-000000000002', '15400000-0000-4000-8000-000000000001', '15700000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000002', '15200000-0000-4000-8000-000000000001', '2038-01-01'),
  ('15800000-0000-4000-8000-000000000099', '15400000-0000-4000-8000-000000000099', '15700000-0000-4000-8000-000000000099', '15600000-0000-4000-8000-000000000099', '15200000-0000-4000-8000-000000000099', '2038-01-01');

insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values ('15900000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'CONT-001', 'Synthetic', 'Learner', '2038-01-01');

insert into public.enrollments (id, student_id, academic_year_id, class_section_id, enrolled_on)
values ('15a00000-0000-4000-8000-000000000001', '15900000-0000-4000-8000-000000000001', '15300000-0000-4000-8000-000000000001', '15700000-0000-4000-8000-000000000001', '2038-01-01');

insert into public.assessment_schemes (
  id, term_id, grade_level_id, subject_id, name, version, status, effective_from, created_by
)
values
  ('15b00000-0000-4000-8000-000000000001', '15400000-0000-4000-8000-000000000001', '15500000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000001', 'Continuity active scheme', 1, 'DRAFT', '2038-01-01', '15200000-0000-4000-8000-000000000001'),
  ('15b00000-0000-4000-8000-000000000002', '15400000-0000-4000-8000-000000000001', '15500000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000001', 'Continuity draft scheme', 2, 'DRAFT', '2038-01-01', '15200000-0000-4000-8000-000000000001'),
  ('15b00000-0000-4000-8000-000000000003', '15400000-0000-4000-8000-000000000001', '15500000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000001', 'Continuity retired replacement', 3, 'DRAFT', '2038-01-01', '15200000-0000-4000-8000-000000000001'),
  ('15b00000-0000-4000-8000-000000000004', '15400000-0000-4000-8000-000000000001', '15500000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000002', 'Cross-subject active scheme', 1, 'DRAFT', '2038-01-01', '15200000-0000-4000-8000-000000000001'),
  ('15b00000-0000-4000-8000-000000000099', '15400000-0000-4000-8000-000000000099', '15500000-0000-4000-8000-000000000099', '15600000-0000-4000-8000-000000000099', 'Cross-school active scheme', 1, 'DRAFT', '2038-01-01', '15200000-0000-4000-8000-000000000099');

insert into public.assessment_components (
  id, assessment_scheme_id, name, component_code, maximum_score, weight_percentage, sort_order
)
values
  ('15c00000-0000-4000-8000-000000000001', '15b00000-0000-4000-8000-000000000001', 'Historical assessment', 'HIST', 100, 100, 1),
  ('15c00000-0000-4000-8000-000000000002', '15b00000-0000-4000-8000-000000000002', 'Draft assessment', 'DRAFT', 100, 100, 1),
  ('15c00000-0000-4000-8000-000000000003', '15b00000-0000-4000-8000-000000000003', 'Retired assessment', 'RET', 100, 100, 1),
  ('15c00000-0000-4000-8000-000000000004', '15b00000-0000-4000-8000-000000000004', 'Other subject assessment', 'OTHER', 100, 100, 1),
  ('15c00000-0000-4000-8000-000000000099', '15b00000-0000-4000-8000-000000000099', 'Other school assessment', 'SCHOOL', 100, 100, 1);

update public.assessment_schemes set status = 'ACTIVE' where id = '15b00000-0000-4000-8000-000000000003';
update public.assessment_schemes set status = 'RETIRED' where id = '15b00000-0000-4000-8000-000000000003';
update public.assessment_schemes set status = 'ACTIVE' where id in (
  '15b00000-0000-4000-8000-000000000001',
  '15b00000-0000-4000-8000-000000000004',
  '15b00000-0000-4000-8000-000000000099'
);

select extensions.lives_ok(
  $$ insert into public.mark_sheets (id, term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id)
     values ('15d00000-0000-4000-8000-000000000001', '15400000-0000-4000-8000-000000000001', '15700000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000001', '15b00000-0000-4000-8000-000000000001', '15800000-0000-4000-8000-000000000001') $$,
  '1. a compatible active scheme can be selected when inserting a mark sheet'
);

select extensions.throws_ok(
  $$ insert into public.mark_sheets (term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id, version)
     values ('15400000-0000-4000-8000-000000000001', '15700000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000001', '15b00000-0000-4000-8000-000000000002', '15800000-0000-4000-8000-000000000001', 2) $$,
  '23514', 'A mark sheet must reference an active assessment scheme.', '2. a draft scheme cannot be selected during insertion'
);

select extensions.throws_ok(
  $$ insert into public.mark_sheets (term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id, version)
     values ('15400000-0000-4000-8000-000000000001', '15700000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000001', '15b00000-0000-4000-8000-000000000003', '15800000-0000-4000-8000-000000000001', 2) $$,
  '23514', 'A mark sheet must reference an active assessment scheme.', '3. a retired scheme cannot be selected during insertion'
);

select extensions.throws_ok(
  $$ update public.mark_sheets set assessment_scheme_id = '15b00000-0000-4000-8000-000000000003' where id = '15d00000-0000-4000-8000-000000000001' $$,
  '23514', 'A mark sheet must reference an active assessment scheme.', '4. an existing sheet cannot change to a retired scheme'
);

select extensions.throws_ok(
  $$ update public.mark_sheets set assessment_scheme_id = '15b00000-0000-4000-8000-000000000002' where id = '15d00000-0000-4000-8000-000000000001' $$,
  '23514', 'A mark sheet must reference an active assessment scheme.', '5. an existing sheet cannot change to a draft scheme'
);

insert into public.marks (
  id, mark_sheet_id, assessment_component_id, enrollment_id, score, created_by, updated_by
)
values (
  '15e00000-0000-4000-8000-000000000001',
  '15d00000-0000-4000-8000-000000000001',
  '15c00000-0000-4000-8000-000000000001',
  '15a00000-0000-4000-8000-000000000001',
  75,
  '15200000-0000-4000-8000-000000000001',
  '15200000-0000-4000-8000-000000000001'
);

update public.assessment_schemes
set status = 'RETIRED'
where id = '15b00000-0000-4000-8000-000000000001';

select extensions.lives_ok(
  $$ select set_config('app.marks_workflow_transition', 'allowed', true); update public.mark_sheets set workflow_status = 'SUBMITTED' where id = '15d00000-0000-4000-8000-000000000001' $$,
  '6. a sheet created under an active scheme remains workflow-updateable after retirement'
);

select extensions.lives_ok(
  $$ select set_config('app.marks_workflow_transition', 'allowed', true); update public.mark_sheets set workflow_status = 'UNDER_REVIEW' where id = '15d00000-0000-4000-8000-000000000001' $$,
  '7. workflow status can change while the retired scheme reference is unchanged'
);

select extensions.lives_ok(
  $$
    select set_config('app.marks_workflow_transition', 'allowed', true);
    update public.mark_sheets
    set submitted_by = '15200000-0000-4000-8000-000000000001', submitted_at = '2038-05-01 08:00:00+00'
    where id = '15d00000-0000-4000-8000-000000000001';
    update public.mark_sheets
    set workflow_status = 'UNDER_REVIEW', reviewed_by = '15200000-0000-4000-8000-000000000001', reviewed_at = '2038-05-01 09:00:00+00'
    where id = '15d00000-0000-4000-8000-000000000001';
    update public.mark_sheets
    set workflow_status = 'RETURNED', returned_by = '15200000-0000-4000-8000-000000000001', returned_at = '2038-05-01 10:00:00+00', return_reason = 'Synthetic correction request'
    where id = '15d00000-0000-4000-8000-000000000001';
    update public.mark_sheets
    set workflow_status = 'APPROVED', approved_by = '15200000-0000-4000-8000-000000000001', approved_at = '2038-05-01 11:00:00+00'
    where id = '15d00000-0000-4000-8000-000000000001';
    update public.mark_sheets
    set workflow_status = 'LOCKED', locked_by = '15200000-0000-4000-8000-000000000001', locked_at = '2038-05-01 12:00:00+00'
    where id = '15d00000-0000-4000-8000-000000000001';
  $$,
  '8. valid workflow actor and timestamp fields remain updateable with an unchanged retired scheme'
);

select extensions.throws_ok(
  $$ update public.mark_sheets set subject_id = '15600000-0000-4000-8000-000000000002' where id = '15d00000-0000-4000-8000-000000000001' $$,
  '23514', 'Mark sheet references do not agree on term, class, grade, subject, and teaching assignment.', '9. incompatible scope changes remain rejected for a retired-scheme sheet'
);

select extensions.throws_ok(
  $$ update public.mark_sheets set assessment_scheme_id = '15b00000-0000-4000-8000-000000000004' where id = '15d00000-0000-4000-8000-000000000001' $$,
  '23514', 'Mark sheet references do not agree on term, class, grade, subject, and teaching assignment.', '10a. cross-subject scheme replacements remain rejected'
);

select extensions.throws_ok(
  $$ update public.mark_sheets set assessment_scheme_id = '15b00000-0000-4000-8000-000000000099' where id = '15d00000-0000-4000-8000-000000000001' $$,
  '23514', 'Mark sheet references do not agree on term, class, grade, subject, and teaching assignment.', '10b. cross-school scheme replacements remain rejected'
);

select extensions.throws_ok(
  $$ update public.assessment_schemes set name = 'Forged historical definition' where id = '15b00000-0000-4000-8000-000000000001' $$,
  '55000', 'Active and retired assessment schemes are immutable.', '11. the retired scheme definition remains immutable'
);

select extensions.throws_ok(
  $$ update public.assessment_components set name = 'Forged historical component' where id = '15c00000-0000-4000-8000-000000000001' $$,
  '55000', 'Components of referenced, active, or retired assessment schemes are immutable.', '12. the retired scheme components remain immutable'
);

select extensions.is(
  (
    select count(*)::integer
    from public.marks mark
    join public.assessment_components component on component.id = mark.assessment_component_id
    where mark.id = '15e00000-0000-4000-8000-000000000001'
      and component.id = '15c00000-0000-4000-8000-000000000001'
      and component.assessment_scheme_id = '15b00000-0000-4000-8000-000000000001'
      and component.name = 'Historical assessment'
  ),
  1,
  '13. existing marks retain the unchanged historical component reference'
);

select extensions.throws_ok(
  $$ insert into public.mark_sheets (term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id, version)
     values ('15400000-0000-4000-8000-000000000001', '15700000-0000-4000-8000-000000000001', '15600000-0000-4000-8000-000000000001', '15b00000-0000-4000-8000-000000000001', '15800000-0000-4000-8000-000000000001', 3) $$,
  '23514', 'A mark sheet must reference an active assessment scheme.', '14. new mark sheets still cannot select the retired scheme'
);

select extensions.ok(
  (
    select bool_and(relrowsecurity and relforcerowsecurity)
    from pg_catalog.pg_class
    where oid in (
      'public.assessment_schemes'::regclass,
      'public.assessment_components'::regclass,
      'public.mark_sheets'::regclass
    )
  ),
  '15a. forced RLS remains enabled on schemes, components, and mark sheets'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.mark_sheets', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.mark_sheets', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.assessment_schemes', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.assessment_schemes', 'INSERT,UPDATE,DELETE')
  and not has_function_privilege('anon', 'internal.validate_mark_sheet_scope()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'internal.validate_mark_sheet_scope()', 'EXECUTE'),
  '15b. browser writes and direct trigger-function execution remain denied'
);

select * from extensions.finish();
rollback;
