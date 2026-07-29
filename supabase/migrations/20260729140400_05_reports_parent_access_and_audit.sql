create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 150),
  version integer not null default 1 check (version > 0),
  template_configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(template_configuration) = 'object'),
  is_active boolean not null default false,
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_template_version_unique
    unique (school_id, name, version)
);

create unique index report_template_one_active_name_idx
  on public.report_templates (school_id, name)
  where is_active;

create table public.report_batches (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  class_section_id uuid
    references public.class_sections(id) on delete restrict,
  requested_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  status public.report_batch_status not null default 'PENDING',
  total_reports integer not null default 0 check (total_reports >= 0),
  completed_reports integer not null default 0 check (completed_reports >= 0),
  failed_reports integer not null default 0 check (failed_reports >= 0),
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_batch_counters_valid
    check (completed_reports + failed_reports <= total_reports),
  constraint report_batch_timestamps_valid
    check (
      completed_at is null
      or (started_at is not null and completed_at >= started_at)
    )
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.report_batches(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  enrollment_id uuid not null
    references public.enrollments(id) on delete restrict,
  template_id uuid not null
    references public.report_templates(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  status public.report_status not null default 'DRAFT',
  overall_total numeric(10, 2) check (overall_total is null or overall_total >= 0),
  overall_average numeric(5, 2)
    check (overall_average is null or overall_average between 0 and 100),
  overall_grade text,
  aggregate_total integer check (aggregate_total is null or aggregate_total > 0),
  class_position integer check (class_position is null or class_position > 0),
  grade_level_position integer
    check (grade_level_position is null or grade_level_position > 0),
  promotion_recommendation public.promotion_outcome,
  pdf_storage_path text,
  file_checksum text,
  generated_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  withdrawn_at timestamptz,
  superseded_by uuid references public.reports(id) on delete restrict,
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  reviewed_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  published_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  withdrawn_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_term_enrollment_version_unique
    unique (term_id, enrollment_id, version),
  constraint report_not_self_superseding
    check (superseded_by is null or superseded_by <> id),
  constraint report_publication_timestamps_valid check (
    (published_at is null or reviewed_at is not null)
    and (withdrawn_at is null or published_at is not null)
  )
);

create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  snapshot_version integer not null default 1 check (snapshot_version > 0),
  snapshot_data jsonb not null check (jsonb_typeof(snapshot_data) = 'object'),
  source_checksum text not null
    check (length(btrim(source_checksum)) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint report_snapshot_version_unique
    unique (report_id, snapshot_version)
);

comment on table public.report_snapshots is
  'Immutable source-of-truth data for rendering and historical report review.';

create table public.report_subject_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  subject_score numeric(5, 2)
    check (subject_score is null or subject_score between 0 and 100),
  grade text,
  aggregate_points integer
    check (aggregate_points is null or aggregate_points > 0),
  subject_position integer
    check (subject_position is null or subject_position > 0),
  teacher_comment text,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  constraint report_subject_result_unique unique (report_id, subject_id)
);

create table public.promotion_decisions (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete restrict,
  enrollment_id uuid not null
    references public.enrollments(id) on delete restrict,
  promotion_rule_id uuid
    references public.promotion_rules(id) on delete restrict,
  system_recommendation public.promotion_outcome not null,
  final_decision public.promotion_outcome,
  reason text,
  was_overridden boolean not null default false,
  confirmed_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_decision_term_enrollment_unique
    unique (term_id, enrollment_id),
  constraint promotion_decision_confirmation_complete check (
    (final_decision is null and confirmed_by is null and confirmed_at is null)
    or (
      final_decision is not null
      and confirmed_by is not null
      and confirmed_at is not null
    )
  ),
  constraint promotion_override_reason_required check (
    not was_overridden
    or (reason is not null and length(btrim(reason)) > 0)
  )
);

create table public.student_access_credentials (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  access_code_lookup_hash text not null unique
    check (length(btrim(access_code_lookup_hash)) >= 32),
  pin_hash text not null check (length(btrim(pin_hash)) >= 32),
  is_active boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_access_expiry_valid
    check (expires_at is null or expires_at > created_at)
);

create unique index student_one_active_access_credential_idx
  on public.student_access_credentials (student_id)
  where is_active;

comment on table public.student_access_credentials is
  'Stores only one-way lookup and PIN hashes. Plaintext credentials are prohibited.';

create table public.parent_access_sessions (
  id uuid primary key default gen_random_uuid(),
  student_access_credential_id uuid not null
    references public.student_access_credentials(id) on delete restrict,
  session_token_hash text not null unique
    check (length(btrim(session_token_hash)) >= 32),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint parent_access_session_expiry_valid
    check (expires_at > created_at),
  constraint parent_access_session_revocation_valid
    check (revoked_at is null or revoked_at >= created_at)
);

comment on table public.parent_access_sessions is
  'Stores only one-way session-token hashes; browser session behavior is deferred.';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_membership_id uuid
    references public.school_staff_memberships(id) on delete restrict,
  action text not null check (length(btrim(action)) between 1 and 150),
  entity_type text not null check (length(btrim(entity_type)) between 1 and 150),
  entity_id uuid,
  old_values jsonb check (
    old_values is null or jsonb_typeof(old_values) = 'object'
  ),
  new_values jsonb check (
    new_values is null or jsonb_typeof(new_values) = 'object'
  ),
  reason text,
  request_id uuid,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only explicit security and academic workflow events. Secret values are prohibited.';

create or replace function internal.validate_report_template_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  creator_school_id uuid;
begin
  if new.created_by is not null then
    select school_id into creator_school_id
    from public.school_staff_memberships where id = new.created_by;

    if creator_school_id is distinct from new.school_id then
      raise exception 'Report template creator must belong to the selected school.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function internal.validate_report_batch_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  term_school_id uuid;
  section_year_id uuid;
  requester_school_id uuid;
begin
  select terms.academic_year_id, academic_years.school_id
    into term_year_id, term_school_id
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  if new.class_section_id is not null then
    select academic_year_id into section_year_id
    from public.class_sections where id = new.class_section_id;
  end if;

  if new.requested_by is not null then
    select school_id into requester_school_id
    from public.school_staff_memberships where id = new.requested_by;
  end if;

  if (
       new.class_section_id is not null
       and section_year_id is distinct from term_year_id
     )
     or (
       new.requested_by is not null
       and requester_school_id is distinct from term_school_id
     ) then
    raise exception 'Report batch references must share one school and academic scope.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_report_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  term_school_id uuid;
  enrollment_year_id uuid;
  enrollment_class_id uuid;
  batch_term_id uuid;
  batch_class_id uuid;
  template_school_id uuid;
  actor_school_id uuid;
  superseded_term_id uuid;
  superseded_enrollment_id uuid;
begin
  select terms.academic_year_id, academic_years.school_id
    into term_year_id, term_school_id
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  select academic_year_id, class_section_id
    into enrollment_year_id, enrollment_class_id
  from public.enrollments where id = new.enrollment_id;

  select term_id, class_section_id
    into batch_term_id, batch_class_id
  from public.report_batches where id = new.batch_id;

  select school_id into template_school_id
  from public.report_templates where id = new.template_id;

  if new.created_by is not null then
    select school_id into actor_school_id
    from public.school_staff_memberships where id = new.created_by;
  end if;

  if new.superseded_by is not null then
    select term_id, enrollment_id
      into superseded_term_id, superseded_enrollment_id
    from public.reports where id = new.superseded_by;
  end if;

  if enrollment_year_id is distinct from term_year_id
     or batch_term_id is distinct from new.term_id
     or (batch_class_id is not null and batch_class_id is distinct from enrollment_class_id)
     or template_school_id is distinct from term_school_id
     or (new.created_by is not null and actor_school_id is distinct from term_school_id)
     or (
       new.superseded_by is not null
       and (
         superseded_term_id is distinct from new.term_id
         or superseded_enrollment_id is distinct from new.enrollment_id
       )
     ) then
    raise exception 'Report references must share one student, school, and academic scope.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_report_subject_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  report_school_id uuid;
  subject_school_id uuid;
begin
  select academic_years.school_id into report_school_id
  from public.reports
  join public.terms on terms.id = reports.term_id
  join public.academic_years on academic_years.id = terms.academic_year_id
  where reports.id = new.report_id;

  select school_id into subject_school_id
  from public.subjects where id = new.subject_id;

  if subject_school_id is distinct from report_school_id then
    raise exception 'Report subject must belong to the report school.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_promotion_decision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  term_school_id uuid;
  promotion_term boolean;
  enrollment_year_id uuid;
  enrollment_class_id uuid;
  enrollment_grade_id uuid;
  rule_school_id uuid;
  rule_year_id uuid;
  rule_grade_id uuid;
  confirmer_school_id uuid;
begin
  select terms.academic_year_id, academic_years.school_id,
         terms.is_promotion_term
    into term_year_id, term_school_id, promotion_term
  from public.terms
  join public.academic_years on academic_years.id = terms.academic_year_id
  where terms.id = new.term_id;

  select enrollments.academic_year_id, enrollments.class_section_id,
         class_sections.grade_level_id
    into enrollment_year_id, enrollment_class_id, enrollment_grade_id
  from public.enrollments
  join public.class_sections
    on class_sections.id = enrollments.class_section_id
  where enrollments.id = new.enrollment_id;

  if new.promotion_rule_id is not null then
    select school_id, academic_year_id, grade_level_id
      into rule_school_id, rule_year_id, rule_grade_id
    from public.promotion_rules where id = new.promotion_rule_id;
  end if;

  if new.confirmed_by is not null then
    select school_id into confirmer_school_id
    from public.school_staff_memberships where id = new.confirmed_by;
  end if;

  if enrollment_year_id is distinct from term_year_id
     or (
       new.promotion_rule_id is not null
       and (
         rule_school_id is distinct from term_school_id
         or (rule_year_id is not null and rule_year_id is distinct from term_year_id)
         or (rule_grade_id is not null and rule_grade_id is distinct from enrollment_grade_id)
       )
     )
     or (
       new.confirmed_by is not null
       and confirmer_school_id is distinct from term_school_id
     ) then
    raise exception 'Promotion decision references must share one school and academic scope.'
      using errcode = '23514';
  end if;

  if new.final_decision is not null and not promotion_term then
    raise exception 'A final promotion decision requires a promotion term.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function internal.validate_student_access_credential_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  student_school_id uuid;
  creator_school_id uuid;
begin
  if new.created_by is not null then
    select school_id into student_school_id
    from public.students where id = new.student_id;

    select school_id into creator_school_id
    from public.school_staff_memberships where id = new.created_by;

    if creator_school_id is distinct from student_school_id then
      raise exception 'Credential creator must belong to the student school.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function internal.validate_audit_actor_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  membership_school_id uuid;
  membership_profile_id uuid;
begin
  if new.actor_membership_id is not null then
    select school_id, profile_id
      into membership_school_id, membership_profile_id
    from public.school_staff_memberships
    where id = new.actor_membership_id;

    if membership_school_id is distinct from new.school_id
       or (
         new.actor_profile_id is not null
         and membership_profile_id is distinct from new.actor_profile_id
       ) then
      raise exception 'Audit actor membership must match the event school and profile.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger report_templates_validate_scope
before insert or update on public.report_templates
for each row execute function internal.validate_report_template_scope();

create trigger report_batches_validate_scope
before insert or update on public.report_batches
for each row execute function internal.validate_report_batch_scope();

create trigger reports_validate_scope
before insert or update on public.reports
for each row execute function internal.validate_report_scope();

create trigger report_subject_results_validate_scope
before insert or update on public.report_subject_results
for each row execute function internal.validate_report_subject_scope();

create trigger promotion_decisions_validate_scope
before insert or update on public.promotion_decisions
for each row execute function internal.validate_promotion_decision();

create trigger student_access_credentials_validate_scope
before insert or update on public.student_access_credentials
for each row execute function internal.validate_student_access_credential_scope();

create trigger audit_logs_validate_actor_scope
before insert on public.audit_logs
for each row execute function internal.validate_audit_actor_scope();

create trigger report_snapshots_prevent_mutation
before update or delete on public.report_snapshots
for each row execute function internal.prevent_mutation();

create trigger audit_logs_prevent_mutation
before update or delete on public.audit_logs
for each row execute function internal.prevent_mutation();

create trigger report_templates_set_updated_at
before update on public.report_templates
for each row execute function internal.set_updated_at();

create trigger report_batches_set_updated_at
before update on public.report_batches
for each row execute function internal.set_updated_at();

create trigger reports_set_updated_at
before update on public.reports
for each row execute function internal.set_updated_at();

create trigger promotion_decisions_set_updated_at
before update on public.promotion_decisions
for each row execute function internal.set_updated_at();

create trigger student_access_credentials_set_updated_at
before update on public.student_access_credentials
for each row execute function internal.set_updated_at();

create index report_templates_school_active_idx
  on public.report_templates (school_id, is_active);

create index report_batches_term_class_status_idx
  on public.report_batches (term_id, class_section_id, status);

create index reports_batch_idx
  on public.reports (batch_id);

create index reports_term_status_idx
  on public.reports (term_id, status);

create index reports_enrollment_idx
  on public.reports (enrollment_id);

create index reports_published_at_idx
  on public.reports (published_at desc)
  where status = 'PUBLISHED';

create index report_snapshots_report_idx
  on public.report_snapshots (report_id);

create index report_subject_results_subject_idx
  on public.report_subject_results (subject_id);

create index promotion_decisions_enrollment_idx
  on public.promotion_decisions (enrollment_id);

create index student_access_credentials_student_idx
  on public.student_access_credentials (student_id);

create index parent_access_sessions_credential_expiry_idx
  on public.parent_access_sessions (student_access_credential_id, expires_at);

create index audit_logs_school_created_idx
  on public.audit_logs (school_id, created_at desc);

create index audit_logs_actor_profile_created_idx
  on public.audit_logs (actor_profile_id, created_at desc)
  where actor_profile_id is not null;

create index audit_logs_actor_membership_created_idx
  on public.audit_logs (actor_membership_id, created_at desc)
  where actor_membership_id is not null;

create index audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

create index audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

revoke all on all functions in schema internal from public;
revoke all on all functions in schema internal from anon;
revoke all on all functions in schema internal from authenticated;
