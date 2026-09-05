begin;

select extensions.no_plan();

insert into public.schools (id, name, slug, school_code)
values
  ('f1000000-0000-4000-8000-000000000001', 'Immutable Fixture School', 'immutable-fixture-school', 'IMM-ONE'),
  ('f1000000-0000-4000-8000-000000000099', 'Immutable Other School', 'immutable-other-school', 'IMM-OTHER');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'f2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'immutable.fixture@example.invalid', extensions.crypt('synthetic-local-password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb, now(), now()
);

insert into public.profiles (id, first_name, last_name)
values ('f2000000-0000-4000-8000-000000000001', 'Immutable', 'Fixture');

insert into public.school_staff_memberships (id, school_id, profile_id, employee_number, status)
values (
  'f3000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'IMM-STAFF',
  'ACTIVE'
);

insert into public.academic_years (id, school_id, name, starts_on, ends_on, status)
values
  ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Immutable 2037', '2037-01-01', '2037-12-31', 'DRAFT'),
  ('f4000000-0000-4000-8000-000000000099', 'f1000000-0000-4000-8000-000000000099', 'Other 2037', '2037-01-01', '2037-12-31', 'DRAFT');

insert into public.terms (id, academic_year_id, name, term_number, starts_on, ends_on, status, is_promotion_term)
values ('f4100000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'Immutable Term', 1, '2037-01-01', '2037-06-30', 'DRAFT', true);

insert into public.grade_levels (id, school_id, code, name, sort_order)
values
  ('f4200000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'I1', 'Immutable One', 1),
  ('f4200000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'I2', 'Immutable Two', 2),
  ('f4200000-0000-4000-8000-000000000099', 'f1000000-0000-4000-8000-000000000099', 'IO', 'Immutable Other', 1);

insert into public.subjects (id, school_id, code, name, sort_order)
values
  ('f4300000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'IM1', 'Immutable Subject One', 1),
  ('f4300000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'IM2', 'Immutable Subject Two', 2);

insert into public.class_sections (id, academic_year_id, grade_level_id, name, class_code, capacity)
values ('f4400000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Immutable Class', 'IMM-C', 30);

insert into public.students (id, school_id, admission_number, first_name, last_name, admission_date)
values
  ('f4500000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'IMM-001', 'Synthetic', 'One', '2037-01-01'),
  ('f4500000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'IMM-002', 'Synthetic', 'Two', '2037-01-01'),
  ('f4500000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'IMM-003', 'Synthetic', 'Three', '2037-01-01');

insert into public.enrollments (id, student_id, academic_year_id, class_section_id, enrolled_on)
values
  ('f4600000-0000-4000-8000-000000000001', 'f4500000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', '2037-01-01'),
  ('f4600000-0000-4000-8000-000000000002', 'f4500000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', '2037-01-01'),
  ('f4600000-0000-4000-8000-000000000003', 'f4500000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', '2037-01-01');

insert into public.teaching_assignments (id, term_id, class_section_id, subject_id, staff_membership_id, starts_on)
values
  ('f4700000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', '2037-01-01'),
  ('f4700000-0000-4000-8000-000000000002', 'f4100000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001', '2037-01-01');

insert into public.assessment_schemes (id, term_id, grade_level_id, subject_id, name, version, status, effective_from, created_by)
values
  ('f5000000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 'Draft scheme', 1, 'DRAFT', '2037-01-01', 'f3000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000002', 'f4100000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000002', 'Retired scheme', 1, 'DRAFT', '2037-01-01', 'f3000000-0000-4000-8000-000000000001');

insert into public.assessment_components (assessment_scheme_id, name, component_code, maximum_score, weight_percentage, sort_order)
values
  ('f5000000-0000-4000-8000-000000000001', 'Assessment', 'ASSESS', 100, 100, 1),
  ('f5000000-0000-4000-8000-000000000002', 'Assessment', 'RETIRE', 100, 100, 1);

select extensions.lives_ok(
  $$ update public.assessment_schemes set name = 'Edited draft scheme' where id = 'f5000000-0000-4000-8000-000000000001' $$,
  '1. unreferenced draft assessment schemes remain editable'
);

select extensions.throws_ok(
  $$ insert into public.mark_sheets (term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id)
     values ('f4100000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000001') $$,
  '23514', 'A mark sheet must reference an active assessment scheme.', '2. draft assessment schemes cannot be attached to mark sheets'
);

update public.assessment_schemes set status = 'ACTIVE' where id = 'f5000000-0000-4000-8000-000000000001';

select extensions.lives_ok(
  $$ insert into public.mark_sheets (id, term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id)
     values ('f5200000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000001') $$,
  '3. active compatible assessment schemes can be attached to mark sheets'
);

select extensions.throws_ok(
  $$ update public.assessment_schemes set name = 'Forged active scheme' where id = 'f5000000-0000-4000-8000-000000000001' $$,
  '55000', 'Active and retired assessment schemes are immutable.', '4. referenced active assessment schemes cannot be redefined'
);
select extensions.throws_ok(
  $$ update public.assessment_components set name = 'Forged component' where assessment_scheme_id = 'f5000000-0000-4000-8000-000000000001' $$,
  '55000', 'Components of referenced, active, or retired assessment schemes are immutable.', '5. components of referenced active schemes cannot be changed'
);
select extensions.throws_ok(
  $$ delete from public.assessment_schemes where id = 'f5000000-0000-4000-8000-000000000001' $$,
  '55000', 'Referenced, active, or retired assessment schemes are immutable.', '6. active assessment schemes cannot be deleted'
);

update public.assessment_schemes set status = 'ACTIVE' where id = 'f5000000-0000-4000-8000-000000000002';
update public.assessment_schemes set status = 'RETIRED' where id = 'f5000000-0000-4000-8000-000000000002';
select extensions.throws_ok(
  $$ insert into public.mark_sheets (term_id, class_section_id, subject_id, assessment_scheme_id, teaching_assignment_id)
     values ('f4100000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000002', 'f4700000-0000-4000-8000-000000000002') $$,
  '23514', 'A mark sheet must reference an active assessment scheme.', '7. retired assessment schemes cannot be attached to mark sheets'
);
select extensions.throws_ok(
  $$ update public.assessment_schemes set effective_from = '2037-01-02' where id = 'f5000000-0000-4000-8000-000000000002' $$,
  '55000', 'Active and retired assessment schemes are immutable.', '8. retired assessment schemes are fully immutable'
);

insert into public.grading_scales (id, school_id, academic_year_id, grade_level_id, name, version, is_active, effective_from, created_by)
values ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Immutable scale', 1, false, '2037-01-01', 'f3000000-0000-4000-8000-000000000001');
insert into public.grading_bands (grading_scale_id, minimum_score, maximum_score, grade, sort_order)
values ('f6000000-0000-4000-8000-000000000001', 0, 100, 'P', 1);
update public.grading_scales set is_active = true where id = 'f6000000-0000-4000-8000-000000000001';
select extensions.throws_ok(
  $$ update public.grading_scales set name = 'Forged scale' where id = 'f6000000-0000-4000-8000-000000000001' $$,
  '55000', 'Active and retired grading scales are immutable.', '9. active grading scales cannot be changed'
);
select extensions.throws_ok(
  $$ update public.grading_bands set grade = 'Forged' where grading_scale_id = 'f6000000-0000-4000-8000-000000000001' $$,
  '55000', 'Bands of active or retired grading scales are immutable.', '10. active grading bands cannot be changed'
);
select extensions.lives_ok(
  $$ update public.grading_scales set is_active = false, retired_at = now() where id = 'f6000000-0000-4000-8000-000000000001' $$,
  '11. active grading scales can retire without changing their definition'
);
select extensions.throws_ok(
  $$ delete from public.grading_scales where id = 'f6000000-0000-4000-8000-000000000001' $$,
  '55000', 'Active and retired grading scales are immutable.', '12. retired grading scales cannot be deleted'
);

insert into public.ranking_rules (id, school_id, academic_year_id, grade_level_id, name, version, ranking_basis, tie_method, configuration, is_active, created_by)
values ('f7000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Immutable ranking', 1, 'TOTAL', 'DENSE', '{}'::jsonb, false, 'f3000000-0000-4000-8000-000000000001');
update public.ranking_rules set is_active = true where id = 'f7000000-0000-4000-8000-000000000001';
select extensions.throws_ok(
  $$ update public.ranking_rules set configuration = '{"forged":true}'::jsonb where id = 'f7000000-0000-4000-8000-000000000001' $$,
  '55000', 'Active and retired versioned rules are immutable.', '13. active ranking rules cannot be changed'
);
update public.ranking_rules set is_active = false, retired_at = now() where id = 'f7000000-0000-4000-8000-000000000001';
select extensions.throws_ok(
  $$ update public.ranking_rules set name = 'Forged retired ranking' where id = 'f7000000-0000-4000-8000-000000000001' $$,
  '55000', 'Active and retired versioned rules are immutable.', '14. retired ranking rules cannot be changed'
);

insert into public.promotion_rules (id, school_id, academic_year_id, grade_level_id, name, version, required_subject_rules, additional_rules, is_active, created_by)
values
  ('f7100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Active promotion', 1, '{}'::jsonb, '{}'::jsonb, false, 'f3000000-0000-4000-8000-000000000001'),
  ('f7100000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'Draft promotion', 2, '{}'::jsonb, '{}'::jsonb, false, 'f3000000-0000-4000-8000-000000000001'),
  ('f7100000-0000-4000-8000-000000000099', 'f1000000-0000-4000-8000-000000000099', 'f4000000-0000-4000-8000-000000000099', 'f4200000-0000-4000-8000-000000000099', 'Other promotion', 1, '{}'::jsonb, '{}'::jsonb, true, null);
update public.promotion_rules set is_active = true where id = 'f7100000-0000-4000-8000-000000000001';
select extensions.lives_ok(
  $$ insert into public.promotion_decisions (term_id, enrollment_id, promotion_rule_id, system_recommendation)
     values ('f4100000-0000-4000-8000-000000000001', 'f4600000-0000-4000-8000-000000000001', 'f7100000-0000-4000-8000-000000000001', 'PROMOTED') $$,
  '15. active in-scope promotion rules can be selected'
);
select extensions.throws_ok(
  $$ insert into public.promotion_decisions (term_id, enrollment_id, promotion_rule_id, system_recommendation)
     values ('f4100000-0000-4000-8000-000000000001', 'f4600000-0000-4000-8000-000000000002', 'f7100000-0000-4000-8000-000000000002', 'PROMOTED') $$,
  '23514', 'A promotion decision must select an active promotion rule.', '16. draft promotion rules cannot be selected'
);
select extensions.throws_ok(
  $$ insert into public.promotion_decisions (term_id, enrollment_id, promotion_rule_id, system_recommendation)
     values ('f4100000-0000-4000-8000-000000000001', 'f4600000-0000-4000-8000-000000000003', 'f7100000-0000-4000-8000-000000000099', 'PROMOTED') $$,
  '23514', 'Promotion decision references must share one school and academic scope.', '17. cross-school promotion rules cannot be selected'
);
select extensions.throws_ok(
  $$ update public.promotion_rules set name = 'Forged promotion' where id = 'f7100000-0000-4000-8000-000000000001' $$,
  '55000', 'Active and retired versioned rules are immutable.', '18. active promotion rules cannot be changed'
);
update public.promotion_rules set is_active = false, retired_at = now() where id = 'f7100000-0000-4000-8000-000000000001';
select extensions.throws_ok(
  $$ update public.promotion_rules set name = 'Forged retired promotion' where id = 'f7100000-0000-4000-8000-000000000001' $$,
  '55000', 'Active and retired versioned rules are immutable.', '19. retired promotion rules cannot be changed'
);

select extensions.is(
  internal.assessment_scheme_has_dependencies('f5000000-0000-4000-8000-000000000001'),
  true,
  '20. referenced schemes report dependencies through mark sheets and marks'
);

select * from extensions.finish();
rollback;
