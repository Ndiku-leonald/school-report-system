-- Stage 10: marks submission, review, approval, locking, and correction revisions.

alter table public.mark_sheets
  add column supersedes_mark_sheet_id uuid
    references public.mark_sheets(id) on delete restrict;

alter table public.mark_sheets
  add constraint mark_sheet_not_self_superseding
    check (supersedes_mark_sheet_id is null or supersedes_mark_sheet_id <> id);

create unique index mark_sheet_one_direct_successor_idx
  on public.mark_sheets (supersedes_mark_sheet_id)
  where supersedes_mark_sheet_id is not null;

create index mark_sheets_scope_version_idx
  on public.mark_sheets (term_id, class_section_id, subject_id, version desc, id);

create index mark_sheets_supersedes_idx
  on public.mark_sheets (supersedes_mark_sheet_id)
  where supersedes_mark_sheet_id is not null;

create or replace function internal.protect_mark_sheet_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'MARK_SHEET_DELETE_FORBIDDEN' using errcode = '55000';
  end if;
  if old.id is distinct from new.id
     or old.term_id is distinct from new.term_id
     or old.class_section_id is distinct from new.class_section_id
     or old.subject_id is distinct from new.subject_id
     or old.assessment_scheme_id is distinct from new.assessment_scheme_id
     or old.teaching_assignment_id is distinct from new.teaching_assignment_id
     or old.supersedes_mark_sheet_id is distinct from new.supersedes_mark_sheet_id
     or old.version is distinct from new.version
     or old.created_at is distinct from new.created_at then
    raise exception 'MARK_SHEET_IDENTITY_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end
$$;

create or replace function internal.validate_mark_sheet_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  term_year_id uuid;
  section_year_id uuid;
  section_grade_id uuid;
  scheme_term_id uuid;
  scheme_grade_id uuid;
  scheme_subject_id uuid;
  scheme_status public.assessment_scheme_status;
  assignment_term_id uuid;
  assignment_section_id uuid;
  assignment_subject_id uuid;
  source_sheet public.mark_sheets%rowtype;
begin
  select academic_year_id into term_year_id
  from public.terms where id = new.term_id;

  select academic_year_id, grade_level_id
    into section_year_id, section_grade_id
  from public.class_sections where id = new.class_section_id;

  select term_id, grade_level_id, subject_id, status
    into scheme_term_id, scheme_grade_id, scheme_subject_id, scheme_status
  from public.assessment_schemes where id = new.assessment_scheme_id;

  select term_id, class_section_id, subject_id
    into assignment_term_id, assignment_section_id, assignment_subject_id
  from public.teaching_assignments where id = new.teaching_assignment_id;

  if tg_op = 'INSERT' then
    if new.supersedes_mark_sheet_id is null then
      if scheme_status is distinct from 'ACTIVE' then
        raise exception 'A mark sheet must reference an active assessment scheme.'
          using errcode = '23514';
      end if;
    else
      select sheet.* into source_sheet
      from public.mark_sheets sheet
      where sheet.id = new.supersedes_mark_sheet_id;

      if not found
         or source_sheet.workflow_status <> 'LOCKED'
         or new.term_id is distinct from source_sheet.term_id
         or new.class_section_id is distinct from source_sheet.class_section_id
         or new.subject_id is distinct from source_sheet.subject_id
         or new.assessment_scheme_id is distinct from source_sheet.assessment_scheme_id
         or new.teaching_assignment_id is distinct from source_sheet.teaching_assignment_id
         or new.version is distinct from source_sheet.version + 1 then
        raise exception 'MARK_SHEET_CORRECTION_SCOPE_INVALID'
          using errcode = '23514';
      end if;
    end if;
  elsif old.assessment_scheme_id is distinct from new.assessment_scheme_id
        and scheme_status is distinct from 'ACTIVE' then
    raise exception 'A mark sheet must reference an active assessment scheme.'
      using errcode = '23514';
  end if;

  if section_year_id is distinct from term_year_id
     or scheme_term_id is distinct from new.term_id
     or scheme_grade_id is distinct from section_grade_id
     or scheme_subject_id is distinct from new.subject_id
     or assignment_term_id is distinct from new.term_id
     or assignment_section_id is distinct from new.class_section_id
     or assignment_subject_id is distinct from new.subject_id then
    raise exception 'Mark sheet references do not agree on term, class, grade, subject, and teaching assignment.'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function internal.protect_mark_sheet_workflow_state()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.workflow_status <> 'DRAFT'
       or new.submitted_by is not null or new.submitted_at is not null
       or new.reviewed_by is not null or new.reviewed_at is not null
       or new.approved_by is not null or new.approved_at is not null
       or new.locked_by is not null or new.locked_at is not null
       or new.returned_by is not null or new.returned_at is not null
       or new.return_reason is not null then
      raise exception 'MARK_SHEET_WORKFLOW_DIRECT_MUTATION_FORBIDDEN'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if (
    old.workflow_status is distinct from new.workflow_status
    or old.submitted_by is distinct from new.submitted_by
    or old.submitted_at is distinct from new.submitted_at
    or old.reviewed_by is distinct from new.reviewed_by
    or old.reviewed_at is distinct from new.reviewed_at
    or old.approved_by is distinct from new.approved_by
    or old.approved_at is distinct from new.approved_at
    or old.locked_by is distinct from new.locked_by
    or old.locked_at is distinct from new.locked_at
    or old.returned_by is distinct from new.returned_by
    or old.returned_at is distinct from new.returned_at
    or old.return_reason is distinct from new.return_reason
  ) and coalesce(current_setting('app.marks_workflow_transition', true), '') <> 'allowed' then
    raise exception 'MARK_SHEET_WORKFLOW_DIRECT_MUTATION_FORBIDDEN'
      using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists zy_mark_sheets_protect_workflow_stage10 on public.mark_sheets;
create trigger zy_mark_sheets_protect_workflow_stage10
before insert or update on public.mark_sheets
for each row execute function internal.protect_mark_sheet_workflow_state();

create or replace function internal.protect_term_marks_workflow_state()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status is distinct from new.status
     and not (old.status = 'DRAFT' and new.status = 'OPEN')
     and coalesce(current_setting('app.term_marks_workflow_transition', true), '') <> 'allowed' then
    raise exception 'TERM_MARKS_WORKFLOW_DIRECT_MUTATION_FORBIDDEN'
      using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists zy_terms_protect_marks_workflow_stage10 on public.terms;
create trigger zy_terms_protect_marks_workflow_stage10
before update of status on public.terms
for each row execute function internal.protect_term_marks_workflow_state();

create or replace function internal.protect_frozen_mark_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
begin
  select sheet.* into selected_sheet
  from public.mark_sheets sheet
  where sheet.id = new.mark_sheet_id;
  select term.* into selected_term
  from public.terms term
  where term.id = selected_sheet.term_id;

  if not (
    (selected_sheet.workflow_status = 'DRAFT'
      and selected_sheet.supersedes_mark_sheet_id is null
      and selected_term.status = 'MARKS_ENTRY')
    or (selected_sheet.workflow_status = 'RETURNED'
      and selected_term.status in ('MARKS_ENTRY', 'REVIEW'))
    or (selected_sheet.workflow_status = 'DRAFT'
      and selected_sheet.supersedes_mark_sheet_id is not null
      and selected_term.status = 'REVIEW')
  ) then
    raise exception 'MARK_SHEET_MARKS_FROZEN' using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists zz_marks_protect_frozen_state_stage10 on public.marks;
create trigger zz_marks_protect_frozen_state_stage10
before insert or update on public.marks
for each row execute function internal.protect_frozen_mark_state();

create or replace function internal.lock_assignment_term_for_marks_workflow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target_term_id uuid;
begin
  target_term_id := case when tg_op = 'DELETE' then old.term_id else new.term_id end;
  perform term.id from public.terms term where term.id = target_term_id for update;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists zz_teaching_assignments_lock_term_stage10
  on public.teaching_assignments;
create trigger zz_teaching_assignments_lock_term_stage10
before insert or update or delete on public.teaching_assignments
for each row execute function internal.lock_assignment_term_for_marks_workflow();

create or replace function internal.raise_mark_sheet_workflow_conflict()
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  raise exception 'MARK_SHEET_WORKFLOW_CONFLICT' using errcode = 'PT409';
end
$$;

create or replace function internal.raise_term_marks_workflow_conflict()
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  raise exception 'TERM_MARKS_WORKFLOW_CONFLICT' using errcode = 'PT409';
end
$$;

create or replace function internal.lock_and_require_marks_workflow_authority(
  required_permission public.app_permission
)
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  current_profile_id uuid := auth.uid();
  current_session_id uuid := internal.current_auth_session_id();
  selected_selection internal.staff_session_active_memberships%rowtype;
  selected_membership public.school_staff_memberships%rowtype;
  selected_school public.schools%rowtype;
  locked_roles public.staff_role[];
  locked_permissions public.app_permission[];
