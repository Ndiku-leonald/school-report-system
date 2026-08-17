-- Stage 9: selected-membership marks entry and DRAFT mark sheets.
-- Entry is deliberately limited to MARKS_ENTRY terms and does not expose any
-- Stage 10 workflow transition or Stage 11 calculation.

alter table public.mark_sheets enable row level security;
alter table public.mark_sheets force row level security;
alter table public.marks enable row level security;
alter table public.marks force row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.mark_sheets from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.marks from public, anon, authenticated;

create index if not exists marks_sheet_component_enrollment_idx
  on public.marks (mark_sheet_id, assessment_component_id, enrollment_id);
create index if not exists enrollments_class_year_participation_idx
  on public.enrollments (class_section_id, academic_year_id, enrolled_on, exited_on);

create or replace function internal.raise_mark_entry_conflict()
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  raise exception 'MARK_ENTRY_CONFLICT' using errcode = 'PT409';
end
$$;

create or replace function internal.current_marks_actor()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select
    membership.profile_id,
    membership.id,
    membership.school_id,
    coalesce(
      array_agg(distinct role_assignment.role)
        filter (where role_assignment.role is not null),
      '{}'::public.staff_role[]
    ),
    coalesce(
      array_agg(distinct role_permission.permission)
        filter (where role_permission.permission is not null),
      '{}'::public.app_permission[]
    )
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id
   and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  left join public.staff_role_assignments role_assignment
    on role_assignment.membership_id = membership.id
   and role_assignment.granted_at <= now()
   and role_assignment.revoked_at is null
  left join public.role_permissions role_permission
    on role_permission.role = role_assignment.role
  where auth.uid() is not null
    and internal.current_auth_session_id() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE'
    and school.is_active
  group by membership.profile_id, membership.id, membership.school_id;
$$;

