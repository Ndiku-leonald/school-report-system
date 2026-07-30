begin;

select extensions.plan(40);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.academic_years', 'INSERT,UPDATE,DELETE'),
  '1. browser academic-year writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.terms', 'INSERT,UPDATE,DELETE'),
  '2. browser term writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.grade_levels', 'INSERT,UPDATE,DELETE'),
  '3. browser grade-level writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.class_sections', 'INSERT,UPDATE,DELETE'),
  '4. browser class-section writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.subjects', 'INSERT,UPDATE,DELETE'),
  '5. browser subject writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.grade_level_subjects', 'INSERT,UPDATE,DELETE'),
  '6. browser curriculum writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.assessment_schemes', 'INSERT,UPDATE,DELETE'),
  '7. browser assessment-scheme writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.grading_scales', 'INSERT,UPDATE,DELETE'),
  '8. browser grading-scale writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.ranking_rules', 'INSERT,UPDATE,DELETE'),
  '9. browser ranking-rule writes remain denied'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.promotion_rules', 'INSERT,UPDATE,DELETE'),
  '10. browser promotion-rule writes remain denied'
);

select extensions.has_function('public', 'create_academic_year', array['text', 'date', 'date'], '11. academic year create RPC exists');
select extensions.has_function('public', 'update_academic_year', array['uuid', 'text', 'date', 'date', 'timestamp with time zone'], '12. academic year update RPC exists');
select extensions.has_function('public', 'activate_academic_year', array['uuid', 'timestamp with time zone', 'text'], '13. year activation RPC exists');
select extensions.has_function('public', 'close_academic_year', array['uuid', 'timestamp with time zone', 'text'], '14. year closure RPC exists');
select extensions.has_function('public', 'archive_academic_year', array['uuid', 'timestamp with time zone', 'text'], '15. year archive RPC exists');
select extensions.has_function('public', 'create_term', array['uuid', 'text', 'integer', 'date', 'date', 'boolean'], '16. term create RPC exists');
select extensions.has_function('public', 'update_term', array['uuid', 'text', 'integer', 'date', 'date', 'boolean', 'timestamp with time zone'], '17. term update RPC exists');
select extensions.has_function('public', 'open_term', array['uuid', 'timestamp with time zone'], '18. term opening RPC exists');
select extensions.has_function('public', 'reorder_grade_levels', array['jsonb'], '19. transactional grade reorder RPC exists');
select extensions.has_function('public', 'reorder_subjects', array['jsonb'], '20. transactional subject reorder RPC exists');
select extensions.has_function('public', 'set_grade_level_subject', array['uuid', 'uuid', 'boolean', 'boolean', 'integer', 'uuid', 'timestamp with time zone'], '21. curriculum mapping RPC exists');
select extensions.has_function('public', 'remove_grade_level_subject', array['uuid', 'timestamp with time zone'], '22. dependency-safe mapping removal RPC exists');
select extensions.has_function('public', 'save_assessment_scheme_draft', array['uuid', 'timestamp with time zone', 'uuid', 'uuid', 'uuid', 'text', 'date', 'jsonb'], '23. transactional assessment save RPC exists');
select extensions.has_function('public', 'activate_assessment_scheme', array['uuid', 'timestamp with time zone'], '24. assessment activation RPC exists');
select extensions.has_function('public', 'save_grading_scale_draft', array['uuid', 'timestamp with time zone', 'uuid', 'uuid', 'text', 'date', 'jsonb'], '25. transactional grading save RPC exists');
select extensions.has_function('public', 'activate_grading_scale', array['uuid', 'timestamp with time zone'], '26. grading activation RPC exists');
select extensions.has_function('public', 'save_ranking_rule', array['uuid', 'timestamp with time zone', 'uuid', 'uuid', 'text', 'ranking_basis', 'ranking_tie_method', 'jsonb'], '27. versioned ranking save RPC exists');
select extensions.has_function('public', 'save_promotion_rule', array['uuid', 'timestamp with time zone', 'uuid', 'uuid', 'text', 'numeric', 'integer', 'integer', 'numeric', 'jsonb', 'jsonb'], '28. versioned promotion save RPC exists');

select extensions.ok(
  not has_function_privilege('anon', 'public.create_academic_year(text,date,date)', 'EXECUTE'),
  '29. anonymous callers cannot execute mutation RPCs'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.create_academic_year(text,date,date)', 'EXECUTE'),
  '30. authenticated role can reach the guarded RPC'
);
select extensions.ok(
  not exists (
    select 1
    from pg_proc function
    cross join lateral aclexplode(
      coalesce(function.proacl, acldefault('f', function.proowner))
    ) privilege
    where function.oid = 'public.create_academic_year(text,date,date)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  '31. PUBLIC execution is revoked'
);
select extensions.ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.create_academic_year(text,date,date)'::regprocedure
  ),
  '32. mutation RPC is security definer'
);
select extensions.is(
  (
    select proconfig[1]
    from pg_proc
    where oid = 'public.create_academic_year(text,date,date)'::regprocedure
  ),
  'search_path=pg_catalog, public, internal',
  '33. mutation RPC has a fixed search path'
);

select extensions.ok(
  exists (select 1 from pg_constraint where conname = 'terms_do_not_overlap'),
  '34. term overlap exclusion is installed'
);
select extensions.ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'term_one_promotion_term_per_year_idx'),
  '35. one promotion term per year is enforced'
);
select extensions.ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'grade_level_active_sort_order_idx'),
  '36. active grade ordering stays unique'
);
select extensions.ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'subject_active_sort_order_idx'),
  '37. active subject ordering stays unique'
);
select extensions.ok(
  exists (select 1 from pg_attribute where attrelid = 'public.grading_scales'::regclass and attname = 'retired_at' and not attisdropped),
  '38. grading lifecycle preserves retired history'
);
select extensions.ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.academic_years'::regclass
  ),
  '39. academic-year RLS remains forced'
);
select extensions.ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.assessment_schemes'::regclass
  ),
  '40. assessment-scheme RLS remains forced'
);

select * from extensions.finish();
rollback;