begin
  if current_profile_id is null or current_session_id is null
     or required_permission is null then
    raise exception 'MARKS_WORKFLOW_FORBIDDEN' using errcode = '42501';
  end if;

  -- Global workflow lock prefix: session selection -> membership -> school ->
  -- role grants by UUID -> applicable permission mappings by UUID. Academic
  -- locks always extend this prefix; no workflow path acquires it in reverse.
  select selection.* into selected_selection
  from internal.staff_session_active_memberships selection
  where selection.session_id = current_session_id
    and selection.profile_id = current_profile_id
  for update;

  if not found then
    raise exception 'MARKS_WORKFLOW_FORBIDDEN' using errcode = '42501';
  end if;

  select membership.* into selected_membership
  from public.school_staff_memberships membership
  where membership.id = selected_selection.membership_id
  for update;

  if not found
     or selected_membership.profile_id is distinct from current_profile_id
     or selected_membership.status <> 'ACTIVE' then
    raise exception 'MARKS_WORKFLOW_FORBIDDEN' using errcode = '42501';
  end if;

  select school.* into selected_school
  from public.schools school
  where school.id = selected_membership.school_id
  for update;

  if not found or not selected_school.is_active then
    raise exception 'MARKS_WORKFLOW_FORBIDDEN' using errcode = '42501';
  end if;

  perform role_assignment.id
  from public.staff_role_assignments role_assignment
  where role_assignment.membership_id = selected_membership.id
  order by role_assignment.id
  for update;

  perform mapping.id
  from public.role_permissions mapping
  where mapping.role in (
    select role_assignment.role
    from public.staff_role_assignments role_assignment
    where role_assignment.membership_id = selected_membership.id
      and role_assignment.granted_at <= now()
      and role_assignment.revoked_at is null
  )
  order by mapping.id
  for update;

  select coalesce(array_agg(distinct role_assignment.role), '{}'::public.staff_role[])
    into locked_roles
  from public.staff_role_assignments role_assignment
  where role_assignment.membership_id = selected_membership.id
    and role_assignment.granted_at <= now()
    and role_assignment.revoked_at is null;

  select coalesce(array_agg(distinct mapping.permission), '{}'::public.app_permission[])
    into locked_permissions
  from public.staff_role_assignments role_assignment
  join public.role_permissions mapping on mapping.role = role_assignment.role
  where role_assignment.membership_id = selected_membership.id
    and role_assignment.granted_at <= now()
    and role_assignment.revoked_at is null;

  if not (required_permission = any(locked_permissions)) then
    raise exception 'MARKS_WORKFLOW_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select current_profile_id, selected_membership.id, selected_school.id,
    locked_roles, locked_permissions;
end
$$;

create or replace function internal.lock_and_require_marks_write_authority()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query
  select authority.*
  from internal.lock_and_require_marks_workflow_authority('MARKS_ENTER') authority
  where 'SUBJECT_TEACHER' = any(authority.effective_roles);

  if not found then
    raise exception 'MARK_ENTRY_FORBIDDEN' using errcode = '42501';
  end if;
end
$$;

create or replace function internal.require_marks_entry_actor()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language sql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
  select authority.*
  from internal.lock_and_require_marks_write_authority() authority;
$$;

