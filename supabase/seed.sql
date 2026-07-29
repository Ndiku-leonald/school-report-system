-- Synthetic local-development configuration only. This seed intentionally creates
-- no staff accounts, students, guardians, credentials, marks, or reports.
begin;

insert into public.schools (
  id,
  name,
  slug,
  school_code,
  address,
  timezone
)
values (
  '10000000-0000-4000-8000-000000000001',
  'Demo Primary School',
  'demo-primary-school',
  'DEMO-001',
  'Synthetic local development data',
  'Africa/Kampala'
)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  school_code = excluded.school_code,
  address = excluded.address,
  timezone = excluded.timezone;

insert into public.academic_years (
  id,
  school_id,
  name,
  starts_on,
  ends_on,
  status
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '2026 Academic Year',
  '2026-02-02',
  '2026-12-04',
  'ACTIVE'
)
on conflict (id) do update
set
  name = excluded.name,
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  status = excluded.status;

insert into public.terms (
  id,
  academic_year_id,
  name,
  term_number,
  starts_on,
  ends_on,
  status,
  is_promotion_term
)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Term 1',
    1,
    '2026-02-02',
    '2026-05-01',
    'OPEN',
    false
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Term 2',
    2,
    '2026-05-25',
    '2026-08-28',
    'DRAFT',
    false
  ),
  (
    '21000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    'Term 3',
    3,
    '2026-09-14',
    '2026-12-04',
    'DRAFT',
    true
  )
on conflict (id) do update
set
  name = excluded.name,
  term_number = excluded.term_number,
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  status = excluded.status,
  is_promotion_term = excluded.is_promotion_term;

insert into public.grade_levels (
  id,
  school_id,
  code,
  name,
  sort_order,
  is_final_grade
)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'P1', 'Primary One', 1, false),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'P2', 'Primary Two', 2, false),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'P3', 'Primary Three', 3, false),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'P4', 'Primary Four', 4, false),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'P5', 'Primary Five', 5, false),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'P6', 'Primary Six', 6, false),
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'P7', 'Primary Seven', 7, true)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_final_grade = excluded.is_final_grade;

insert into public.subjects (
  id,
  school_id,
  code,
  name,
  is_core,
  contributes_to_aggregate,
  sort_order
)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ENG', 'English', true, true, 1),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'MATH', 'Mathematics', true, true, 2),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'SCI', 'Integrated Science', true, true, 3),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'SST', 'Social Studies', true, true, 4)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  is_core = excluded.is_core,
  contributes_to_aggregate = excluded.contributes_to_aggregate,
  sort_order = excluded.sort_order;

insert into public.grade_level_subjects (
  grade_level_id,
  subject_id,
  sort_order
)
select
  grade_levels.id,
  subjects.id,
  subjects.sort_order
from public.grade_levels
cross join public.subjects
where grade_levels.school_id = '10000000-0000-4000-8000-000000000001'
  and subjects.school_id = grade_levels.school_id
on conflict (grade_level_id, subject_id) do update
set sort_order = excluded.sort_order;

insert into public.assessment_schemes (
  id,
  term_id,
  grade_level_id,
  subject_id,
  name,
  version,
  status,
  effective_from
)
values (
  '50000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Standard Term Assessment',
  1,
  'DRAFT',
  '2026-02-02'
)
on conflict (id) do update
set
  name = excluded.name,
  effective_from = excluded.effective_from,
  status = 'DRAFT';

insert into public.assessment_components (
  id,
  assessment_scheme_id,
  name,
  component_code,
  maximum_score,
  weight_percentage,
  sort_order
)
values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Coursework', 'CW', 100, 40, 1),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'End of Term Examination', 'EXAM', 100, 60, 2)
on conflict (id) do update
set
  name = excluded.name,
  component_code = excluded.component_code,
  maximum_score = excluded.maximum_score,
  weight_percentage = excluded.weight_percentage,
  sort_order = excluded.sort_order;

update public.assessment_schemes
set status = 'ACTIVE'
where id = '50000000-0000-4000-8000-000000000001';

insert into public.grading_scales (
  id,
  school_id,
  academic_year_id,
  grade_level_id,
  name,
  version,
  is_active,
  effective_from
)
values (
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  null,
  'Standard Percentage Scale',
  1,
  true,
  '2026-02-02'
)
on conflict (id) do update
set
  name = excluded.name,
  is_active = excluded.is_active,
  effective_from = excluded.effective_from;

insert into public.grading_bands (
  id,
  grading_scale_id,
  minimum_score,
  maximum_score,
  grade,
  aggregate_points,
  description,
  is_pass,
  sort_order
)
values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 80, 100, 'D1', 1, 'Excellent', true, 1),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', 70, 80, 'D2', 2, 'Very good', true, 2),
  ('61000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000001', 60, 70, 'C3', 3, 'Good', true, 3),
  ('61000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000001', 50, 60, 'C4', 4, 'Satisfactory', true, 4),
  ('61000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000001', 40, 50, 'C5', 5, 'Basic', true, 5),
  ('61000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000001', 0, 40, 'F9', 9, 'Below standard', false, 6)
on conflict (id) do update
set
  minimum_score = excluded.minimum_score,
  maximum_score = excluded.maximum_score,
  grade = excluded.grade,
  aggregate_points = excluded.aggregate_points,
  description = excluded.description,
  is_pass = excluded.is_pass,
  sort_order = excluded.sort_order;

commit;