create or replace function internal.require_marks_entry_actor()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  effective_roles public.staff_role[],
  effective_permissions public.app_permission[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query
  select actor.*
  from internal.current_marks_actor() actor
  where 'MARKS_ENTER' = any(actor.effective_permissions);

  if not found then
    raise exception 'MARK_ENTRY_FORBIDDEN' using errcode = '42501';
  end if;
end
$$;

create or replace function internal.require_marks_reader()
returns table (
  profile_id uuid,
  membership_id uuid,
  school_id uuid,
  can_view_all boolean,
  can_view_assigned boolean,
  can_enter boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query
  select
    actor.profile_id,
    actor.membership_id,
    actor.school_id,
    'MARKS_VIEW_ALL' = any(actor.effective_permissions),
    'MARKS_VIEW_ASSIGNED' = any(actor.effective_permissions),
    'MARKS_ENTER' = any(actor.effective_permissions)
  from internal.current_marks_actor() actor
  where actor.effective_permissions && array[
    'MARKS_VIEW_ALL'::public.app_permission,
    'MARKS_VIEW_ASSIGNED'::public.app_permission,
    'MARKS_ENTER'::public.app_permission
  ];

  if not found then
    raise exception 'MARK_ENTRY_VIEW_FORBIDDEN' using errcode = '42501';
  end if;
end
$$;

create or replace function internal.membership_has_live_subject_teacher_role(
  target_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.staff_role_assignments role_assignment
    where role_assignment.membership_id = target_membership_id
      and role_assignment.role = 'SUBJECT_TEACHER'
      and role_assignment.granted_at <= now()
      and role_assignment.revoked_at is null
  );
$$;

create or replace function internal.membership_has_current_subject_assignment(
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
      join public.terms term on term.id = assignment.term_id
      where assignment.id = target_assignment_id
        and assignment.staff_membership_id = target_membership_id
        and assignment.term_id = target_term_id
        and assignment.class_section_id = target_class_section_id
        and assignment.subject_id = target_subject_id
        and assignment.is_active
        and current_date between assignment.starts_on
          and coalesce(assignment.ends_on, term.ends_on)
        and current_date between term.starts_on and term.ends_on
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
          and internal.membership_has_current_subject_assignment(
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
begin
  -- Read the immutable sheet identity first, then lock mutable authority rows in
  -- the same order used by draft initialization. Holding these locks through
  -- the mark write prevents an assignment end or term close from committing
  -- after validation but before the write.
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

  select * into selected_term
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
  if selected_sheet.workflow_status <> 'DRAFT' then
    raise exception 'MARK_ENTRY_SHEET_NOT_DRAFT' using errcode = '55000';
  end if;
  if selected_term.status <> 'MARKS_ENTRY'
     or current_date not between selected_term.starts_on and selected_term.ends_on then
    raise exception 'MARK_ENTRY_TERM_NOT_EDITABLE' using errcode = '55000';
  end if;
  if selected_assignment.id is null
     or selected_assignment.term_id is distinct from selected_sheet.term_id
     or selected_assignment.class_section_id is distinct from selected_sheet.class_section_id
     or selected_assignment.subject_id is distinct from selected_sheet.subject_id then
    raise exception 'MARK_ENTRY_ASSIGNMENT_NOT_CURRENT' using errcode = '42501';
  end if;
  if not internal.membership_has_current_subject_assignment(
    actor_membership_id,
    selected_sheet.teaching_assignment_id,
    selected_sheet.term_id,
    selected_sheet.class_section_id,
    selected_sheet.subject_id
  ) then
    raise exception 'MARK_ENTRY_ASSIGNMENT_NOT_CURRENT' using errcode = '42501';
  end if;

  return selected_sheet;
end
$$;

create or replace function internal.normalize_teacher_remark(value text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare normalized text := nullif(btrim(value), '');
begin
  if normalized is not null and length(normalized) > 500 then
    raise exception 'MARK_ENTRY_REMARK_TOO_LONG' using errcode = '22001';
  end if;
  if normalized is not null and normalized ~ '[[:cntrl:]]' then
    raise exception 'MARK_ENTRY_REMARK_CONTROL_CHARACTERS' using errcode = '22021';
  end if;
  return normalized;
end
$$;

create or replace function internal.validate_mark_scope_and_score()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sheet_scheme_id uuid;
  sheet_class_id uuid;
  sheet_term_id uuid;
  sheet_school_id uuid;
  component_scheme_id uuid;
  component_maximum numeric;
  enrollment_class_id uuid;
  enrollment_year_id uuid;
  enrollment_student_school_id uuid;
  term_year_id uuid;
  creator_school_id uuid;
  updater_school_id uuid;
begin
  select sheet.assessment_scheme_id, sheet.class_section_id, sheet.term_id,
         year.school_id, term.academic_year_id
    into sheet_scheme_id, sheet_class_id, sheet_term_id,
         sheet_school_id, term_year_id
  from public.mark_sheets sheet
  join public.terms term on term.id = sheet.term_id
  join public.academic_years year on year.id = term.academic_year_id
  where sheet.id = new.mark_sheet_id;

  select component.assessment_scheme_id, component.maximum_score
    into component_scheme_id, component_maximum
  from public.assessment_components component
  where component.id = new.assessment_component_id;

  select enrollment.class_section_id, enrollment.academic_year_id,
         student.school_id
    into enrollment_class_id, enrollment_year_id,
         enrollment_student_school_id
  from public.enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  where enrollment.id = new.enrollment_id;

  if new.created_by is not null then
    select school_id into creator_school_id
    from public.school_staff_memberships where id = new.created_by;
  end if;
  if new.updated_by is not null then
    select school_id into updater_school_id
    from public.school_staff_memberships where id = new.updated_by;
  end if;

  if component_scheme_id is distinct from sheet_scheme_id then
    raise exception 'MARK_ENTRY_COMPONENT_OUT_OF_SCOPE' using errcode = '23514';
  end if;
  if enrollment_class_id is distinct from sheet_class_id
     or enrollment_year_id is distinct from term_year_id
     or enrollment_student_school_id is distinct from sheet_school_id then
    raise exception 'MARK_ENTRY_ENROLLMENT_OUT_OF_SCOPE' using errcode = '23514';
  end if;
  if (new.created_by is not null and creator_school_id is distinct from sheet_school_id)
     or (new.updated_by is not null and updater_school_id is distinct from sheet_school_id) then
    raise exception 'MARK_ENTRY_ACTOR_OUT_OF_SCOPE' using errcode = '23514';
  end if;
  if new.score is not null and new.score > component_maximum then
    raise exception 'MARK_ENTRY_SCORE_ABOVE_MAXIMUM' using errcode = '23514';
  end if;

  new.teacher_remark := internal.normalize_teacher_remark(new.teacher_remark);
  return new;
end
$$;

create or replace function internal.protect_mark_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'MARK_ENTRY_DELETE_FORBIDDEN' using errcode = '55000';
  end if;
  if old.id is distinct from new.id
     or old.mark_sheet_id is distinct from new.mark_sheet_id
     or old.assessment_component_id is distinct from new.assessment_component_id
     or old.enrollment_id is distinct from new.enrollment_id
     or old.created_by is distinct from new.created_by
     or old.created_at is distinct from new.created_at then
    raise exception 'MARK_ENTRY_IDENTITY_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end
$$;

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
     or old.created_at is distinct from new.created_at then
    raise exception 'MARK_SHEET_IDENTITY_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists marks_protect_identity_stage9 on public.marks;
create trigger marks_protect_identity_stage9
before update or delete on public.marks
for each row execute function internal.protect_mark_identity();

drop trigger if exists zz_mark_sheets_protect_identity_stage9 on public.mark_sheets;
create trigger zz_mark_sheets_protect_identity_stage9
before update or delete on public.mark_sheets
for each row execute function internal.protect_mark_sheet_identity();

create or replace function internal.record_marks_audit(
  actor_profile_id uuid,
  actor_membership_id uuid,
  actor_school_id uuid,
  audit_action text,
  audit_entity_type text,
  audit_entity_id uuid,
  audit_old_values jsonb,
  audit_new_values jsonb
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  insert into public.audit_logs (
    school_id, actor_profile_id, actor_membership_id, action, entity_type,
    entity_id, old_values, new_values
  ) values (
    actor_school_id, actor_profile_id, actor_membership_id, audit_action,
    audit_entity_type, audit_entity_id, audit_old_values, audit_new_values
  );
$$;

create or replace function public.get_or_create_draft_mark_sheet(
  target_teaching_assignment_id uuid
)
returns table (
  mark_sheet_id uuid,
  workflow_status public.mark_sheet_status,
  sheet_version integer,
  sheet_updated_at timestamptz,
  created boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_assignment public.teaching_assignments%rowtype;
  selected_term public.terms%rowtype;
  selected_class public.class_sections%rowtype;
  assignment_school_id uuid;
  selected_scheme public.assessment_schemes%rowtype;
  selected_scheme_id uuid;
  scheme_count integer;
  component_count integer;
  weight_total numeric;
  existing_sheet public.mark_sheets%rowtype;
begin
  select * into actor from internal.require_marks_entry_actor();

  select assignment.* into selected_assignment
  from public.teaching_assignments assignment
  where assignment.id = target_teaching_assignment_id
  for update;
  if not found then
    raise exception 'MARK_ENTRY_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into selected_term
  from public.terms term
  where term.id = selected_assignment.term_id
  for update;
  select year.school_id into assignment_school_id
  from public.academic_years year
  where year.id = selected_term.academic_year_id;
  select * into selected_class from public.class_sections
  where id = selected_assignment.class_section_id;

  if assignment_school_id is distinct from actor.school_id then
    raise exception 'MARK_ENTRY_CROSS_SCHOOL' using errcode = '42501';
  end if;
  if selected_class.academic_year_id is distinct from selected_term.academic_year_id
     or not exists (
       select 1 from public.subjects subject
       where subject.id = selected_assignment.subject_id
         and subject.school_id = actor.school_id
         and subject.is_active
     )
     or not exists (
       select 1 from public.grade_level_subjects mapping
       where mapping.grade_level_id = selected_class.grade_level_id
         and mapping.subject_id = selected_assignment.subject_id
     ) then
    raise exception 'MARK_ENTRY_ASSIGNMENT_SCOPE_INVALID' using errcode = '23514';
  end if;
  if selected_term.status <> 'MARKS_ENTRY'
     or current_date not between selected_term.starts_on and selected_term.ends_on then
    raise exception 'MARK_ENTRY_TERM_NOT_EDITABLE' using errcode = '55000';
  end if;
  if not internal.membership_has_current_subject_assignment(
    actor.membership_id,
    selected_assignment.id,
    selected_assignment.term_id,
    selected_assignment.class_section_id,
    selected_assignment.subject_id
  ) then
    raise exception 'MARK_ENTRY_ASSIGNMENT_NOT_CURRENT' using errcode = '42501';
  end if;

  select sheet.* into existing_sheet
  from public.mark_sheets sheet
  where sheet.term_id = selected_assignment.term_id
    and sheet.class_section_id = selected_assignment.class_section_id
    and sheet.subject_id = selected_assignment.subject_id
    and sheet.workflow_status in (
      'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED', 'APPROVED'
    )
  for update;

  if found then
    if existing_sheet.teaching_assignment_id is distinct from selected_assignment.id then
      raise exception 'MARK_ENTRY_ASSIGNMENT_MISMATCH' using errcode = '42501';
    end if;
    if existing_sheet.workflow_status <> 'DRAFT' then
      raise exception 'MARK_ENTRY_SHEET_NOT_DRAFT' using errcode = '55000';
    end if;
    return query select existing_sheet.id, existing_sheet.workflow_status,
      existing_sheet.version, existing_sheet.updated_at, false;
    return;
  end if;

  -- Serialize the active-scheme choice with concurrent retirement/activation.
  perform scheme.id
  from public.assessment_schemes scheme
  where scheme.term_id = selected_assignment.term_id
    and scheme.grade_level_id = selected_class.grade_level_id
    and scheme.subject_id = selected_assignment.subject_id
  order by scheme.id
  for update;

  select count(*)
    into scheme_count
  from public.assessment_schemes scheme
  where scheme.term_id = selected_assignment.term_id
    and scheme.grade_level_id = selected_class.grade_level_id
    and scheme.subject_id = selected_assignment.subject_id
    and scheme.status = 'ACTIVE';
  if scheme_count <> 1 then
    raise exception 'MARK_ENTRY_ACTIVE_SCHEME_UNAVAILABLE' using errcode = '23514';
  end if;
  select scheme.id into selected_scheme_id
  from public.assessment_schemes scheme
  where scheme.term_id = selected_assignment.term_id
    and scheme.grade_level_id = selected_class.grade_level_id
    and scheme.subject_id = selected_assignment.subject_id
    and scheme.status = 'ACTIVE';
  select * into selected_scheme from public.assessment_schemes
  where id = selected_scheme_id;
  select count(*), coalesce(sum(component.weight_percentage), 0)
    into component_count, weight_total
  from public.assessment_components component
  where component.assessment_scheme_id = selected_scheme.id;
  if component_count = 0 or weight_total <> 100.00 then
    raise exception 'MARK_ENTRY_SCHEME_COMPONENTS_INVALID' using errcode = '23514';
  end if;

  insert into public.mark_sheets (
    term_id, class_section_id, subject_id, assessment_scheme_id,
    teaching_assignment_id, workflow_status, version
  ) values (
    selected_assignment.term_id, selected_assignment.class_section_id,
    selected_assignment.subject_id, selected_scheme.id,
    selected_assignment.id, 'DRAFT', 1
  ) returning * into existing_sheet;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_SHEET_DRAFT_CREATED', 'mark_sheet', existing_sheet.id,
    null,
    jsonb_build_object(
      'mark_sheet_id', existing_sheet.id,
      'teaching_assignment_id', existing_sheet.teaching_assignment_id,
      'assessment_scheme_id', existing_sheet.assessment_scheme_id,
      'version', existing_sheet.version
    )
  );

  return query select existing_sheet.id, existing_sheet.workflow_status,
    existing_sheet.version, existing_sheet.updated_at, true;
end
$$;

create or replace function internal.save_mark_entry_core(
  target_mark_sheet_id uuid,
  target_assessment_component_id uuid,
  target_enrollment_id uuid,
  expected_row_version integer,
  entered_score numeric,
  entered_attendance_status public.assessment_attendance_status,
  entered_teacher_remark text,
  actor_membership_id uuid
)
returns public.marks
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  existing_mark public.marks%rowtype;
  changed_mark public.marks%rowtype;
  normalized_remark text;
begin
  normalized_remark := internal.normalize_teacher_remark(entered_teacher_remark);
  if entered_attendance_status is null
     or (entered_attendance_status = 'PRESENT' and entered_score is null)
     or (entered_attendance_status <> 'PRESENT' and entered_score is not null)
     or entered_score is not null and entered_score < 0 then
    raise exception 'MARK_ENTRY_ATTENDANCE_SCORE_INVALID' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.mark_sheets sheet
    join public.assessment_components component
      on component.assessment_scheme_id = sheet.assessment_scheme_id
    where sheet.id = target_mark_sheet_id
      and component.id = target_assessment_component_id
  ) then
    raise exception 'MARK_ENTRY_COMPONENT_OUT_OF_SCOPE' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.mark_sheets sheet
    join public.terms term on term.id = sheet.term_id
    join public.enrollments enrollment
      on enrollment.class_section_id = sheet.class_section_id
     and enrollment.academic_year_id = term.academic_year_id
     and enrollment.enrolled_on <= term.ends_on
     and (enrollment.exited_on is null or enrollment.exited_on >= term.starts_on)
    join public.students student on student.id = enrollment.student_id
    join public.academic_years year on year.id = term.academic_year_id
    where sheet.id = target_mark_sheet_id
      and enrollment.id = target_enrollment_id
      and student.school_id = year.school_id
  ) then
    raise exception 'MARK_ENTRY_ENROLLMENT_OUT_OF_SCOPE' using errcode = '23514';
  end if;

  select mark.* into existing_mark
  from public.marks mark
  where mark.mark_sheet_id = target_mark_sheet_id
    and mark.assessment_component_id = target_assessment_component_id
    and mark.enrollment_id = target_enrollment_id
  for update;

  if found then
    if expected_row_version is null
       or expected_row_version is distinct from existing_mark.row_version then
      perform internal.raise_mark_entry_conflict();
    end if;
    update public.marks
    set score = entered_score,
        attendance_status = entered_attendance_status,
        teacher_remark = normalized_remark,
        updated_by = actor_membership_id
    where id = existing_mark.id
    returning * into changed_mark;
  else
    if expected_row_version is not null and expected_row_version <> 0 then
      perform internal.raise_mark_entry_conflict();
    end if;
    insert into public.marks (
      mark_sheet_id, assessment_component_id, enrollment_id, score,
      attendance_status, teacher_remark, created_by, updated_by
    ) values (
      target_mark_sheet_id, target_assessment_component_id,
      target_enrollment_id, entered_score, entered_attendance_status,
      normalized_remark, actor_membership_id, actor_membership_id
    ) returning * into changed_mark;
  end if;
  return changed_mark;
end
$$;

create or replace function public.save_mark_entry(
  target_mark_sheet_id uuid,
  target_assessment_component_id uuid,
  target_enrollment_id uuid,
  expected_row_version integer,
  entered_score numeric,
  entered_attendance_status public.assessment_attendance_status,
  entered_teacher_remark text
)
returns table (
  mark_id uuid,
  assessment_component_id uuid,
  enrollment_id uuid,
  score numeric,
  attendance_status public.assessment_attendance_status,
  teacher_remark text,
  row_version integer,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  old_mark public.marks%rowtype;
  changed_mark public.marks%rowtype;
begin
  select * into actor from internal.require_marks_entry_actor();
  perform internal.assert_editable_mark_sheet(
    target_mark_sheet_id, actor.membership_id, actor.school_id
  );
  select mark.* into old_mark from public.marks mark
  where mark.mark_sheet_id = target_mark_sheet_id
    and mark.assessment_component_id = target_assessment_component_id
    and mark.enrollment_id = target_enrollment_id;

  changed_mark := internal.save_mark_entry_core(
    target_mark_sheet_id, target_assessment_component_id,
    target_enrollment_id, expected_row_version, entered_score,
    entered_attendance_status, entered_teacher_remark, actor.membership_id
  );

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    case when old_mark.id is null then 'MARK_ENTRY_CREATED'
      else 'MARK_ENTRY_UPDATED' end,
    'mark', changed_mark.id,
    case when old_mark.id is null then null else jsonb_build_object(
      'row_version', old_mark.row_version,
      'attendance_status', old_mark.attendance_status
    ) end,
    jsonb_build_object(
      'mark_sheet_id', changed_mark.mark_sheet_id,
      'assessment_component_id', changed_mark.assessment_component_id,
      'enrollment_id', changed_mark.enrollment_id,
      'row_version', changed_mark.row_version,
      'attendance_status', changed_mark.attendance_status,
      'score_changed', old_mark.id is null or old_mark.score is distinct from changed_mark.score,
      'changed_fields', array_remove(array[
        case when old_mark.id is null or old_mark.score is distinct from changed_mark.score then 'score' end,
        case when old_mark.id is null or old_mark.attendance_status is distinct from changed_mark.attendance_status then 'attendance_status' end,
        case when old_mark.id is null or old_mark.teacher_remark is distinct from changed_mark.teacher_remark then 'teacher_remark' end
      ], null)
    )
  );

  return query select changed_mark.id, changed_mark.assessment_component_id,
    changed_mark.enrollment_id, changed_mark.score,
    changed_mark.attendance_status, changed_mark.teacher_remark,
    changed_mark.row_version, changed_mark.updated_at;
end
$$;

create or replace function public.save_mark_entries(
  target_mark_sheet_id uuid,
  entries jsonb
)
returns table (
  assessment_component_id uuid,
  enrollment_id uuid,
  row_version integer,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  actor record;
  selected_sheet public.mark_sheets%rowtype;
  entry jsonb;
  changed_mark public.marks%rowtype;
  result_rows jsonb := '[]'::jsonb;
  entry_count integer;
  duplicate_count integer;
  result_row jsonb;
begin
  select * into actor from internal.require_marks_entry_actor();
  selected_sheet := internal.assert_editable_mark_sheet(
    target_mark_sheet_id, actor.membership_id, actor.school_id
  );

  if jsonb_typeof(entries) <> 'array' then
    raise exception 'MARK_ENTRY_BATCH_INVALID' using errcode = '22023';
  end if;
  entry_count := jsonb_array_length(entries);
  if entry_count < 1 or entry_count > 500 then
    raise exception 'MARK_ENTRY_BATCH_SIZE_INVALID' using errcode = '22023';
  end if;
  select count(*) - count(distinct ((item ->> 'assessmentComponentId') || ':' || (item ->> 'enrollmentId')))
    into duplicate_count
  from jsonb_array_elements(entries) item;
  if duplicate_count > 0 then
    raise exception 'MARK_ENTRY_BATCH_DUPLICATE_CELL' using errcode = '23505';
  end if;

  -- Lock existing cells in a deterministic order before validating/writing.
  perform mark.id
  from public.marks mark
  join jsonb_array_elements(entries) item
    on mark.assessment_component_id = (item ->> 'assessmentComponentId')::uuid
   and mark.enrollment_id = (item ->> 'enrollmentId')::uuid
  where mark.mark_sheet_id = target_mark_sheet_id
  order by mark.assessment_component_id, mark.enrollment_id
  for update of mark;

  for entry in select value from jsonb_array_elements(entries)
  loop
    if not (entry ? 'assessmentComponentId')
       or not (entry ? 'enrollmentId')
       or not (entry ? 'attendanceStatus') then
      raise exception 'MARK_ENTRY_BATCH_INVALID' using errcode = '22023';
    end if;
    changed_mark := internal.save_mark_entry_core(
      target_mark_sheet_id,
      (entry ->> 'assessmentComponentId')::uuid,
      (entry ->> 'enrollmentId')::uuid,
      case when entry ? 'expectedRowVersion'
        and jsonb_typeof(entry -> 'expectedRowVersion') <> 'null'
        then (entry ->> 'expectedRowVersion')::integer else null end,
      case when entry ? 'score' and jsonb_typeof(entry -> 'score') <> 'null'
        then (entry ->> 'score')::numeric else null end,
      (entry ->> 'attendanceStatus')::public.assessment_attendance_status,
      entry ->> 'teacherRemark',
      actor.membership_id
    );
    result_rows := result_rows || jsonb_build_array(jsonb_build_object(
      'assessment_component_id', changed_mark.assessment_component_id,
      'enrollment_id', changed_mark.enrollment_id,
      'row_version', changed_mark.row_version,
      'updated_at', changed_mark.updated_at
    ));
  end loop;

  perform internal.record_marks_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'MARK_ENTRY_BATCH_SAVED', 'mark_sheet', selected_sheet.id, null,
    jsonb_build_object('mark_sheet_id', selected_sheet.id, 'entry_count', entry_count)
  );

  for result_row in select value from jsonb_array_elements(result_rows)
  loop
    return query select
      (result_row ->> 'assessment_component_id')::uuid,
      (result_row ->> 'enrollment_id')::uuid,
      (result_row ->> 'row_version')::integer,
      (result_row ->> 'updated_at')::timestamptz;
  end loop;
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
  return query
  select assignment.id, sheet.id, year.name, term.name, term.status,
    grade.name, section.name, subject.name, sheet.workflow_status,
    sheet.version, sheet.updated_at,
    (reader.can_enter and term.status = 'MARKS_ENTRY'
      and coalesce(sheet.workflow_status = 'DRAFT', true))
  from public.teaching_assignments assignment
  join public.terms term on term.id = assignment.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = assignment.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.subjects subject on subject.id = assignment.subject_id
  left join public.mark_sheets sheet
    on sheet.term_id = assignment.term_id
   and sheet.class_section_id = assignment.class_section_id
   and sheet.subject_id = assignment.subject_id
   and sheet.teaching_assignment_id = assignment.id
  where year.school_id = reader.school_id
    and assignment.staff_membership_id = reader.membership_id
    and internal.membership_has_current_subject_assignment(
      reader.membership_id, assignment.id, assignment.term_id,
      assignment.class_section_id, assignment.subject_id
    )
  order by term.starts_on desc, grade.sort_order, section.name, subject.sort_order;
end
$$;

create or replace function public.list_mark_sheets()
returns table (
  mark_sheet_id uuid,
  teacher_name text,
  employee_number text,
  academic_year_name text,
  term_name text,
  grade_name text,
  class_name text,
  subject_name text,
  assessment_scheme_name text,
  workflow_status public.mark_sheet_status,
  sheet_version integer,
  updated_at timestamptz,
  entered_cells bigint,
  expected_cells bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare reader record;
begin
  select * into reader from internal.require_marks_reader();
  return query
  select sheet.id,
    concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name),
    membership.employee_number, year.name, term.name, grade.name,
    section.name, subject.name, scheme.name, sheet.workflow_status,
    sheet.version, sheet.updated_at,
    (select count(*) from public.marks mark where mark.mark_sheet_id = sheet.id),
    (
      select count(*)
      from public.enrollments enrollment
      cross join public.assessment_components component
      where enrollment.class_section_id = sheet.class_section_id
        and enrollment.academic_year_id = term.academic_year_id
        and enrollment.enrolled_on <= term.ends_on
        and (enrollment.exited_on is null or enrollment.exited_on >= term.starts_on)
        and component.assessment_scheme_id = sheet.assessment_scheme_id
    )
  from public.mark_sheets sheet
  join public.terms term on term.id = sheet.term_id
  join public.academic_years year on year.id = term.academic_year_id
  join public.class_sections section on section.id = sheet.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  join public.subjects subject on subject.id = sheet.subject_id
  join public.assessment_schemes scheme on scheme.id = sheet.assessment_scheme_id
  join public.teaching_assignments assignment on assignment.id = sheet.teaching_assignment_id
  join public.school_staff_memberships membership on membership.id = assignment.staff_membership_id
  join public.profiles profile on profile.id = membership.profile_id
  where year.school_id = reader.school_id
    and (
      reader.can_view_all
      or reader.can_view_assigned and internal.membership_has_current_subject_assignment(
        reader.membership_id, sheet.teaching_assignment_id, sheet.term_id,
        sheet.class_section_id, sheet.subject_id
      )
    )
  order by sheet.updated_at desc, sheet.id;
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
    (reader.can_enter and sheet.workflow_status = 'DRAFT'
      and term.status = 'MARKS_ENTRY'
      and internal.membership_has_current_subject_assignment(
        reader.membership_id, sheet.teaching_assignment_id, sheet.term_id,
        sheet.class_section_id, sheet.subject_id
      ))
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

create or replace function public.get_mark_entry_grid(target_mark_sheet_id uuid)
returns table (
  mark_sheet_id uuid,
  components jsonb,
  roster jsonb,
  mark_entries jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  reader record;
  selected_sheet public.mark_sheets%rowtype;
  selected_term public.terms%rowtype;
begin
  select * into reader from internal.require_marks_reader();
  if not internal.reader_can_access_mark_sheet(
    reader.membership_id, reader.school_id, reader.can_view_all,
    reader.can_view_assigned, target_mark_sheet_id
  ) then
    return;
  end if;
  select * into selected_sheet from public.mark_sheets where id = target_mark_sheet_id;
  select * into selected_term from public.terms where id = selected_sheet.term_id;

  return query select selected_sheet.id,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'componentId', component.id,
        'componentCode', component.component_code,
        'name', component.name,
        'maximumScore', component.maximum_score,
        'weightPercentage', component.weight_percentage,
        'isRequired', component.is_required,
        'sortOrder', component.sort_order
      ) order by component.sort_order)
      from public.assessment_components component
      where component.assessment_scheme_id = selected_sheet.assessment_scheme_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollmentId', enrollment.id,
        'studentId', student.id,
        'admissionNumber', student.admission_number,
        'displayName', concat_ws(' ', student.first_name, student.middle_name, student.last_name),
        'classNumber', enrollment.class_number,
        'enrollmentStatus', enrollment.status
      ) order by coalesce(enrollment.class_number, ''), student.first_name,
        student.last_name, enrollment.id)
      from public.enrollments enrollment
      join public.students student on student.id = enrollment.student_id
      where enrollment.class_section_id = selected_sheet.class_section_id
        and enrollment.academic_year_id = selected_term.academic_year_id
        and enrollment.enrolled_on <= selected_term.ends_on
        and (enrollment.exited_on is null or enrollment.exited_on >= selected_term.starts_on)
        and student.school_id = reader.school_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'markId', mark.id,
        'componentId', mark.assessment_component_id,
        'enrollmentId', mark.enrollment_id,
        'score', mark.score,
        'attendanceStatus', mark.attendance_status,
        'teacherRemark', mark.teacher_remark,
        'rowVersion', mark.row_version,
        'updatedAt', mark.updated_at
      ) order by mark.enrollment_id, mark.assessment_component_id)
      from public.marks mark where mark.mark_sheet_id = selected_sheet.id
    ), '[]'::jsonb);