create or replace function internal.membership_has_bound_subject_assignment(
  target_membership_id uuid,
  target_assignment_id uuid,
  target_term_id uuid,
  target_class_section_id uuid,
  target_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select internal.membership_has_live_subject_teacher_role(target_membership_id)
    and exists (
      select 1
      from public.teaching_assignments assignment
      where assignment.id = target_assignment_id
        and assignment.staff_membership_id = target_membership_id
        and assignment.term_id = target_term_id
        and assignment.class_section_id = target_class_section_id
        and assignment.subject_id = target_subject_id
    );
$$;

create or replace function internal.reader_can_access_mark_sheet(
  actor_membership_id uuid,
  actor_school_id uuid,
  actor_can_view_all boolean,
  actor_can_view_assigned boolean,
  target_mark_sheet_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select exists (
    select 1
    from public.mark_sheets sheet
    join public.terms term on term.id = sheet.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where sheet.id = target_mark_sheet_id
      and year.school_id = actor_school_id
      and (
        actor_can_view_all
        or (
          actor_can_view_assigned
          and internal.membership_has_bound_subject_assignment(
            actor_membership_id,
            sheet.teaching_assignment_id,
            sheet.term_id,
            sheet.class_section_id,
            sheet.subject_id
          )
        )
      )
  );
$$;

create or replace function internal.assert_editable_mark_sheet(
  target_mark_sheet_id uuid,
  actor_membership_id uuid,
  actor_school_id uuid
)
returns public.mark_sheets
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  selected_sheet public.mark_sheets%rowtype;
  selected_assignment public.teaching_assignments%rowtype;
  selected_term public.terms%rowtype;
  sheet_school_id uuid;
  bound_teacher boolean;
  current_assignment boolean;
begin
  select sheet.* into selected_sheet
  from public.mark_sheets sheet
  where sheet.id = target_mark_sheet_id;
  if not found then
    raise exception 'MARK_ENTRY_SHEET_NOT_FOUND' using errcode = 'P0002';
  end if;

  select assignment.* into selected_assignment
  from public.teaching_assignments assignment
  where assignment.id = selected_sheet.teaching_assignment_id
  for update;

  select term.* into selected_term
  from public.terms term
  where term.id = selected_sheet.term_id
  for update;

  select sheet.* into selected_sheet
  from public.mark_sheets sheet
  where sheet.id = target_mark_sheet_id
  for update;

  select year.school_id into sheet_school_id
  from public.academic_years year
  where year.id = selected_term.academic_year_id;

  if sheet_school_id is distinct from actor_school_id then
    raise exception 'MARK_ENTRY_CROSS_SCHOOL' using errcode = '42501';
  end if;

  bound_teacher := internal.membership_has_bound_subject_assignment(
    actor_membership_id, selected_sheet.teaching_assignment_id,
    selected_sheet.term_id, selected_sheet.class_section_id,
    selected_sheet.subject_id
  );
  current_assignment := internal.membership_has_current_subject_assignment(
    actor_membership_id, selected_sheet.teaching_assignment_id,
    selected_sheet.term_id, selected_sheet.class_section_id,
    selected_sheet.subject_id
  );

  if not bound_teacher then
    raise exception 'MARK_ENTRY_ASSIGNMENT_NOT_CURRENT' using errcode = '42501';
  end if;

  if not (
    (selected_sheet.workflow_status = 'DRAFT'
      and selected_sheet.supersedes_mark_sheet_id is null
      and selected_term.status = 'MARKS_ENTRY'
      and current_assignment)
    or (selected_sheet.workflow_status = 'RETURNED'
      and selected_term.status = 'MARKS_ENTRY'
      and current_assignment)
    or (selected_sheet.workflow_status = 'RETURNED'
      and selected_term.status = 'REVIEW')
    or (selected_sheet.workflow_status = 'DRAFT'
      and selected_sheet.supersedes_mark_sheet_id is not null
      and selected_term.status = 'REVIEW')
  ) then
    raise exception 'MARK_ENTRY_SHEET_NOT_EDITABLE' using errcode = '55000';
  end if;

  return selected_sheet;
end
$$;

create or replace function internal.normalize_marks_workflow_reason(
  value text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare normalized text := nullif(btrim(value), '');
begin
  if normalized is null then
    raise exception 'MARKS_WORKFLOW_REASON_REQUIRED' using errcode = '22023';
  end if;
  if length(normalized) > 1000 then
    raise exception 'MARKS_WORKFLOW_REASON_TOO_LONG' using errcode = '22001';
  end if;
  if normalized ~ '[[:cntrl:]]' then
    raise exception 'MARKS_WORKFLOW_REASON_CONTROL_CHARACTERS' using errcode = '22021';
  end if;
  return normalized;
end
$$;

create or replace function internal.mark_sheet_completion(
  target_mark_sheet_id uuid
)
returns table (
  expected_required_cells bigint,
  recorded_required_cells bigint,
  missing_required_cells bigint,
  completion_percentage numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with sheet_scope as (
    select sheet.id, sheet.assessment_scheme_id, sheet.class_section_id,
      term.academic_year_id, term.starts_on, term.ends_on, year.school_id
    from public.mark_sheets sheet
    join public.terms term on term.id = sheet.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where sheet.id = target_mark_sheet_id
  ), eligible_enrollments as (
    select enrollment.id
    from sheet_scope scope
    join public.enrollments enrollment
      on enrollment.class_section_id = scope.class_section_id
     and enrollment.academic_year_id = scope.academic_year_id
     and enrollment.enrolled_on <= scope.ends_on
     and (enrollment.exited_on is null or enrollment.exited_on >= scope.starts_on)
    join public.students student
      on student.id = enrollment.student_id
     and student.school_id = scope.school_id
  ), required_components as (
    select component.id
    from sheet_scope scope
    join public.assessment_components component
      on component.assessment_scheme_id = scope.assessment_scheme_id
     and component.is_required
  ), totals as (
    select
      (select count(*) from eligible_enrollments)
        * (select count(*) from required_components) as expected_count,
      (
        select count(*)
        from public.marks mark
        where mark.mark_sheet_id = target_mark_sheet_id
          and mark.enrollment_id in (select id from eligible_enrollments)
          and mark.assessment_component_id in (select id from required_components)
      ) as recorded_count
  )
  select expected_count, recorded_count,
    greatest(expected_count - recorded_count, 0),
    case when expected_count = 0 then 100.00::numeric
      else round(recorded_count::numeric * 100.00 / expected_count, 2) end
  from totals;
$$;

create or replace function internal.lock_mark_sheet_workflow_context(
  target_mark_sheet_id uuid,
  actor_school_id uuid,
  expected_updated_at timestamptz
)
returns public.mark_sheets
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_sheet public.mark_sheets%rowtype;
  selected_assignment public.teaching_assignments%rowtype;
  selected_term public.terms%rowtype;
  sheet_school_id uuid;
begin
  select sheet.* into selected_sheet
  from public.mark_sheets sheet
  where sheet.id = target_mark_sheet_id;
  if not found then
    raise exception 'MARK_SHEET_WORKFLOW_NOT_FOUND' using errcode = 'P0002';
  end if;

  select assignment.* into selected_assignment
  from public.teaching_assignments assignment
  where assignment.id = selected_sheet.teaching_assignment_id
  for update;

  select term.* into selected_term
  from public.terms term
  where term.id = selected_sheet.term_id
  for update;

  select sheet.* into selected_sheet
  from public.mark_sheets sheet
  where sheet.id = target_mark_sheet_id
  for update;

  select year.school_id into sheet_school_id
  from public.academic_years year
  where year.id = selected_term.academic_year_id;

  if selected_assignment.id is null
     or selected_assignment.term_id is distinct from selected_sheet.term_id
     or selected_assignment.class_section_id is distinct from selected_sheet.class_section_id
     or selected_assignment.subject_id is distinct from selected_sheet.subject_id then
    raise exception 'MARK_SHEET_WORKFLOW_ASSIGNMENT_INVALID' using errcode = '23514';
  end if;
  if sheet_school_id is distinct from actor_school_id then
    raise exception 'MARKS_WORKFLOW_FORBIDDEN' using errcode = '42501';
  end if;
  if selected_sheet.updated_at is distinct from expected_updated_at then
    perform internal.raise_mark_sheet_workflow_conflict();
  end if;
  return selected_sheet;
end
$$;

create or replace function internal.lock_mark_sheet_cells(
  target_mark_sheet_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  perform mark.id
  from public.marks mark
  where mark.mark_sheet_id = target_mark_sheet_id
  order by mark.assessment_component_id, mark.enrollment_id
  for update;
end
$$;

create or replace function public.submit_mark_sheet(
  target_mark_sheet_id uuid,
  expected_updated_at timestamptz
)
returns table (
  mark_sheet_id uuid,
  workflow_status public.mark_sheet_status,
  sheet_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
  completion record;
  changed public.mark_sheets%rowtype;
begin
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_SUBMIT');
  if not ('SUBJECT_TEACHER' = any(actor.effective_roles)) then
    raise exception 'MARKS_WORKFLOW_BOUND_TEACHER_REQUIRED' using errcode = '42501';
  end if;

  selected_sheet := internal.lock_mark_sheet_workflow_context(
    target_mark_sheet_id, actor.school_id, expected_updated_at
  );
  select * into selected_term from public.terms where id = selected_sheet.term_id;

  if selected_sheet.workflow_status <> 'DRAFT' then
    raise exception 'MARK_SHEET_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;
  if not internal.membership_has_bound_subject_assignment(
    actor.membership_id, selected_sheet.teaching_assignment_id,
    selected_sheet.term_id, selected_sheet.class_section_id, selected_sheet.subject_id
  ) then
    raise exception 'MARKS_WORKFLOW_BOUND_TEACHER_REQUIRED' using errcode = '42501';
  end if;

  if selected_sheet.supersedes_mark_sheet_id is null then
    if selected_term.status <> 'MARKS_ENTRY'
       or not internal.membership_has_current_subject_assignment(
         actor.membership_id, selected_sheet.teaching_assignment_id,
         selected_sheet.term_id, selected_sheet.class_section_id, selected_sheet.subject_id
       ) then
      raise exception 'MARK_SHEET_SUBMISSION_TERM_INVALID' using errcode = '55000';
    end if;
  elsif selected_term.status <> 'REVIEW' then
    raise exception 'MARK_SHEET_SUBMISSION_TERM_INVALID' using errcode = '55000';
  end if;

  perform internal.lock_mark_sheet_cells(selected_sheet.id);
  select * into completion from internal.mark_sheet_completion(selected_sheet.id);
  if completion.missing_required_cells > 0 then
    raise exception 'MARK_SHEET_INCOMPLETE' using errcode = '23514';
  end if;

  perform set_config('app.marks_workflow_transition', 'allowed', true);
  update public.mark_sheets
  set workflow_status = 'SUBMITTED',
      submitted_by = actor.membership_id,
      submitted_at = now()
  where id = selected_sheet.id
  returning * into changed;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_SHEET_SUBMITTED', 'mark_sheet', changed.id,
    jsonb_build_object('workflow_status', selected_sheet.workflow_status),
    jsonb_build_object(
      'workflow_status', changed.workflow_status,
      'version', changed.version,
      'expected_required_cells', completion.expected_required_cells,
      'recorded_required_cells', completion.recorded_required_cells
    )
  );
  return query select changed.id, changed.workflow_status, changed.updated_at;
end
$$;

create or replace function public.resubmit_returned_mark_sheet(
  target_mark_sheet_id uuid,
  expected_updated_at timestamptz
)
returns table (
  mark_sheet_id uuid,
  workflow_status public.mark_sheet_status,
  sheet_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
  completion record;
  changed public.mark_sheets%rowtype;
begin
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_SUBMIT');
  if not ('SUBJECT_TEACHER' = any(actor.effective_roles)) then
    raise exception 'MARKS_WORKFLOW_BOUND_TEACHER_REQUIRED' using errcode = '42501';
  end if;
  selected_sheet := internal.lock_mark_sheet_workflow_context(
    target_mark_sheet_id, actor.school_id, expected_updated_at
  );
  select * into selected_term from public.terms where id = selected_sheet.term_id;

  if selected_sheet.workflow_status <> 'RETURNED'
     or selected_term.status not in ('MARKS_ENTRY', 'REVIEW') then
    raise exception 'MARK_SHEET_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;
  if not internal.membership_has_bound_subject_assignment(
    actor.membership_id, selected_sheet.teaching_assignment_id,
    selected_sheet.term_id, selected_sheet.class_section_id, selected_sheet.subject_id
  ) then
    raise exception 'MARKS_WORKFLOW_BOUND_TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if selected_term.status = 'MARKS_ENTRY'
     and not internal.membership_has_current_subject_assignment(
       actor.membership_id, selected_sheet.teaching_assignment_id,
       selected_sheet.term_id, selected_sheet.class_section_id, selected_sheet.subject_id
     ) then
    raise exception 'MARKS_WORKFLOW_BOUND_TEACHER_REQUIRED' using errcode = '42501';
  end if;

  perform internal.lock_mark_sheet_cells(selected_sheet.id);
  select * into completion from internal.mark_sheet_completion(selected_sheet.id);
  if completion.missing_required_cells > 0 then
    raise exception 'MARK_SHEET_INCOMPLETE' using errcode = '23514';
  end if;

  perform set_config('app.marks_workflow_transition', 'allowed', true);
  update public.mark_sheets
  set workflow_status = 'SUBMITTED',
      submitted_by = actor.membership_id,
      submitted_at = now()
  where id = selected_sheet.id
  returning * into changed;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_SHEET_RESUBMITTED', 'mark_sheet', changed.id,
    jsonb_build_object('workflow_status', selected_sheet.workflow_status),
    jsonb_build_object(
      'workflow_status', changed.workflow_status,
      'version', changed.version,
      'expected_required_cells', completion.expected_required_cells,
      'recorded_required_cells', completion.recorded_required_cells
    )
  );
  return query select changed.id, changed.workflow_status, changed.updated_at;
end
$$;

create or replace function public.start_mark_sheet_review(
  target_mark_sheet_id uuid,
  expected_updated_at timestamptz
)
returns table (
  mark_sheet_id uuid,
  workflow_status public.mark_sheet_status,
  sheet_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
  changed public.mark_sheets%rowtype;
begin
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_REVIEW');
  selected_sheet := internal.lock_mark_sheet_workflow_context(
    target_mark_sheet_id, actor.school_id, expected_updated_at
  );
  select * into selected_term from public.terms where id = selected_sheet.term_id;
  if selected_sheet.workflow_status <> 'SUBMITTED'
     or selected_term.status not in ('MARKS_ENTRY', 'REVIEW') then
    raise exception 'MARK_SHEET_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;
  if selected_sheet.submitted_by = actor.membership_id then
    raise exception 'MARK_SHEET_SELF_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;

  perform set_config('app.marks_workflow_transition', 'allowed', true);
  update public.mark_sheets
  set workflow_status = 'UNDER_REVIEW',
      reviewed_by = actor.membership_id,
      reviewed_at = now()
  where id = selected_sheet.id
  returning * into changed;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_SHEET_REVIEW_STARTED', 'mark_sheet', changed.id,
    jsonb_build_object('workflow_status', selected_sheet.workflow_status),
    jsonb_build_object('workflow_status', changed.workflow_status, 'version', changed.version)
  );
  return query select changed.id, changed.workflow_status, changed.updated_at;
end
$$;

create or replace function public.return_mark_sheet(
  target_mark_sheet_id uuid,
  expected_updated_at timestamptz,
  return_reason text
)
returns table (
  mark_sheet_id uuid,
  workflow_status public.mark_sheet_status,
  sheet_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
  normalized_reason text;
  changed public.mark_sheets%rowtype;
begin
  normalized_reason := internal.normalize_marks_workflow_reason(return_reason);
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_REVIEW');
  selected_sheet := internal.lock_mark_sheet_workflow_context(
    target_mark_sheet_id, actor.school_id, expected_updated_at
  );
  select * into selected_term from public.terms where id = selected_sheet.term_id;
  if selected_sheet.workflow_status <> 'UNDER_REVIEW'
     or selected_term.status not in ('MARKS_ENTRY', 'REVIEW') then
    raise exception 'MARK_SHEET_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;
  if selected_sheet.submitted_by = actor.membership_id then
    raise exception 'MARK_SHEET_SELF_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;

  perform set_config('app.marks_workflow_transition', 'allowed', true);
  update public.mark_sheets
  set workflow_status = 'RETURNED',
      returned_by = actor.membership_id,
      returned_at = now(),
      return_reason = normalized_reason
  where id = selected_sheet.id
  returning * into changed;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_SHEET_RETURNED', 'mark_sheet', changed.id,
    jsonb_build_object('workflow_status', selected_sheet.workflow_status),
    jsonb_build_object(
      'workflow_status', changed.workflow_status,
      'version', changed.version,
      'return_reason', normalized_reason
    )
  );
  return query select changed.id, changed.workflow_status, changed.updated_at;
end
$$;

create or replace function public.approve_mark_sheet(
  target_mark_sheet_id uuid,
  expected_updated_at timestamptz
)
returns table (
  mark_sheet_id uuid,
  workflow_status public.mark_sheet_status,
  sheet_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
  completion record;
  changed public.mark_sheets%rowtype;
begin
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_APPROVE');
  selected_sheet := internal.lock_mark_sheet_workflow_context(
    target_mark_sheet_id, actor.school_id, expected_updated_at
  );
  select * into selected_term from public.terms where id = selected_sheet.term_id;
  if selected_sheet.workflow_status <> 'UNDER_REVIEW'
     or selected_term.status not in ('MARKS_ENTRY', 'REVIEW') then
    raise exception 'MARK_SHEET_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;
  if selected_sheet.submitted_by = actor.membership_id then
    raise exception 'MARK_SHEET_SELF_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;

  perform internal.lock_mark_sheet_cells(selected_sheet.id);
  select * into completion from internal.mark_sheet_completion(selected_sheet.id);
  if completion.missing_required_cells > 0 then
    raise exception 'MARK_SHEET_INCOMPLETE' using errcode = '23514';
  end if;

  perform set_config('app.marks_workflow_transition', 'allowed', true);
  update public.mark_sheets
  set workflow_status = 'APPROVED',
      approved_by = actor.membership_id,
      approved_at = now()
  where id = selected_sheet.id
  returning * into changed;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_SHEET_APPROVED', 'mark_sheet', changed.id,
    jsonb_build_object('workflow_status', selected_sheet.workflow_status),
    jsonb_build_object('workflow_status', changed.workflow_status, 'version', changed.version)
  );
  return query select changed.id, changed.workflow_status, changed.updated_at;
end
$$;

create or replace function public.lock_mark_sheet(
  target_mark_sheet_id uuid,
  expected_updated_at timestamptz
)
returns table (
  mark_sheet_id uuid,
  workflow_status public.mark_sheet_status,
  sheet_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
  changed public.mark_sheets%rowtype;
begin
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_LOCK');
  selected_sheet := internal.lock_mark_sheet_workflow_context(
    target_mark_sheet_id, actor.school_id, expected_updated_at
  );
  select * into selected_term from public.terms where id = selected_sheet.term_id;
  if selected_sheet.workflow_status <> 'APPROVED'
     or selected_term.status <> 'REVIEW' then
    raise exception 'MARK_SHEET_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;
  if selected_sheet.submitted_by = actor.membership_id then
    raise exception 'MARK_SHEET_SELF_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;

  perform set_config('app.marks_workflow_transition', 'allowed', true);
  update public.mark_sheets
  set workflow_status = 'LOCKED',
      locked_by = actor.membership_id,
      locked_at = now()
  where id = selected_sheet.id
  returning * into changed;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_SHEET_LOCKED', 'mark_sheet', changed.id,
    jsonb_build_object('workflow_status', selected_sheet.workflow_status),
    jsonb_build_object('workflow_status', changed.workflow_status, 'version', changed.version)
  );
  return query select changed.id, changed.workflow_status, changed.updated_at;
end
$$;

create or replace function internal.lock_enrollment_terms_for_marks_workflow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_year_id uuid;
  new_year_id uuid;
  old_class_section_id uuid;
  new_class_section_id uuid;
  roster_identity_changed boolean;
  frozen_term_id uuid;
begin
  old_year_id := case when tg_op in ('UPDATE', 'DELETE')
    then old.academic_year_id end;
  new_year_id := case when tg_op in ('INSERT', 'UPDATE')
    then new.academic_year_id end;
  old_class_section_id := case when tg_op in ('UPDATE', 'DELETE')
    then old.class_section_id end;
  new_class_section_id := case when tg_op in ('INSERT', 'UPDATE')
    then new.class_section_id end;

  roster_identity_changed := case
    when tg_op <> 'UPDATE' then true
    else row(
      old.student_id, old.academic_year_id, old.class_section_id,
      old.enrolled_on, old.exited_on
    ) is distinct from row(
      new.student_id, new.academic_year_id, new.class_section_id,
      new.enrolled_on, new.exited_on
    )
  end;
  if not roster_identity_changed then
    return new;
  end if;

  -- Enrollment writers reach this trigger after locking the enrollment row.
  -- Lock every affected term in UUID order so roster changes serialize with
  -- the Stage 10 assignment -> term -> sheet workflow order.
  begin
    perform term.id
    from public.terms term
    where term.academic_year_id in (old_year_id, new_year_id)
    order by term.id
    for update nowait;
  exception
    when lock_not_available then
      raise exception 'ENROLLMENT_MARKS_WORKFLOW_CONFLICT'
        using errcode = 'PT409';
  end;

  select term.id into frozen_term_id
  from public.terms term
  where term.academic_year_id in (old_year_id, new_year_id)
    and (
      (
        tg_op in ('UPDATE', 'DELETE')
        and term.academic_year_id = old_year_id
        and old.enrolled_on <= term.ends_on
        and (old.exited_on is null or old.exited_on >= term.starts_on)
      )
      or (
        tg_op in ('INSERT', 'UPDATE')
        and term.academic_year_id = new_year_id
        and new.enrolled_on <= term.ends_on
        and (new.exited_on is null or new.exited_on >= term.starts_on)
      )
    )
    and (
      term.status in ('REVIEW', 'LOCKED')
      or exists (
        select 1
        from public.mark_sheets sheet
        where sheet.term_id = term.id
          and sheet.workflow_status in (
            'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'LOCKED'
          )
          and sheet.class_section_id in (
            old_class_section_id, new_class_section_id
          )
      )
    )
  order by term.id
  limit 1;

  if frozen_term_id is not null then
    raise exception 'ENROLLMENT_MARKS_WORKFLOW_FROZEN'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists zz_enrollments_lock_terms_stage10 on public.enrollments;
create trigger zz_enrollments_lock_terms_stage10
before insert or update or delete on public.enrollments
for each row execute function internal.lock_enrollment_terms_for_marks_workflow();

create or replace function internal.require_marks_workflow_reader()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_permissions public.app_permission[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query
  select actor.profile_id, actor.membership_id, actor.school_id,
    actor.effective_permissions
  from internal.current_marks_actor() actor
  where actor.effective_permissions && array[
    'MARKS_VIEW_ALL'::public.app_permission,
    'MARKS_REVIEW'::public.app_permission,
    'MARKS_APPROVE'::public.app_permission,
    'MARKS_LOCK'::public.app_permission
  ];
  if not found then
    raise exception 'MARKS_WORKFLOW_VIEW_FORBIDDEN' using errcode = '42501';
  end if;
end
$$;

create or replace function internal.term_marks_workflow_readiness(
  target_term_id uuid,
  target_school_id uuid
)
returns table (
  expected_scopes bigint,
  missing_teaching_assignments bigint,
  missing_mark_sheets bigint,
  draft_sheets bigint,
  submitted_sheets bigint,
  under_review_sheets bigint,
  returned_sheets bigint,
  approved_sheets bigint,
  locked_sheets bigint,
  ready_for_review boolean,
  ready_for_lock boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with term_scope as (
    select term.id, term.academic_year_id, term.starts_on, term.ends_on
    from public.terms term
    join public.academic_years year on year.id = term.academic_year_id
    where term.id = target_term_id
      and year.school_id = target_school_id
  ), expected as (
    select distinct section.id as class_section_id, mapping.subject_id
    from term_scope scope
    join public.class_sections section
      on section.academic_year_id = scope.academic_year_id
     and section.is_active
    join public.grade_levels grade
      on grade.id = section.grade_level_id
     and grade.school_id = target_school_id
     and grade.is_active
    join public.grade_level_subjects mapping
      on mapping.grade_level_id = grade.id
    join public.subjects subject
      on subject.id = mapping.subject_id
     and subject.school_id = target_school_id
     and subject.is_active
    where exists (
      select 1
      from public.enrollments enrollment
      join public.students student on student.id = enrollment.student_id
      where enrollment.class_section_id = section.id
        and enrollment.academic_year_id = scope.academic_year_id
        and enrollment.enrolled_on <= scope.ends_on
        and (enrollment.exited_on is null or enrollment.exited_on >= scope.starts_on)
        and student.school_id = target_school_id
    )
  ), scoped as (
    select expected.class_section_id, expected.subject_id,
      exists (
        select 1
        from public.teaching_assignments assignment
        join public.school_staff_memberships membership
          on membership.id = assignment.staff_membership_id
        where assignment.term_id = target_term_id
          and assignment.class_section_id = expected.class_section_id
          and assignment.subject_id = expected.subject_id
          and membership.school_id = target_school_id
      ) as has_assignment,
      latest.id as latest_sheet_id,
      latest.workflow_status
    from expected
    left join lateral (
      select sheet.id, sheet.workflow_status
      from public.mark_sheets sheet
      where sheet.term_id = target_term_id
        and sheet.class_section_id = expected.class_section_id
        and sheet.subject_id = expected.subject_id
      order by sheet.version desc, sheet.id desc
      limit 1
    ) latest on true
  ), totals as (
    select
      count(*) as expected_count,
      count(*) filter (where not has_assignment) as missing_assignment_count,
      count(*) filter (where latest_sheet_id is null) as missing_sheet_count,
      count(*) filter (where workflow_status = 'DRAFT') as draft_count,
      count(*) filter (where workflow_status = 'SUBMITTED') as submitted_count,
      count(*) filter (where workflow_status = 'UNDER_REVIEW') as under_review_count,
      count(*) filter (where workflow_status = 'RETURNED') as returned_count,
      count(*) filter (where workflow_status = 'APPROVED') as approved_count,
      count(*) filter (where workflow_status = 'LOCKED') as locked_count
    from scoped
  )
  select expected_count, missing_assignment_count, missing_sheet_count,
    draft_count, submitted_count, under_review_count, returned_count,
    approved_count, locked_count,
    expected_count > 0
      and missing_assignment_count = 0
      and missing_sheet_count = 0
      and draft_count = 0
      and returned_count = 0,
    expected_count > 0
      and missing_assignment_count = 0
      and missing_sheet_count = 0
      and locked_count = expected_count
  from totals;
$$;

create or replace function internal.lock_term_marks_workflow_context(
  target_term_id uuid,
  actor_school_id uuid,
  expected_updated_at timestamptz
)
returns public.terms
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_term public.terms%rowtype;
  term_school_id uuid;
begin
  select term.* into selected_term
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  where term.id = target_term_id;
  if not found then
    raise exception 'TERM_MARKS_WORKFLOW_NOT_FOUND' using errcode = 'P0002';
  end if;
  select year.school_id into term_school_id
  from public.academic_years year
  where year.id = selected_term.academic_year_id;
  if term_school_id is distinct from actor_school_id then
    raise exception 'MARKS_WORKFLOW_FORBIDDEN' using errcode = '42501';
  end if;

  -- Term-wide order extends the authority prefix with every relevant teaching
  -- assignment by UUID, then the term, then all term sheets by UUID. Sheet
  -- transitions use assignment -> term -> sheet, so no reverse edge exists.
  perform assignment.id
  from public.teaching_assignments assignment
  where assignment.term_id = target_term_id
  order by assignment.id
  for update;

  select term.* into selected_term
  from public.terms term
  where term.id = target_term_id
  for update;

  if selected_term.updated_at is distinct from expected_updated_at then
    perform internal.raise_term_marks_workflow_conflict();
  end if;

  perform sheet.id
  from public.mark_sheets sheet
  where sheet.term_id = target_term_id
  order by sheet.id
  for update;

  return selected_term;
end
$$;

create or replace function public.get_term_marks_workflow_readiness(
  target_term_id uuid
)
returns table (
  term_id uuid,
  academic_year_name text,
  term_name text,
  term_status public.term_status,
  term_updated_at timestamptz,
  expected_scopes bigint,
  missing_teaching_assignments bigint,
  missing_mark_sheets bigint,
  draft_sheets bigint,
  submitted_sheets bigint,
  under_review_sheets bigint,
  returned_sheets bigint,
  approved_sheets bigint,
  locked_sheets bigint,
  ready_for_review boolean,
  ready_for_lock boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_marks_workflow_reader();
  return query
  select term.id, year.name, term.name, term.status, term.updated_at,
    readiness.expected_scopes, readiness.missing_teaching_assignments,
    readiness.missing_mark_sheets, readiness.draft_sheets,
    readiness.submitted_sheets, readiness.under_review_sheets,
    readiness.returned_sheets, readiness.approved_sheets,
    readiness.locked_sheets, readiness.ready_for_review,
    readiness.ready_for_lock
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  cross join lateral internal.term_marks_workflow_readiness(
    term.id, reader.school_id
  ) readiness
  where term.id = target_term_id
    and year.school_id = reader.school_id;
end
$$;

create or replace function public.list_marks_workflow_terms()
returns table (
  term_id uuid,
  academic_year_name text,
  academic_year_status public.academic_year_status,
  term_name text,
  term_status public.term_status,
  starts_on date,
  ends_on date,
  term_updated_at timestamptz,
  expected_scopes bigint,
  missing_teaching_assignments bigint,
  missing_mark_sheets bigint,
  draft_sheets bigint,
  submitted_sheets bigint,
  under_review_sheets bigint,
  returned_sheets bigint,
  approved_sheets bigint,
  locked_sheets bigint,
  ready_for_review boolean,
  ready_for_lock boolean,
  can_open_entry boolean,
  can_advance_review boolean,
  can_lock_term boolean,
  can_reopen_term boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_marks_workflow_reader();
  return query
  select term.id, year.name, year.status, term.name, term.status,
    term.starts_on, term.ends_on, term.updated_at,
    readiness.expected_scopes, readiness.missing_teaching_assignments,
    readiness.missing_mark_sheets, readiness.draft_sheets,
    readiness.submitted_sheets, readiness.under_review_sheets,
    readiness.returned_sheets, readiness.approved_sheets,
    readiness.locked_sheets, readiness.ready_for_review,
    readiness.ready_for_lock,
    ('MARKS_REVIEW' = any(reader.effective_permissions)
      and term.status = 'OPEN' and year.status = 'ACTIVE'
      and current_date between term.starts_on and term.ends_on),
    ('MARKS_REVIEW' = any(reader.effective_permissions)
      and term.status = 'MARKS_ENTRY' and readiness.ready_for_review),
    ('MARKS_LOCK' = any(reader.effective_permissions)
      and term.status = 'REVIEW' and readiness.ready_for_lock),
    ('MARKS_LOCK' = any(reader.effective_permissions)
      and term.status = 'LOCKED')
  from public.terms term
  join public.academic_years year on year.id = term.academic_year_id
  cross join lateral internal.term_marks_workflow_readiness(
    term.id, reader.school_id
  ) readiness
  where year.school_id = reader.school_id
    and term.status in ('OPEN', 'MARKS_ENTRY', 'REVIEW', 'LOCKED')
  order by term.starts_on desc, term.term_number desc, term.id;
end
$$;

create or replace function public.open_term_marks_entry(
  target_term_id uuid,
  expected_updated_at timestamptz
)
returns table (
  term_id uuid,
  term_status public.term_status,
  term_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_term public.terms%rowtype;
  year_status public.academic_year_status;
  changed public.terms%rowtype;
begin
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_REVIEW');
  selected_term := internal.lock_term_marks_workflow_context(
    target_term_id, actor.school_id, expected_updated_at
  );
  select year.status into year_status
  from public.academic_years year
  where year.id = selected_term.academic_year_id;

  if selected_term.status <> 'OPEN'
     or year_status <> 'ACTIVE'
     or current_date not between selected_term.starts_on and selected_term.ends_on then
    raise exception 'TERM_MARKS_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;

  perform set_config('app.term_marks_workflow_transition', 'allowed', true);
  update public.terms set status = 'MARKS_ENTRY'
  where id = selected_term.id returning * into changed;
  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'TERM_MARKS_ENTRY_OPENED', 'term', changed.id,
    jsonb_build_object('status', selected_term.status),
    jsonb_build_object('status', changed.status)
  );
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.advance_term_marks_to_review(
  target_term_id uuid,
  expected_updated_at timestamptz
)
returns table (
  term_id uuid,
  term_status public.term_status,
  term_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_term public.terms%rowtype;
  readiness record;
  changed public.terms%rowtype;
begin
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_REVIEW');
  selected_term := internal.lock_term_marks_workflow_context(
    target_term_id, actor.school_id, expected_updated_at
  );
  if selected_term.status <> 'MARKS_ENTRY' then
    raise exception 'TERM_MARKS_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;
  select * into readiness
  from internal.term_marks_workflow_readiness(selected_term.id, actor.school_id);
  if not readiness.ready_for_review then
    if readiness.missing_teaching_assignments > 0 then
      raise exception 'TERM_MARKS_MISSING_TEACHING_ASSIGNMENT' using errcode = '23514';
    end if;
    raise exception 'TERM_MARKS_NOT_READY_FOR_REVIEW' using errcode = '23514';
  end if;

  perform set_config('app.term_marks_workflow_transition', 'allowed', true);
  update public.terms set status = 'REVIEW'
  where id = selected_term.id returning * into changed;
  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'TERM_MARKS_REVIEW_STARTED', 'term', changed.id,
    jsonb_build_object('status', selected_term.status),
    jsonb_build_object('status', changed.status, 'expected_scopes', readiness.expected_scopes)
  );
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.lock_term_marks(
  target_term_id uuid,
  expected_updated_at timestamptz
)
returns table (
  term_id uuid,
  term_status public.term_status,
  term_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_term public.terms%rowtype;
  readiness record;
  changed public.terms%rowtype;
begin
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_LOCK');
  selected_term := internal.lock_term_marks_workflow_context(
    target_term_id, actor.school_id, expected_updated_at
  );
  if selected_term.status <> 'REVIEW' then
    raise exception 'TERM_MARKS_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;
  select * into readiness
  from internal.term_marks_workflow_readiness(selected_term.id, actor.school_id);
  if not readiness.ready_for_lock then
    raise exception 'TERM_MARKS_NOT_READY_FOR_LOCK' using errcode = '23514';
  end if;

  perform set_config('app.term_marks_workflow_transition', 'allowed', true);
  update public.terms set status = 'LOCKED'
  where id = selected_term.id returning * into changed;
  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'TERM_MARKS_LOCKED', 'term', changed.id,
    jsonb_build_object('status', selected_term.status),
    jsonb_build_object('status', changed.status, 'locked_scopes', readiness.locked_sheets)
  );
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.reopen_locked_term_for_mark_correction(
  target_term_id uuid,
  expected_updated_at timestamptz,
  correction_reason text
)
returns table (
  term_id uuid,
  term_status public.term_status,
  term_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_term public.terms%rowtype;
  normalized_reason text;
  changed public.terms%rowtype;
begin
  normalized_reason := internal.normalize_marks_workflow_reason(correction_reason);
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_LOCK');
  selected_term := internal.lock_term_marks_workflow_context(
    target_term_id, actor.school_id, expected_updated_at
  );
  if selected_term.status <> 'LOCKED' then
    raise exception 'TERM_MARKS_WORKFLOW_TRANSITION_INVALID' using errcode = '55000';
  end if;

  if exists (select 1 from public.report_batches batch where batch.term_id = selected_term.id)
     or exists (select 1 from public.reports report where report.term_id = selected_term.id)
     or exists (
       select 1 from public.report_snapshots snapshot
       join public.reports report on report.id = snapshot.report_id
       where report.term_id = selected_term.id
     )
     or exists (
       select 1 from public.report_subject_results result
       join public.reports report on report.id = result.report_id
       where report.term_id = selected_term.id
     )
     or exists (select 1 from public.promotion_decisions decision where decision.term_id = selected_term.id) then
    raise exception 'TERM_MARKS_CORRECTION_DOWNSTREAM_DEPENDENCY'
      using errcode = '55000';
  end if;

  perform set_config('app.term_marks_workflow_transition', 'allowed', true);
  update public.terms set status = 'REVIEW'
  where id = selected_term.id returning * into changed;
  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'TERM_MARKS_REOPENED_FOR_CORRECTION', 'term', changed.id,
    jsonb_build_object('status', selected_term.status),
    jsonb_build_object('status', changed.status, 'correction_reason', normalized_reason)
  );
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.create_mark_sheet_correction_revision(
  source_mark_sheet_id uuid,
  expected_source_updated_at timestamptz,
  correction_reason text
)
returns table (
  source_sheet_id uuid,
  correction_sheet_id uuid,
  correction_version integer,
  workflow_status public.mark_sheet_status,
  sheet_updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  source_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
  normalized_reason text;
  correction_sheet public.mark_sheets%rowtype;
begin
  normalized_reason := internal.normalize_marks_workflow_reason(correction_reason);
  select * into actor
  from internal.lock_and_require_marks_workflow_authority('MARKS_LOCK');
  source_sheet := internal.lock_mark_sheet_workflow_context(
    source_mark_sheet_id, actor.school_id, expected_source_updated_at
  );
  select * into selected_term from public.terms where id = source_sheet.term_id;

  if source_sheet.workflow_status <> 'LOCKED'
     or selected_term.status <> 'REVIEW' then
    raise exception 'MARK_SHEET_CORRECTION_SOURCE_INVALID' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.mark_sheets successor
    where successor.supersedes_mark_sheet_id = source_sheet.id
  ) then
    raise exception 'MARK_SHEET_CORRECTION_SUCCESSOR_EXISTS' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.mark_sheets working
    where working.term_id = source_sheet.term_id
      and working.class_section_id = source_sheet.class_section_id
      and working.subject_id = source_sheet.subject_id
      and working.workflow_status in (
        'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED', 'APPROVED'
      )
  ) then
    raise exception 'MARK_SHEET_CORRECTION_WORKING_REVISION_EXISTS'
      using errcode = '23505';
  end if;

  perform internal.lock_mark_sheet_cells(source_sheet.id);

  insert into public.mark_sheets (
    term_id, class_section_id, subject_id, assessment_scheme_id,
    teaching_assignment_id, workflow_status, version,
    supersedes_mark_sheet_id
  ) values (
    source_sheet.term_id, source_sheet.class_section_id, source_sheet.subject_id,
    source_sheet.assessment_scheme_id, source_sheet.teaching_assignment_id,
    'DRAFT', source_sheet.version + 1, source_sheet.id
  ) returning * into correction_sheet;

  insert into public.marks (
    mark_sheet_id, assessment_component_id, enrollment_id, score,
    attendance_status, teacher_remark, created_by, updated_by
  )
  select correction_sheet.id, source_mark.assessment_component_id,
    source_mark.enrollment_id, source_mark.score,
    source_mark.attendance_status, source_mark.teacher_remark,
    source_mark.created_by, source_mark.updated_by
  from public.marks source_mark
  where source_mark.mark_sheet_id = source_sheet.id
  order by source_mark.assessment_component_id, source_mark.enrollment_id;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_SHEET_CORRECTION_REVISION_CREATED', 'mark_sheet', correction_sheet.id,
    null,
    jsonb_build_object(
      'source_sheet_id', source_sheet.id,
      'new_sheet_id', correction_sheet.id,
      'source_version', source_sheet.version,
      'new_version', correction_sheet.version,
      'correction_reason', normalized_reason
    )
  );

  return query select source_sheet.id, correction_sheet.id,
    correction_sheet.version, correction_sheet.workflow_status,
    correction_sheet.updated_at;
end
$$;

create or replace function public.list_my_mark_sheets()
returns table (
  teaching_assignment_id uuid,
  mark_sheet_id uuid,
  academic_year_name text,
  term_name text,
  term_status public.term_status,
  grade_name text,
  class_name text,
  subject_name text,
  workflow_status public.mark_sheet_status,
  sheet_version integer,
  updated_at timestamptz,
  editable boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_marks_reader();
  if not reader.can_view_assigned and not reader.can_enter then
    raise exception 'MARK_ENTRY_ASSIGNED_VIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if not internal.membership_has_live_subject_teacher_role(reader.membership_id) then
    return;
  end if;

  return query
  select assignment.id, sheet.id, year.name, term.name, term.status,
    grade.name, section.name, subject.name, sheet.workflow_status,
    sheet.version, sheet.updated_at,
    (
      reader.can_enter and sheet.id is not null and (
        (sheet.workflow_status = 'DRAFT'
          and sheet.supersedes_mark_sheet_id is null
          and term.status = 'MARKS_ENTRY'
          and internal.membership_has_current_subject_assignment(
            reader.membership_id, assignment.id, assignment.term_id,
            assignment.class_section_id, assignment.subject_id
          ))
        or (sheet.workflow_status = 'RETURNED'
          and term.status = 'MARKS_ENTRY'
          and internal.membership_has_current_subject_assignment(
            reader.membership_id, assignment.id, assignment.term_id,
            assignment.class_section_id, assignment.subject_id
          ))
        or (sheet.workflow_status = 'RETURNED' and term.status = 'REVIEW')
        or (sheet.workflow_status = 'DRAFT'
          and sheet.supersedes_mark_sheet_id is not null
          and term.status = 'REVIEW')
      )
    )
  from public.teaching_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = assignment.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.subjects subject on subject.id = assignment.subject_id
  left join public.mark_sheets sheet
    on sheet.teaching_assignment_id = assignment.id
   and sheet.term_id = assignment.term_id
   and sheet.class_section_id = assignment.class_section_id
   and sheet.subject_id = assignment.subject_id
  where year.school_id = reader.school_id
    and assignment.staff_membership_id = reader.membership_id
    and (
      sheet.id is not null
      or internal.membership_has_current_subject_assignment(
        reader.membership_id, assignment.id, assignment.term_id,
        assignment.class_section_id, assignment.subject_id
      )
    )
  order by term.starts_on desc, grade.sort_order, section.name,
    subject.sort_order, sheet.version desc nulls last, assignment.id;
end
$$;

create or replace function public.get_mark_sheet(target_mark_sheet_id uuid)
returns table (
  mark_sheet_id uuid,
  teaching_assignment_id uuid,
  academic_year_name text,
  term_name text,
  term_status public.term_status,
  grade_name text,
  class_name text,
  subject_name text,
  assessment_scheme_name text,
  workflow_status public.mark_sheet_status,
  sheet_version integer,
  updated_at timestamptz,
  editable boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_marks_reader();
  if not internal.reader_can_access_mark_sheet(
    reader.membership_id, reader.school_id, reader.can_view_all,
    reader.can_view_assigned, target_mark_sheet_id
  ) then
    return;
  end if;
  return query
  select sheet.id, sheet.teaching_assignment_id, year.name, term.name,
    term.status, grade.name, section.name, subject.name, scheme.name,
    sheet.workflow_status, sheet.version, sheet.updated_at,
    (
      reader.can_enter and (
        (sheet.workflow_status = 'DRAFT'
          and sheet.supersedes_mark_sheet_id is null
          and term.status = 'MARKS_ENTRY'
          and internal.membership_has_current_subject_assignment(
            reader.membership_id, sheet.teaching_assignment_id, sheet.term_id,
            sheet.class_section_id, sheet.subject_id
          ))
        or (sheet.workflow_status = 'RETURNED'
          and term.status = 'MARKS_ENTRY'
          and internal.membership_has_current_subject_assignment(
            reader.membership_id, sheet.teaching_assignment_id, sheet.term_id,
            sheet.class_section_id, sheet.subject_id
          ))
        or (sheet.workflow_status = 'RETURNED' and term.status = 'REVIEW'
          and internal.membership_has_bound_subject_assignment(
            reader.membership_id, sheet.teaching_assignment_id, sheet.term_id,
            sheet.class_section_id, sheet.subject_id
          ))
        or (sheet.workflow_status = 'DRAFT'
          and sheet.supersedes_mark_sheet_id is not null
          and term.status = 'REVIEW'
          and internal.membership_has_bound_subject_assignment(
            reader.membership_id, sheet.teaching_assignment_id, sheet.term_id,
            sheet.class_section_id, sheet.subject_id
          ))
      )
    )
  from public.mark_sheets sheet
  join public.terms term on term.id = sheet.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = sheet.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.subjects subject on subject.id = sheet.subject_id
  join public.assessment_schemes scheme on scheme.id = sheet.assessment_scheme_id
  where sheet.id = target_mark_sheet_id;
end
$$;

create or replace function public.list_marks_review_queue(
  filter_academic_year_id uuid default null,
  filter_term_id uuid default null,
  filter_grade_level_id uuid default null,
  filter_class_section_id uuid default null,
  filter_subject_id uuid default null,
  filter_staff_membership_id uuid default null,
  filter_workflow_status public.mark_sheet_status default null,
  page_number integer default 1,
  page_size integer default 25
)
returns table (
  mark_sheet_id uuid,
  academic_year_id uuid,
  academic_year_name text,
  term_id uuid,
  term_name text,
  term_status public.term_status,
  grade_level_id uuid,
  grade_name text,
  class_section_id uuid,
  class_name text,
  subject_id uuid,
  subject_name text,
  staff_membership_id uuid,
  teacher_name text,
  employee_number text,
  workflow_status public.mark_sheet_status,
  sheet_version integer,
  submitted_at timestamptz,
  updated_at timestamptz,
  expected_required_cells bigint,
  recorded_required_cells bigint,
  missing_required_cells bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_marks_workflow_reader();
  if page_number < 1 or page_size < 1 or page_size > 100 then
    raise exception 'MARKS_WORKFLOW_PAGE_INVALID' using errcode = '22023';
  end if;
  return query
  select sheet.id, year.id, year.name, term.id, term.name, term.status,
    grade.id, grade.name, section.id, section.name, subject.id, subject.name,
    membership.id,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    membership.employee_number, sheet.workflow_status, sheet.version,
    sheet.submitted_at, sheet.updated_at,
    completion.expected_required_cells, completion.recorded_required_cells,
    completion.missing_required_cells, count(*) over()
  from public.mark_sheets sheet
  join public.terms term on term.id = sheet.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = sheet.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.subjects subject on subject.id = sheet.subject_id
  join public.teaching_assignments assignment on assignment.id = sheet.teaching_assignment_id
  join public.school_staff_memberships membership on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  cross join lateral internal.mark_sheet_completion(sheet.id) completion
  where year.school_id = reader.school_id
    and (filter_academic_year_id is null or year.id = filter_academic_year_id)
    and (filter_term_id is null or term.id = filter_term_id)
    and (filter_grade_level_id is null or grade.id = filter_grade_level_id)
    and (filter_class_section_id is null or section.id = filter_class_section_id)
    and (filter_subject_id is null or subject.id = filter_subject_id)
    and (filter_staff_membership_id is null or membership.id = filter_staff_membership_id)
    and (filter_workflow_status is null or sheet.workflow_status = filter_workflow_status)
    and not exists (
      select 1 from public.mark_sheets newer
      where newer.term_id = sheet.term_id
        and newer.class_section_id = sheet.class_section_id
        and newer.subject_id = sheet.subject_id
        and newer.version > sheet.version
    )
  order by sheet.updated_at desc, sheet.id
  limit page_size offset ((page_number - 1) * page_size);
end
$$;

create or replace function public.get_mark_sheet_workflow_detail(
  target_mark_sheet_id uuid
)
returns table (
  mark_sheet_id uuid,
  term_id uuid,
  term_status public.term_status,
  workflow_status public.mark_sheet_status,
  sheet_version integer,
  sheet_updated_at timestamptz,
  supersedes_mark_sheet_id uuid,
  return_reason text,
  submitted_by uuid,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  returned_at timestamptz,
  approved_at timestamptz,
  locked_at timestamptz,
  expected_required_cells bigint,
  recorded_required_cells bigint,
  missing_required_cells bigint,
  completion_percentage numeric,
  actor_is_submitter boolean,
  can_submit boolean,
  can_resubmit boolean,
  can_start_review boolean,
  can_return boolean,
  can_approve boolean,
  can_lock boolean,
  can_create_correction boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.current_marks_actor();
  if actor.membership_id is null then
    raise exception 'MARKS_WORKFLOW_VIEW_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select sheet.id, sheet.term_id, term.status, sheet.workflow_status,
    sheet.version, sheet.updated_at, sheet.supersedes_mark_sheet_id,
    sheet.return_reason, sheet.submitted_by, sheet.submitted_at,
    sheet.reviewed_at, sheet.returned_at, sheet.approved_at, sheet.locked_at,
    completion.expected_required_cells, completion.recorded_required_cells,
    completion.missing_required_cells, completion.completion_percentage,
    sheet.submitted_by = actor.membership_id,
    ('MARKS_SUBMIT' = any(actor.effective_permissions)
      and 'SUBJECT_TEACHER' = any(actor.effective_roles)
      and sheet.workflow_status = 'DRAFT'
      and completion.missing_required_cells = 0
      and internal.membership_has_bound_subject_assignment(
        actor.membership_id, sheet.teaching_assignment_id, sheet.term_id,
        sheet.class_section_id, sheet.subject_id
      )),
    ('MARKS_SUBMIT' = any(actor.effective_permissions)
      and 'SUBJECT_TEACHER' = any(actor.effective_roles)
      and sheet.workflow_status = 'RETURNED'
      and completion.missing_required_cells = 0
      and internal.membership_has_bound_subject_assignment(
        actor.membership_id, sheet.teaching_assignment_id, sheet.term_id,
        sheet.class_section_id, sheet.subject_id
      )),
    ('MARKS_REVIEW' = any(actor.effective_permissions)
      and sheet.workflow_status = 'SUBMITTED'
      and sheet.submitted_by is distinct from actor.membership_id
      and term.status in ('MARKS_ENTRY', 'REVIEW')),
    ('MARKS_REVIEW' = any(actor.effective_permissions)
      and sheet.workflow_status = 'UNDER_REVIEW'
      and sheet.submitted_by is distinct from actor.membership_id
      and term.status in ('MARKS_ENTRY', 'REVIEW')),
    ('MARKS_APPROVE' = any(actor.effective_permissions)
      and sheet.workflow_status = 'UNDER_REVIEW'
      and sheet.submitted_by is distinct from actor.membership_id
      and term.status in ('MARKS_ENTRY', 'REVIEW')
      and completion.missing_required_cells = 0),
    ('MARKS_LOCK' = any(actor.effective_permissions)
      and sheet.workflow_status = 'APPROVED'
      and sheet.submitted_by is distinct from actor.membership_id
      and term.status = 'REVIEW'),
    ('MARKS_LOCK' = any(actor.effective_permissions)
      and sheet.workflow_status = 'LOCKED'
      and term.status = 'REVIEW'
      and not exists (
        select 1 from public.mark_sheets successor
        where successor.supersedes_mark_sheet_id = sheet.id
      ))
  from public.mark_sheets sheet
  join public.terms term on term.id = sheet.term_id
  join public.academic_years year on year.id = term.academic_year_id
  cross join lateral internal.mark_sheet_completion(sheet.id) completion
  where sheet.id = target_mark_sheet_id
    and year.school_id = actor.school_id
    and (
      'MARKS_VIEW_ALL' = any(actor.effective_permissions)
      or actor.effective_permissions && array[
        'MARKS_REVIEW'::public.app_permission,
        'MARKS_APPROVE'::public.app_permission,
        'MARKS_LOCK'::public.app_permission
      ]
      or (actor.effective_permissions && array[
          'MARKS_VIEW_ASSIGNED'::public.app_permission,
          'MARKS_ENTER'::public.app_permission
        ] and internal.membership_has_bound_subject_assignment(
          actor.membership_id, sheet.teaching_assignment_id, sheet.term_id,
          sheet.class_section_id, sheet.subject_id
        ))
    );
end
$$;

create or replace function public.get_mark_sheet_workflow_history(
  target_mark_sheet_id uuid
)
returns table (
  audit_id uuid,
  workflow_action text,
  actor_display_name text,
  actor_role_context text,
  reason text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record;
begin
  select * into actor from internal.current_marks_actor();
  if actor.membership_id is null or not exists (
    select 1
    from public.mark_sheets sheet
    join public.terms term on term.id = sheet.term_id
    join public.academic_years year on year.id = term.academic_year_id
    where sheet.id = target_mark_sheet_id
      and year.school_id = actor.school_id
      and (
        'MARKS_VIEW_ALL' = any(actor.effective_permissions)
        or actor.effective_permissions && array[
          'MARKS_REVIEW'::public.app_permission,
          'MARKS_APPROVE'::public.app_permission,
          'MARKS_LOCK'::public.app_permission
        ]
        or (actor.effective_permissions && array[
            'MARKS_VIEW_ASSIGNED'::public.app_permission,
            'MARKS_ENTER'::public.app_permission
          ] and internal.membership_has_bound_subject_assignment(
            actor.membership_id, sheet.teaching_assignment_id, sheet.term_id,
            sheet.class_section_id, sheet.subject_id
          ))
      )
  ) then
    raise exception 'MARKS_WORKFLOW_VIEW_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select audit.id, audit.action,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    coalesce((
      select string_agg(role_assignment.role::text, ', ' order by role_assignment.role::text)
      from public.staff_role_assignments role_assignment
      where role_assignment.membership_id = audit.actor_membership_id
        and role_assignment.granted_at <= audit.created_at
        and (role_assignment.revoked_at is null or role_assignment.revoked_at >= audit.created_at)
    ), 'Staff'),
    coalesce(audit.new_values ->> 'return_reason',
      audit.new_values ->> 'correction_reason', audit.reason),
    audit.created_at
  from public.audit_logs audit
  left join public.profiles profile on profile.id = audit.actor_profile_id
  where audit.school_id = actor.school_id
    and audit.action in (
      'MARK_SHEET_SUBMITTED', 'MARK_SHEET_REVIEW_STARTED',
      'MARK_SHEET_RETURNED', 'MARK_SHEET_RESUBMITTED',
      'MARK_SHEET_APPROVED', 'MARK_SHEET_LOCKED',
      'MARK_SHEET_CORRECTION_REVISION_CREATED'
    )
    and (
      audit.entity_id = target_mark_sheet_id
      or audit.new_values ->> 'source_sheet_id' = target_mark_sheet_id::text
      or audit.new_values ->> 'new_sheet_id' = target_mark_sheet_id::text
    )
  order by audit.created_at, audit.id;
end
$$;

comment on column public.mark_sheets.supersedes_mark_sheet_id is
  'Immutable direct predecessor for an exceptional correction revision; historical locked rows are never reopened in place.';
comment on function internal.lock_and_require_marks_workflow_authority(public.app_permission) is
  'Locks and revalidates the current Auth-session selection, active membership/school, live grants and effective requested permission through a workflow mutation.';
comment on function internal.term_marks_workflow_readiness(uuid, uuid) is
  'Derives safe latest-revision readiness counts from active curriculum, participating learner scopes, assignments and mark sheets without returning learner or mark data.';
comment on function public.submit_mark_sheet(uuid, timestamptz) is
  'Submits a complete DRAFT sheet only for its exact live subject-teacher membership; correction drafts may submit during REVIEW.';
comment on function public.create_mark_sheet_correction_revision(uuid, timestamptz, text) is
  'Creates one DRAFT successor of a locked source, preserves academic identity and retired-scheme continuity, and clones marks without mutating history.';

revoke all on function internal.protect_mark_sheet_workflow_state()
  from public, anon, authenticated;
revoke all on function internal.protect_term_marks_workflow_state()
  from public, anon, authenticated;
revoke all on function internal.protect_frozen_mark_state()
  from public, anon, authenticated;
revoke all on function internal.lock_assignment_term_for_marks_workflow()
  from public, anon, authenticated;
revoke all on function internal.lock_enrollment_terms_for_marks_workflow()
  from public, anon, authenticated;
revoke all on function internal.raise_mark_sheet_workflow_conflict()
  from public, anon, authenticated;
revoke all on function internal.raise_term_marks_workflow_conflict()
  from public, anon, authenticated;
revoke all on function internal.lock_and_require_marks_workflow_authority(public.app_permission)
  from public, anon, authenticated;
revoke all on function internal.lock_and_require_marks_write_authority()
  from public, anon, authenticated;
revoke all on function internal.require_marks_entry_actor()
  from public, anon, authenticated;
revoke all on function internal.membership_has_bound_subject_assignment(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function internal.reader_can_access_mark_sheet(uuid, uuid, boolean, boolean, uuid)
  from public, anon, authenticated;
revoke all on function internal.assert_editable_mark_sheet(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function internal.normalize_marks_workflow_reason(text)
  from public, anon, authenticated;
revoke all on function internal.mark_sheet_completion(uuid)
  from public, anon, authenticated;
revoke all on function internal.lock_mark_sheet_workflow_context(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function internal.lock_mark_sheet_cells(uuid)
  from public, anon, authenticated;
revoke all on function internal.require_marks_workflow_reader()
  from public, anon, authenticated;
revoke all on function internal.term_marks_workflow_readiness(uuid, uuid)
  from public, anon, authenticated;
revoke all on function internal.lock_term_marks_workflow_context(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function internal.protect_mark_sheet_identity()
  from public, anon, authenticated;
revoke all on function internal.validate_mark_sheet_scope()
  from public, anon, authenticated;

revoke execute on function public.submit_mark_sheet(uuid, timestamptz)
  from public, anon;
revoke execute on function public.resubmit_returned_mark_sheet(uuid, timestamptz)
  from public, anon;
revoke execute on function public.start_mark_sheet_review(uuid, timestamptz)
  from public, anon;
revoke execute on function public.return_mark_sheet(uuid, timestamptz, text)
  from public, anon;
revoke execute on function public.approve_mark_sheet(uuid, timestamptz)
  from public, anon;
revoke execute on function public.lock_mark_sheet(uuid, timestamptz)
  from public, anon;
revoke execute on function public.open_term_marks_entry(uuid, timestamptz)
  from public, anon;
revoke execute on function public.advance_term_marks_to_review(uuid, timestamptz)
  from public, anon;
revoke execute on function public.lock_term_marks(uuid, timestamptz)
  from public, anon;
revoke execute on function public.reopen_locked_term_for_mark_correction(uuid, timestamptz, text)
  from public, anon;
revoke execute on function public.create_mark_sheet_correction_revision(uuid, timestamptz, text)
  from public, anon;
revoke execute on function public.get_term_marks_workflow_readiness(uuid)
  from public, anon;
revoke execute on function public.list_marks_workflow_terms()
  from public, anon;
revoke execute on function public.list_marks_review_queue(uuid, uuid, uuid, uuid, uuid, uuid, public.mark_sheet_status, integer, integer)
  from public, anon;
revoke execute on function public.get_mark_sheet_workflow_detail(uuid)
  from public, anon;
revoke execute on function public.get_mark_sheet_workflow_history(uuid)
  from public, anon;

grant execute on function public.submit_mark_sheet(uuid, timestamptz)
  to authenticated;
grant execute on function public.resubmit_returned_mark_sheet(uuid, timestamptz)
  to authenticated;
grant execute on function public.start_mark_sheet_review(uuid, timestamptz)
  to authenticated;
grant execute on function public.return_mark_sheet(uuid, timestamptz, text)
  to authenticated;
grant execute on function public.approve_mark_sheet(uuid, timestamptz)
  to authenticated;
grant execute on function public.lock_mark_sheet(uuid, timestamptz)
  to authenticated;
grant execute on function public.open_term_marks_entry(uuid, timestamptz)
  to authenticated;
grant execute on function public.advance_term_marks_to_review(uuid, timestamptz)
  to authenticated;
grant execute on function public.lock_term_marks(uuid, timestamptz)
  to authenticated;
grant execute on function public.reopen_locked_term_for_mark_correction(uuid, timestamptz, text)
  to authenticated;
grant execute on function public.create_mark_sheet_correction_revision(uuid, timestamptz, text)
  to authenticated;
grant execute on function public.get_term_marks_workflow_readiness(uuid)
  to authenticated;
grant execute on function public.list_marks_workflow_terms()
  to authenticated;
grant execute on function public.list_marks_review_queue(uuid, uuid, uuid, uuid, uuid, uuid, public.mark_sheet_status, integer, integer)
  to authenticated;
grant execute on function public.get_mark_sheet_workflow_detail(uuid)
  to authenticated;
grant execute on function public.get_mark_sheet_workflow_history(uuid)
  to authenticated;