end
$$;

comment on function internal.current_marks_actor() is
  'Authoritative Stage 9 actor from the live selected Auth session membership only.';
comment on function public.get_or_create_draft_mark_sheet(uuid) is
  'Idempotently binds a version-1 DRAFT sheet to the exact current teaching assignment and active 100% scheme.';
comment on function public.get_mark_entry_grid(uuid) is
  'Returns only assessment components, eligible learner identity fields, and existing mark cells; no contacts.';

revoke all on function internal.raise_mark_entry_conflict() from public, anon, authenticated;
revoke all on function internal.current_marks_actor() from public, anon, authenticated;
revoke all on function internal.require_marks_entry_actor() from public, anon, authenticated;
revoke all on function internal.require_marks_reader() from public, anon, authenticated;
revoke all on function internal.membership_has_live_subject_teacher_role(uuid) from public, anon, authenticated;
revoke all on function internal.membership_has_current_subject_assignment(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function internal.reader_can_access_mark_sheet(uuid, uuid, boolean, boolean, uuid) from public, anon, authenticated;
revoke all on function internal.assert_editable_mark_sheet(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function internal.normalize_teacher_remark(text) from public, anon, authenticated;
revoke all on function internal.validate_mark_scope_and_score() from public, anon, authenticated;
revoke all on function internal.protect_mark_identity() from public, anon, authenticated;
revoke all on function internal.protect_mark_sheet_identity() from public, anon, authenticated;
revoke all on function internal.record_marks_audit(uuid, uuid, uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function internal.save_mark_entry_core(uuid, uuid, uuid, integer, numeric, public.assessment_attendance_status, text, uuid) from public, anon, authenticated;

revoke execute on function public.get_or_create_draft_mark_sheet(uuid) from public, anon;
revoke execute on function public.save_mark_entry(uuid, uuid, uuid, integer, numeric, public.assessment_attendance_status, text) from public, anon;
revoke execute on function public.save_mark_entries(uuid, jsonb) from public, anon;
revoke execute on function public.list_my_mark_sheets() from public, anon;
revoke execute on function public.list_mark_sheets() from public, anon;
revoke execute on function public.get_mark_sheet(uuid) from public, anon;
revoke execute on function public.get_mark_entry_grid(uuid) from public, anon;

grant execute on function public.get_or_create_draft_mark_sheet(uuid) to authenticated;
grant execute on function public.save_mark_entry(uuid, uuid, uuid, integer, numeric, public.assessment_attendance_status, text) to authenticated;
grant execute on function public.save_mark_entries(uuid, jsonb) to authenticated;
grant execute on function public.list_my_mark_sheets() to authenticated;
grant execute on function public.list_mark_sheets() to authenticated;
grant execute on function public.get_mark_sheet(uuid) to authenticated;
grant execute on function public.get_mark_entry_grid(uuid) to authenticated;
