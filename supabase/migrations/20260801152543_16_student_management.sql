-- Stage 7: secure student, guardian, enrolment and private-photo management.
-- All browser table mutations remain denied. Narrow RPCs derive both school
-- and actor from the JWT-session-selected membership and audit success in the
-- same transaction as the protected mutation.

update public.students
set admission_number = upper(btrim(admission_number)),
    first_name = btrim(first_name),
    middle_name = nullif(btrim(middle_name), ''),
    last_name = btrim(last_name),
    gender = nullif(btrim(gender), '');

update public.guardians
set first_name = btrim(first_name),
    middle_name = nullif(btrim(middle_name), ''),
    last_name = btrim(last_name),
    phone = nullif(btrim(phone), ''),
    email = nullif(lower(btrim(email)), '');

update public.enrollments
set class_number = nullif(btrim(class_number), '');

create unique index student_school_admission_normalized_idx
  on public.students (school_id, lower(btrim(admission_number)));

create unique index enrollment_current_class_number_idx
  on public.enrollments (class_section_id, lower(btrim(class_number)))
  where status in ('ACTIVE', 'REPEATING') and class_number is not null;

create index students_school_name_search_idx
  on public.students (school_id, lower(last_name), lower(first_name), id);

create index guardians_school_email_idx
  on public.guardians (school_id, lower(email)) where email is not null;

create index enrollments_student_year_status_idx
  on public.enrollments (student_id, academic_year_id, status, enrolled_on);

create or replace function internal.normalize_student_record()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.admission_number = upper(btrim(new.admission_number));
  new.first_name = btrim(new.first_name);
  new.middle_name = nullif(btrim(new.middle_name), '');
  new.last_name = btrim(new.last_name);
  new.gender = nullif(btrim(new.gender), '');
  if new.admission_number = '' or new.first_name = '' or new.last_name = '' then
    raise exception 'STUDENT_NAME_OR_ADMISSION_INVALID' using errcode = '22023';
  end if;
  return new;
end
$$;

create or replace function internal.normalize_guardian_record()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.first_name = btrim(new.first_name);
  new.middle_name = nullif(btrim(new.middle_name), '');
  new.last_name = btrim(new.last_name);
  new.phone = nullif(btrim(new.phone), '');
  new.email = nullif(lower(btrim(new.email)), '');
  if new.first_name = '' or new.last_name = '' then
    raise exception 'GUARDIAN_NAME_INVALID' using errcode = '22023';
  end if;
  if new.email is not null and new.email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$' then
    raise exception 'GUARDIAN_EMAIL_INVALID' using errcode = '22023';
  end if;
  if new.phone is not null and new.phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'GUARDIAN_PHONE_INVALID' using errcode = '22023';
  end if;
  return new;
end
$$;

create or replace function internal.normalize_enrollment_record()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.class_number = nullif(btrim(new.class_number), '');
  if new.status in ('ACTIVE', 'REPEATING') and new.exited_on is not null then
    raise exception 'ENROLLMENT_EXIT_INVALID' using errcode = '23514';
  end if;
  if new.status in ('TRANSFERRED', 'WITHDRAWN', 'COMPLETED') and new.exited_on is null then
    raise exception 'ENROLLMENT_EXIT_REQUIRED' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger students_normalize_stage7
before insert or update on public.students
for each row execute function internal.normalize_student_record();

create trigger guardians_normalize_stage7
before insert or update on public.guardians
for each row execute function internal.normalize_guardian_record();

create trigger enrollments_normalize_stage7
before insert or update on public.enrollments
for each row execute function internal.normalize_enrollment_record();

create or replace function internal.prevent_historical_record_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'HISTORICAL_RECORD_DELETE_FORBIDDEN' using errcode = '55000';
end
$$;

create trigger students_prevent_delete_stage7
before delete on public.students
for each row execute function internal.prevent_historical_record_delete();

create trigger guardians_prevent_delete_stage7
before delete on public.guardians
for each row execute function internal.prevent_historical_record_delete();

create trigger enrollments_prevent_delete_stage7
before delete on public.enrollments
for each row execute function internal.prevent_historical_record_delete();

create or replace function internal.current_student_manager()
returns table (profile_id uuid, membership_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
  select membership.profile_id, membership.id, membership.school_id
  from internal.staff_session_active_memberships selection
  join public.school_staff_memberships membership
    on membership.id = selection.membership_id
   and membership.profile_id = selection.profile_id
  join public.schools school on school.id = membership.school_id
  where auth.uid() is not null
    and internal.current_auth_session_id() is not null
    and selection.session_id = internal.current_auth_session_id()
    and selection.profile_id = auth.uid()
    and membership.status = 'ACTIVE'
    and school.is_active
    and internal.current_user_has_permission(membership.school_id, 'STUDENTS_MANAGE');
$$;

create or replace function internal.require_student_manager()
returns table (profile_id uuid, membership_id uuid, school_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
begin
  return query select actor.profile_id, actor.membership_id, actor.school_id
  from internal.current_student_manager() actor;
  if not found then
    raise exception 'STUDENT_MANAGEMENT_FORBIDDEN' using errcode = '42501';
  end if;
end
$$;

create or replace function internal.student_manager_can_override_capacity(actor_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.staff_role_assignments assignment
    where assignment.membership_id = actor_membership_id
      and assignment.revoked_at is null
      and assignment.role in ('SCHOOL_ADMIN', 'SUPER_ADMIN')
  );
$$;

create or replace function internal.raise_student_conflict()
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  raise exception 'STUDENT_MANAGEMENT_CONFLICT' using errcode = 'PT409';
end
$$;

create or replace function internal.record_student_audit(
  actor_profile_id uuid,
  actor_membership_id uuid,
  actor_school_id uuid,
  audit_action text,
  audit_entity_type text,
  audit_entity_id uuid,
  audit_old_values jsonb,
  audit_new_values jsonb,
  audit_reason text default null
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  insert into public.audit_logs (
    school_id, actor_profile_id, actor_membership_id, action, entity_type,
    entity_id, old_values, new_values, reason
  ) values (
    actor_school_id, actor_profile_id, actor_membership_id, audit_action,
    audit_entity_type, audit_entity_id, audit_old_values, audit_new_values,
    nullif(btrim(audit_reason), '')
  );
$$;

create or replace function internal.assert_enrollment_destination(
  actor_school_id uuid,
  target_academic_year_id uuid,
  target_class_section_id uuid,
  enrolled_on date
)
returns public.class_sections
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare destination public.class_sections%rowtype; target_year public.academic_years%rowtype;
begin
  select * into target_year from public.academic_years
  where id = target_academic_year_id and school_id = actor_school_id;
  if not found or target_year.status not in ('DRAFT', 'ACTIVE') then
    raise exception 'ENROLLMENT_YEAR_UNAVAILABLE' using errcode = '23514';
  end if;
  if enrolled_on < target_year.starts_on or enrolled_on > target_year.ends_on then
    raise exception 'ENROLLMENT_DATE_OUTSIDE_YEAR' using errcode = '23514';
  end if;
  select section.* into destination
  from public.class_sections section
  where section.id = target_class_section_id
    and section.academic_year_id = target_academic_year_id
    and section.is_active;
  if not found then
    raise exception 'ENROLLMENT_CLASS_UNAVAILABLE' using errcode = '23514';
  end if;
  return destination;
end
$$;

create or replace function internal.assert_class_capacity(
  actor_membership_id uuid,
  target_class_section_id uuid,
  capacity_override boolean,
  override_reason text,
  excluded_enrollment_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, internal
as $$
declare class_capacity integer; current_count integer;
begin
  select capacity into class_capacity from public.class_sections
  where id = target_class_section_id;
  if class_capacity is null then return false; end if;
  select count(*) into current_count from public.enrollments
  where class_section_id = target_class_section_id
    and status in ('ACTIVE', 'REPEATING')
    and (excluded_enrollment_id is null or id <> excluded_enrollment_id);
  if current_count < class_capacity then return false; end if;
  if not capacity_override then
    raise exception 'CLASS_CAPACITY_REACHED' using errcode = '23514';
  end if;
  if nullif(btrim(override_reason), '') is null then
    raise exception 'CLASS_CAPACITY_OVERRIDE_REASON_REQUIRED' using errcode = '22023';
  end if;
  if not internal.student_manager_can_override_capacity(actor_membership_id) then
    raise exception 'CLASS_CAPACITY_OVERRIDE_FORBIDDEN' using errcode = '42501';
  end if;
  return true;
end
$$;

create or replace function public.admit_student(
  admission_number text,
  first_name text,
  middle_name text,
  last_name text,
  gender text,
  date_of_birth date,
  admission_date date,
  initial_academic_year_id uuid default null,
  initial_class_section_id uuid default null,
  class_number text default null,
  enrollment_status public.enrollment_status default 'ACTIVE',
  capacity_override boolean default false,
  capacity_override_reason text default null,
  first_guardian jsonb default null
)
returns table (student_id uuid, student_status public.student_status, enrollment_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; created public.students%rowtype; created_enrollment public.enrollments%rowtype;
  destination public.class_sections%rowtype; override_used boolean; created_guardian public.guardians%rowtype;
  created_link public.student_guardians%rowtype;
begin
  select * into actor from internal.require_student_manager();
  if admission_date is null or (date_of_birth is not null and admission_date < date_of_birth) then
    raise exception 'STUDENT_LIFECYCLE_DATES_INVALID' using errcode = '23514';
  end if;
  if (initial_academic_year_id is null) <> (initial_class_section_id is null) then
    raise exception 'INITIAL_ENROLLMENT_INCOMPLETE' using errcode = '22023';
  end if;
  if enrollment_status not in ('ACTIVE', 'REPEATING') then
    raise exception 'INITIAL_ENROLLMENT_STATUS_INVALID' using errcode = '22023';
  end if;

  insert into public.students (
    school_id, admission_number, first_name, middle_name, last_name, gender,
    date_of_birth, admission_date, status
  ) values (
    actor.school_id, admission_number, first_name, middle_name, last_name,
    gender, date_of_birth, admission_date, 'ACTIVE'
  ) returning * into created;

  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_CREATED', 'student', created.id, null,
    jsonb_build_object('admission_number', created.admission_number, 'first_name', created.first_name,
      'middle_name', created.middle_name, 'last_name', created.last_name, 'gender', created.gender,
      'date_of_birth', created.date_of_birth, 'admission_date', created.admission_date, 'status', created.status)
  );

  if initial_academic_year_id is not null then
    destination := internal.assert_enrollment_destination(actor.school_id, initial_academic_year_id, initial_class_section_id, admission_date);
    override_used := internal.assert_class_capacity(actor.membership_id, destination.id, capacity_override, capacity_override_reason);
    insert into public.enrollments (
      student_id, academic_year_id, class_section_id, class_number, status, enrolled_on
    ) values (
      created.id, initial_academic_year_id, initial_class_section_id, class_number,
      enrollment_status, admission_date
    ) returning * into created_enrollment;
    perform internal.record_student_audit(
      actor.profile_id, actor.membership_id, actor.school_id,
      'ENROLLMENT_CREATED', 'enrollment', created_enrollment.id, null,
      jsonb_build_object('student_id', created.id, 'academic_year_id', initial_academic_year_id,
        'class_section_id', initial_class_section_id, 'class_number', created_enrollment.class_number,
        'status', created_enrollment.status, 'enrolled_on', created_enrollment.enrolled_on,
        'capacity_override', override_used),
      case when override_used then capacity_override_reason else null end
    );
  end if;

  if first_guardian is not null then
    if jsonb_typeof(first_guardian) <> 'object' then
      raise exception 'GUARDIAN_INPUT_INVALID' using errcode = '22023';
    end if;
    insert into public.guardians (school_id, first_name, middle_name, last_name, phone, email)
    values (actor.school_id, first_guardian->>'first_name', first_guardian->>'middle_name',
      first_guardian->>'last_name', first_guardian->>'phone', first_guardian->>'email')
    returning * into created_guardian;
    insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_access_reports)
    values (created.id, created_guardian.id, coalesce(nullif(btrim(first_guardian->>'relationship'), ''), 'Guardian'),
      coalesce((first_guardian->>'is_primary')::boolean, true),
      coalesce((first_guardian->>'can_access_reports')::boolean, false))
    returning * into created_link;
    perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
      'GUARDIAN_CREATED', 'guardian', created_guardian.id, null,
      jsonb_build_object('is_active', created_guardian.is_active,
        'has_phone', created_guardian.phone is not null,
        'has_email', created_guardian.email is not null));
    perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
      'STUDENT_GUARDIAN_LINKED', 'student_guardian', created_link.id, null,
      jsonb_build_object('student_id', created.id, 'guardian_id', created_guardian.id,
        'relationship', created_link.relationship, 'is_primary', created_link.is_primary,
        'can_access_reports', created_link.can_access_reports));
  end if;

  return query select created.id, created.status, created_enrollment.id, created.updated_at;
end
$$;

create or replace function public.update_student_profile(
  target_student_id uuid,
  expected_updated_at timestamptz,
  admission_number text,
  first_name text,
  middle_name text,
  last_name text,
  gender text,
  date_of_birth date,
  admission_date date
)
returns table (student_id uuid, student_status public.student_status, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.students%rowtype; changed public.students%rowtype;
begin
  select * into actor from internal.require_student_manager();
  select * into existing from public.students
  where id = target_student_id and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if admission_date is null or (date_of_birth is not null and admission_date < date_of_birth) then
    raise exception 'STUDENT_LIFECYCLE_DATES_INVALID' using errcode = '23514';
  end if;
  update public.students set admission_number = update_student_profile.admission_number,
    first_name = update_student_profile.first_name, middle_name = update_student_profile.middle_name,
    last_name = update_student_profile.last_name, gender = update_student_profile.gender,
    date_of_birth = update_student_profile.date_of_birth, admission_date = update_student_profile.admission_date
  where id = existing.id returning * into changed;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_PROFILE_UPDATED', 'student', changed.id,
    to_jsonb(existing) - array['school_id','photo_storage_path','created_at','updated_at','status']::text[],
    to_jsonb(changed) - array['school_id','photo_storage_path','created_at','updated_at','status']::text[]);
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.change_student_status(
  target_student_id uuid,
  expected_updated_at timestamptz,
  target_status public.student_status,
  effective_date date,
  reason text
)
returns table (student_id uuid, student_status public.student_status, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.students%rowtype; changed public.students%rowtype;
  current_enrollment public.enrollments%rowtype; changed_enrollment public.enrollments%rowtype;
  mapped_status public.enrollment_status;
begin
  select * into actor from internal.require_student_manager();
  select * into existing from public.students where id = target_student_id
    and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if existing.status = target_status then raise exception 'STUDENT_STATUS_NOOP' using errcode = '22023'; end if;
  if not ((existing.status = 'ACTIVE' and target_status in ('TRANSFERRED','WITHDRAWN','COMPLETED','DECEASED','INACTIVE'))
      or (existing.status = 'INACTIVE' and target_status in ('ACTIVE','TRANSFERRED','WITHDRAWN'))) then
    raise exception 'STUDENT_STATUS_TRANSITION_INVALID' using errcode = '23514';
  end if;
  if effective_date is null or nullif(btrim(reason), '') is null then
    raise exception 'STUDENT_STATUS_REASON_AND_DATE_REQUIRED' using errcode = '22023';
  end if;
  select enrollment.* into current_enrollment from public.enrollments enrollment
  where enrollment.student_id = existing.id and enrollment.status in ('ACTIVE','REPEATING')
  order by enrollment.enrolled_on desc, enrollment.id for update limit 1;
  if found and target_status <> 'ACTIVE' then
    if effective_date < current_enrollment.enrolled_on then
      raise exception 'ENROLLMENT_EXIT_BEFORE_START' using errcode = '23514';
    end if;
    mapped_status := case target_status
      when 'TRANSFERRED' then 'TRANSFERRED'::public.enrollment_status
      when 'COMPLETED' then 'COMPLETED'::public.enrollment_status
      else 'WITHDRAWN'::public.enrollment_status end;
    update public.enrollments set status = mapped_status, exited_on = effective_date
    where id = current_enrollment.id returning * into changed_enrollment;
    perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
      'ENROLLMENT_STATUS_CHANGED', 'enrollment', changed_enrollment.id,
      jsonb_build_object('status', current_enrollment.status, 'exited_on', current_enrollment.exited_on),
      jsonb_build_object('status', changed_enrollment.status, 'exited_on', changed_enrollment.exited_on), reason);
  end if;
  update public.students set status = target_status where id = existing.id returning * into changed;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_STATUS_CHANGED', 'student', changed.id,
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', changed.status, 'effective_date', effective_date), reason);
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.create_student_enrollment(
  target_student_id uuid,
  target_academic_year_id uuid,
  target_class_section_id uuid,
  class_number text,
  enrollment_status public.enrollment_status,
  enrolled_on date,
  capacity_override boolean default false,
  capacity_override_reason text default null
)
returns table (enrollment_id uuid, status public.enrollment_status, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; student public.students%rowtype; destination public.class_sections%rowtype;
  created public.enrollments%rowtype; override_used boolean;
begin
  select * into actor from internal.require_student_manager();
  select * into student from public.students where id = target_student_id and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if student.status not in ('ACTIVE','INACTIVE') then raise exception 'STUDENT_STATUS_NOT_ENROLLABLE' using errcode = '23514'; end if;
  if enrollment_status not in ('ACTIVE','REPEATING') then raise exception 'ENROLLMENT_STATUS_INVALID' using errcode = '22023'; end if;
  destination := internal.assert_enrollment_destination(actor.school_id, target_academic_year_id, target_class_section_id, enrolled_on);
  override_used := internal.assert_class_capacity(actor.membership_id, destination.id, capacity_override, capacity_override_reason);
  insert into public.enrollments (student_id, academic_year_id, class_section_id, class_number, status, enrolled_on)
  values (student.id, target_academic_year_id, target_class_section_id, class_number, enrollment_status, enrolled_on)
  returning * into created;
  if student.status = 'INACTIVE' then update public.students set status = 'ACTIVE' where id = student.id; end if;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ENROLLMENT_CREATED', 'enrollment', created.id, null,
    jsonb_build_object('student_id', created.student_id, 'academic_year_id', created.academic_year_id,
      'class_section_id', created.class_section_id, 'class_number', created.class_number,
      'status', created.status, 'enrolled_on', created.enrolled_on, 'capacity_override', override_used),
    case when override_used then capacity_override_reason else null end);
  return query select created.id, created.status, created.updated_at;
end
$$;

create or replace function public.update_student_enrollment(
  target_enrollment_id uuid,
  expected_updated_at timestamptz,
  class_number text,
  enrolled_on date
)
returns table (enrollment_id uuid, status public.enrollment_status, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.enrollments%rowtype; changed public.enrollments%rowtype;
  target_year public.academic_years%rowtype;
begin
  select * into actor from internal.require_student_manager();
  select enrollment.* into existing from public.enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  where enrollment.id = target_enrollment_id and student.school_id = actor.school_id for update of enrollment;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if existing.status not in ('ACTIVE','REPEATING') then raise exception 'ENROLLMENT_TERMINAL' using errcode = '23514'; end if;
  select * into target_year from public.academic_years where id = existing.academic_year_id;
  if enrolled_on < target_year.starts_on or enrolled_on > target_year.ends_on then
    raise exception 'ENROLLMENT_DATE_OUTSIDE_YEAR' using errcode = '23514';
  end if;
  update public.enrollments set class_number = update_student_enrollment.class_number,
    enrolled_on = update_student_enrollment.enrolled_on
  where id = existing.id returning * into changed;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ENROLLMENT_UPDATED', 'enrollment', changed.id,
    jsonb_build_object('class_number', existing.class_number, 'enrolled_on', existing.enrolled_on),
    jsonb_build_object('class_number', changed.class_number, 'enrolled_on', changed.enrolled_on));
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.move_student_class(
  target_enrollment_id uuid,
  expected_updated_at timestamptz,
  target_class_section_id uuid,
  class_number text,
  capacity_override boolean default false,
  capacity_override_reason text default null
)
returns table (enrollment_id uuid, status public.enrollment_status, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.enrollments%rowtype; changed public.enrollments%rowtype;
  destination public.class_sections%rowtype; override_used boolean;
begin
  select * into actor from internal.require_student_manager();
  select enrollment.* into existing from public.enrollments enrollment join public.students student on student.id = enrollment.student_id
  where enrollment.id = target_enrollment_id and student.school_id = actor.school_id for update of enrollment;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if existing.status not in ('ACTIVE','REPEATING') then raise exception 'ENROLLMENT_TERMINAL' using errcode = '23514'; end if;
  if existing.class_section_id = target_class_section_id then raise exception 'CLASS_MOVE_NOOP' using errcode = '22023'; end if;
  destination := internal.assert_enrollment_destination(actor.school_id, existing.academic_year_id, target_class_section_id, existing.enrolled_on);
  if exists (select 1 from public.marks mark where mark.enrollment_id = existing.id)
    or exists (select 1 from public.term_attendance attendance where attendance.enrollment_id = existing.id)
    or exists (select 1 from public.student_term_comments comment_record where comment_record.enrollment_id = existing.id)
    or exists (select 1 from public.reports report where report.enrollment_id = existing.id)
    or exists (select 1 from public.promotion_decisions decision where decision.enrollment_id = existing.id) then
    raise exception 'ENROLLMENT_HAS_ACADEMIC_DEPENDENCIES' using errcode = '55006';
  end if;
  override_used := internal.assert_class_capacity(actor.membership_id, destination.id, capacity_override, capacity_override_reason, existing.id);
  update public.enrollments set class_section_id = destination.id, class_number = move_student_class.class_number
  where id = existing.id returning * into changed;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ENROLLMENT_CLASS_MOVED', 'enrollment', changed.id,
    jsonb_build_object('class_section_id', existing.class_section_id, 'class_number', existing.class_number),
    jsonb_build_object('class_section_id', changed.class_section_id, 'class_number', changed.class_number,
      'capacity_override', override_used), case when override_used then capacity_override_reason else null end);
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.change_enrollment_status(
  target_enrollment_id uuid,
  expected_updated_at timestamptz,
  target_status public.enrollment_status,
  exited_on date,
  reason text
)
returns table (enrollment_id uuid, status public.enrollment_status, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.enrollments%rowtype; changed public.enrollments%rowtype; student public.students%rowtype;
begin
  select * into actor from internal.require_student_manager();
  select enrollment.* into existing from public.enrollments enrollment join public.students s on s.id = enrollment.student_id
  where enrollment.id = target_enrollment_id and s.school_id = actor.school_id for update of enrollment;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if existing.status = target_status then raise exception 'ENROLLMENT_STATUS_NOOP' using errcode = '22023'; end if;
  if existing.status not in ('ACTIVE','REPEATING') or target_status not in ('ACTIVE','REPEATING','TRANSFERRED','WITHDRAWN','COMPLETED') then
    raise exception 'ENROLLMENT_STATUS_TRANSITION_INVALID' using errcode = '23514';
  end if;
  if target_status in ('ACTIVE','REPEATING') then
    if exited_on is not null then raise exception 'ENROLLMENT_EXIT_INVALID' using errcode = '23514'; end if;
  else
    if exited_on is null or exited_on < existing.enrolled_on or nullif(btrim(reason), '') is null then
      raise exception 'ENROLLMENT_EXIT_AND_REASON_REQUIRED' using errcode = '22023';
    end if;
  end if;
  update public.enrollments set status = target_status,
    exited_on = case when target_status in ('ACTIVE','REPEATING') then null else change_enrollment_status.exited_on end
  where id = existing.id returning * into changed;
  if target_status in ('TRANSFERRED','WITHDRAWN','COMPLETED') then
    select * into student from public.students where id = changed.student_id for update;
    update public.students set status = target_status::text::public.student_status where id = student.id;
    perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
      'STUDENT_STATUS_CHANGED', 'student', student.id, jsonb_build_object('status', student.status),
      jsonb_build_object('status', target_status), reason);
  end if;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'ENROLLMENT_STATUS_CHANGED', 'enrollment', changed.id,
    jsonb_build_object('status', existing.status, 'exited_on', existing.exited_on),
    jsonb_build_object('status', changed.status, 'exited_on', changed.exited_on), reason);
  return query select changed.id, changed.status, changed.updated_at;
end
$$;

create or replace function public.create_guardian(
  first_name text, middle_name text, last_name text, phone text, email text
)
returns table (guardian_id uuid, is_active boolean, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; created public.guardians%rowtype;
begin
  select * into actor from internal.require_student_manager();
  insert into public.guardians (school_id, first_name, middle_name, last_name, phone, email)
  values (actor.school_id, first_name, middle_name, last_name, phone, email) returning * into created;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'GUARDIAN_CREATED', 'guardian', created.id, null,
    jsonb_build_object('is_active', created.is_active,
      'has_phone', created.phone is not null, 'has_email', created.email is not null));
  return query select created.id, created.is_active, created.updated_at;
end
$$;

create or replace function public.update_guardian(
  target_guardian_id uuid, expected_updated_at timestamptz,
  first_name text, middle_name text, last_name text, phone text, email text, target_is_active boolean
)
returns table (guardian_id uuid, is_active boolean, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.guardians%rowtype; changed public.guardians%rowtype;
begin
  select * into actor from internal.require_student_manager();
  select * into existing from public.guardians where id = target_guardian_id and school_id = actor.school_id for update;
  if not found then raise exception 'GUARDIAN_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  update public.guardians set first_name = update_guardian.first_name, middle_name = update_guardian.middle_name,
    last_name = update_guardian.last_name, phone = update_guardian.phone, email = update_guardian.email,
    is_active = target_is_active where id = existing.id returning * into changed;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'GUARDIAN_UPDATED', 'guardian', changed.id,
    jsonb_build_object('is_active', existing.is_active,
      'has_phone', existing.phone is not null, 'has_email', existing.email is not null),
    jsonb_build_object('is_active', changed.is_active,
      'has_phone', changed.phone is not null, 'has_email', changed.email is not null));
  return query select changed.id, changed.is_active, changed.updated_at;
end
$$;

create or replace function public.link_guardian_to_student(
  target_student_id uuid, target_guardian_id uuid, relationship text,
  primary_guardian boolean default false, report_access_eligible boolean default false
)
returns table (relationship_id uuid, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; student public.students%rowtype; guardian public.guardians%rowtype; created public.student_guardians%rowtype;
begin
  select * into actor from internal.require_student_manager();
  select * into student from public.students where id = target_student_id and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into guardian from public.guardians where id = target_guardian_id and school_id = actor.school_id and is_active for update;
  if not found then raise exception 'GUARDIAN_NOT_FOUND' using errcode = 'P0002'; end if;
  if nullif(btrim(relationship), '') is null then raise exception 'GUARDIAN_RELATIONSHIP_INVALID' using errcode = '22023'; end if;
  if primary_guardian then update public.student_guardians set is_primary = false where student_id = student.id and is_primary; end if;
  insert into public.student_guardians (student_id, guardian_id, relationship, is_primary, can_access_reports)
  values (student.id, guardian.id, relationship, primary_guardian, report_access_eligible) returning * into created;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_GUARDIAN_LINKED', 'student_guardian', created.id, null,
    to_jsonb(created) - array['created_at','updated_at']::text[]);
  return query select created.id, created.updated_at;
end
$$;

create or replace function public.create_and_link_guardian(
  target_student_id uuid,
  first_name text,
  middle_name text,
  last_name text,
  phone text,
  email text,
  relationship text,
  primary_guardian boolean default false,
  report_access_eligible boolean default false
)
returns table (guardian_id uuid, relationship_id uuid, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare created_guardian_id uuid; created_relationship_id uuid; relationship_updated_at timestamptz;
begin
  select created.guardian_id into created_guardian_id
  from public.create_guardian(first_name, middle_name, last_name, phone, email) created;
  select linked.relationship_id, linked.updated_at into created_relationship_id, relationship_updated_at
  from public.link_guardian_to_student(target_student_id, created_guardian_id, relationship, primary_guardian, report_access_eligible) linked;
  return query select created_guardian_id, created_relationship_id, relationship_updated_at;
end
$$;

create or replace function public.update_student_guardian_relationship(
  target_relationship_id uuid, expected_updated_at timestamptz, relationship text,
  primary_guardian boolean, report_access_eligible boolean
)
returns table (relationship_id uuid, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.student_guardians%rowtype; changed public.student_guardians%rowtype;
begin
  select * into actor from internal.require_student_manager();
  select link.* into existing from public.student_guardians link join public.students student on student.id = link.student_id
  where link.id = target_relationship_id and student.school_id = actor.school_id for update of link;
  if not found then raise exception 'GUARDIAN_RELATIONSHIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if nullif(btrim(relationship), '') is null then raise exception 'GUARDIAN_RELATIONSHIP_INVALID' using errcode = '22023'; end if;
  if primary_guardian then update public.student_guardians set is_primary = false where student_id = existing.student_id and id <> existing.id and is_primary; end if;
  update public.student_guardians set relationship = update_student_guardian_relationship.relationship,
    is_primary = primary_guardian, can_access_reports = report_access_eligible
  where id = existing.id returning * into changed;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_GUARDIAN_UPDATED', 'student_guardian', changed.id,
    to_jsonb(existing) - array['created_at','updated_at']::text[],
    to_jsonb(changed) - array['created_at','updated_at']::text[]);
  return query select changed.id, changed.updated_at;
end
$$;

create or replace function public.unlink_guardian_from_student(
  target_relationship_id uuid, expected_updated_at timestamptz, reason text
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.student_guardians%rowtype;
begin
  select * into actor from internal.require_student_manager();
  select link.* into existing from public.student_guardians link join public.students student on student.id = link.student_id
  where link.id = target_relationship_id and student.school_id = actor.school_id for update of link;
  if not found then raise exception 'GUARDIAN_RELATIONSHIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if existing.can_access_reports and exists (select 1 from public.student_access_credentials where student_id = existing.student_id) then
    raise exception 'GUARDIAN_RELATIONSHIP_HAS_ACCESS_DEPENDENCY' using errcode = '55006';
  end if;
  if nullif(btrim(reason), '') is null then raise exception 'UNLINK_REASON_REQUIRED' using errcode = '22023'; end if;
  delete from public.student_guardians where id = existing.id;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_GUARDIAN_UNLINKED', 'student_guardian', existing.id,
    to_jsonb(existing) - array['created_at','updated_at']::text[], null, reason);
end
$$;

create or replace function public.set_student_photo_path(
  target_student_id uuid, expected_updated_at timestamptz, photo_storage_path text
)
returns table (student_id uuid, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal
as $$
declare actor record; existing public.students%rowtype; changed public.students%rowtype; normalized_path text;
begin
  select * into actor from internal.require_student_manager();
  select * into existing from public.students where id = target_student_id and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  normalized_path := nullif(btrim(photo_storage_path), '');
  if normalized_path is not null and normalized_path !~ ('^' || actor.school_id::text || '/' || existing.id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$') then
    raise exception 'STUDENT_PHOTO_PATH_INVALID' using errcode = '22023';
  end if;
  if existing.photo_storage_path is not distinct from normalized_path then raise exception 'STUDENT_PHOTO_NOOP' using errcode = '22023'; end if;
  update public.students set photo_storage_path = normalized_path where id = existing.id returning * into changed;
  perform internal.record_student_audit(actor.profile_id, actor.membership_id, actor.school_id,
    case when normalized_path is null then 'STUDENT_PHOTO_REMOVED' else 'STUDENT_PHOTO_CHANGED' end,
    'student', changed.id,
    jsonb_build_object('has_photo', existing.photo_storage_path is not null),
    jsonb_build_object('has_photo', changed.photo_storage_path is not null));
  return query select changed.id, changed.updated_at;
end
$$;

create or replace function public.list_students(
  search_text text default null,
  filter_student_status public.student_status default null,
  filter_academic_year_id uuid default null,
  filter_grade_level_id uuid default null,
  filter_class_section_id uuid default null,
  filter_enrollment_status public.enrollment_status default null,
  page_number integer default 1,
  page_size integer default 25
)
returns table (
  student_id uuid, admission_number text, first_name text, middle_name text, last_name text,
  student_status public.student_status, photo_storage_path text, updated_at timestamptz,
  enrollment_id uuid, enrollment_status public.enrollment_status, academic_year_id uuid,
  academic_year_name text, class_section_id uuid, class_name text, grade_level_id uuid,
  grade_name text, class_number text, class_capacity integer, active_class_count bigint, total_count bigint
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  if page_number < 1 or page_size < 1 or page_size > 100 then raise exception 'PAGINATION_INVALID' using errcode = '22023'; end if;
  return query
  with visible as (
    select student.*, enrollment.id as enrollment_id, enrollment.status as enrollment_status,
      enrollment.academic_year_id, year.name as academic_year_name, enrollment.class_section_id,
      section.name as class_name, section.grade_level_id, grade.name as grade_name,
      enrollment.class_number, section.capacity as class_capacity,
      (select count(*) from public.enrollments peers where peers.class_section_id = section.id and peers.status in ('ACTIVE','REPEATING')) as active_class_count
    from public.students student
    left join lateral (
      select e.* from public.enrollments e where e.student_id = student.id and e.status in ('ACTIVE','REPEATING')
      order by e.enrolled_on desc, e.id limit 1
    ) enrollment on true
    left join public.academic_years year on year.id = enrollment.academic_year_id
    left join public.class_sections section on section.id = enrollment.class_section_id
    left join public.grade_levels grade on grade.id = section.grade_level_id
    where (
      internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ALL')
      or (internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ASSIGNED')
        and enrollment.status in ('ACTIVE','REPEATING')
        and internal.current_user_can_read_class_section(enrollment.class_section_id))
    )
    and (filter_student_status is null or student.status = filter_student_status)
    and (filter_academic_year_id is null or enrollment.academic_year_id = filter_academic_year_id)
    and (filter_grade_level_id is null or section.grade_level_id = filter_grade_level_id)
    and (filter_class_section_id is null or enrollment.class_section_id = filter_class_section_id)
    and (filter_enrollment_status is null or enrollment.status = filter_enrollment_status)
    and (nullif(btrim(search_text), '') is null or student.admission_number ilike '%' || btrim(search_text) || '%'
      or student.first_name ilike '%' || btrim(search_text) || '%' or student.last_name ilike '%' || btrim(search_text) || '%'
      or section.name ilike '%' || btrim(search_text) || '%')
  )
  select visible.id, visible.admission_number, visible.first_name, visible.middle_name, visible.last_name,
    visible.status, visible.photo_storage_path, visible.updated_at, visible.enrollment_id,
    visible.enrollment_status, visible.academic_year_id, visible.academic_year_name,
    visible.class_section_id, visible.class_name, visible.grade_level_id, visible.grade_name,
    visible.class_number, visible.class_capacity, visible.active_class_count, count(*) over()
  from visible order by lower(visible.last_name), lower(visible.first_name), lower(visible.admission_number), visible.id
  limit page_size offset ((page_number - 1) * page_size);
end
$$;

create or replace function public.get_student_details(target_student_id uuid)
returns table (
  student_id uuid, admission_number text, first_name text, middle_name text,
  last_name text, gender text, date_of_birth date, admission_date date,
  photo_storage_path text, status public.student_status, updated_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select student.id, student.admission_number, student.first_name,
    student.middle_name, student.last_name, student.gender,
    student.date_of_birth, student.admission_date, student.photo_storage_path,
    student.status, student.updated_at
  from public.students student
  where student.id = target_student_id and (
    internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ALL')
    or (internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ASSIGNED') and exists (
      select 1 from public.enrollments enrollment where enrollment.student_id = student.id
        and enrollment.status in ('ACTIVE','REPEATING')
        and internal.current_user_can_read_class_section(enrollment.class_section_id)
    ))
  );
$$;

create or replace function public.get_student_enrollment_history(target_student_id uuid)
returns table (enrollment_id uuid, academic_year_id uuid, academic_year_name text, class_section_id uuid,
  class_name text, grade_name text, class_number text, status public.enrollment_status,
  enrolled_on date, exited_on date, updated_at timestamptz)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select enrollment.id, enrollment.academic_year_id, year.name, enrollment.class_section_id,
    section.name, grade.name, enrollment.class_number, enrollment.status,
    enrollment.enrolled_on, enrollment.exited_on, enrollment.updated_at
  from public.enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  join public.academic_years year on year.id = enrollment.academic_year_id
  join public.class_sections section on section.id = enrollment.class_section_id
  join public.grade_levels grade on grade.id = section.grade_level_id
  where student.id = target_student_id and (
    internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ALL')
    or (internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ASSIGNED')
      and enrollment.status in ('ACTIVE','REPEATING')
      and internal.current_user_can_read_class_section(enrollment.class_section_id))
  ) order by year.starts_on desc, enrollment.enrolled_on desc, enrollment.id;
$$;

create or replace function public.get_student_guardians(target_student_id uuid)
returns table (relationship_id uuid, guardian_id uuid, first_name text, middle_name text, last_name text,
  phone text, email text, guardian_is_active boolean, relationship text, is_primary boolean,
  can_access_reports boolean, guardian_updated_at timestamptz, relationship_updated_at timestamptz)
language sql stable security definer
set search_path = pg_catalog, public, internal
as $$
  select link.id, guardian.id, guardian.first_name, guardian.middle_name, guardian.last_name,
    guardian.phone, guardian.email, guardian.is_active, link.relationship, link.is_primary,
    link.can_access_reports, guardian.updated_at, link.updated_at
  from public.student_guardians link
  join public.students student on student.id = link.student_id
  join public.guardians guardian on guardian.id = link.guardian_id
  where student.id = target_student_id
    and internal.current_user_has_any_permission(student.school_id,
      array['STUDENTS_VIEW_ALL','STUDENTS_MANAGE']::public.app_permission[])
  order by link.is_primary desc, lower(guardian.last_name), lower(guardian.first_name), guardian.id;
$$;

create or replace function public.get_class_roster(target_class_section_id uuid, page_number integer default 1, page_size integer default 100)
returns table (student_id uuid, admission_number text, first_name text, middle_name text, last_name text,
  class_number text, enrollment_status public.enrollment_status, total_count bigint)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
begin
  if page_number < 1 or page_size < 1 or page_size > 100 then raise exception 'PAGINATION_INVALID' using errcode = '22023'; end if;
  return query select student.id, student.admission_number, student.first_name, student.middle_name,
    student.last_name, enrollment.class_number, enrollment.status, count(*) over()
  from public.enrollments enrollment join public.students student on student.id = enrollment.student_id
  join public.class_sections section on section.id = enrollment.class_section_id
  join public.academic_years year on year.id = section.academic_year_id
  where section.id = target_class_section_id and enrollment.status in ('ACTIVE','REPEATING')
    and (internal.current_user_has_permission(year.school_id, 'STUDENTS_VIEW_ALL')
      or (internal.current_user_has_permission(year.school_id, 'STUDENTS_VIEW_ASSIGNED')
        and internal.current_user_can_read_class_section(section.id)))
  order by lower(student.last_name), lower(student.first_name), student.id
  limit page_size offset ((page_number - 1) * page_size);
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function internal.student_photo_access(object_name text, require_manage boolean)
returns boolean
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare object_school_id uuid; object_student_id uuid;
begin
  if object_name is null or array_length(string_to_array(object_name, '/'), 1) <> 3 then return false; end if;
  object_school_id := split_part(object_name, '/', 1)::uuid;
  object_student_id := split_part(object_name, '/', 2)::uuid;
  if split_part(object_name, '/', 3) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$' then return false; end if;
  if not exists (select 1 from public.students where id = object_student_id and school_id = object_school_id) then return false; end if;
  if require_manage then return internal.current_user_has_permission(object_school_id, 'STUDENTS_MANAGE'); end if;
  return internal.current_user_has_permission(object_school_id, 'STUDENTS_VIEW_ALL')
    or (internal.current_user_has_permission(object_school_id, 'STUDENTS_VIEW_ASSIGNED') and exists (
      select 1 from public.enrollments enrollment where enrollment.student_id = object_student_id
        and enrollment.status in ('ACTIVE','REPEATING')
        and internal.current_user_can_read_class_section(enrollment.class_section_id)
    ));
exception when invalid_text_representation then return false;
end
$$;

create policy student_photos_select_authorized on storage.objects
for select to authenticated using (
  bucket_id = 'student-photos' and internal.student_photo_access(name, false)
);

create policy student_photos_insert_managed on storage.objects
for insert to authenticated with check (
  bucket_id = 'student-photos' and internal.student_photo_access(name, true)
);

create policy student_photos_update_managed on storage.objects
for update to authenticated using (
  bucket_id = 'student-photos' and internal.student_photo_access(name, true)
) with check (
  bucket_id = 'student-photos' and internal.student_photo_access(name, true)
);

create policy student_photos_delete_managed on storage.objects
for delete to authenticated using (
  bucket_id = 'student-photos' and internal.student_photo_access(name, true)
);

revoke all on function internal.normalize_student_record() from public, anon, authenticated;
revoke all on function internal.normalize_guardian_record() from public, anon, authenticated;
revoke all on function internal.normalize_enrollment_record() from public, anon, authenticated;
revoke all on function internal.prevent_historical_record_delete() from public, anon, authenticated;
revoke all on function internal.current_student_manager() from public, anon, authenticated;
revoke all on function internal.require_student_manager() from public, anon, authenticated;
revoke all on function internal.student_manager_can_override_capacity(uuid) from public, anon, authenticated;
revoke all on function internal.raise_student_conflict() from public, anon, authenticated;
revoke all on function internal.record_student_audit(uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function internal.assert_enrollment_destination(uuid,uuid,uuid,date) from public, anon, authenticated;
revoke all on function internal.assert_class_capacity(uuid,uuid,boolean,text,uuid) from public, anon, authenticated;
revoke all on function internal.student_photo_access(text,boolean) from public, anon, authenticated;
-- Storage evaluates object policies as the authenticated role and therefore
-- needs EXECUTE on this boolean-only helper. It remains outside the exposed
-- public API schema and is not executable by anon.
grant execute on function internal.student_photo_access(text,boolean) to authenticated;

revoke execute on all functions in schema public from public, anon;

grant execute on function public.admit_student(text,text,text,text,text,date,date,uuid,uuid,text,public.enrollment_status,boolean,text,jsonb) to authenticated;
grant execute on function public.update_student_profile(uuid,timestamptz,text,text,text,text,text,date,date) to authenticated;
grant execute on function public.change_student_status(uuid,timestamptz,public.student_status,date,text) to authenticated;
grant execute on function public.create_student_enrollment(uuid,uuid,uuid,text,public.enrollment_status,date,boolean,text) to authenticated;
grant execute on function public.update_student_enrollment(uuid,timestamptz,text,date) to authenticated;
grant execute on function public.move_student_class(uuid,timestamptz,uuid,text,boolean,text) to authenticated;
grant execute on function public.change_enrollment_status(uuid,timestamptz,public.enrollment_status,date,text) to authenticated;
grant execute on function public.create_guardian(text,text,text,text,text) to authenticated;
grant execute on function public.update_guardian(uuid,timestamptz,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.link_guardian_to_student(uuid,uuid,text,boolean,boolean) to authenticated;
grant execute on function public.create_and_link_guardian(uuid,text,text,text,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.update_student_guardian_relationship(uuid,timestamptz,text,boolean,boolean) to authenticated;
grant execute on function public.unlink_guardian_from_student(uuid,timestamptz,text) to authenticated;
grant execute on function public.set_student_photo_path(uuid,timestamptz,text) to authenticated;
grant execute on function public.list_students(text,public.student_status,uuid,uuid,uuid,public.enrollment_status,integer,integer) to authenticated;
grant execute on function public.get_student_details(uuid) to authenticated;
grant execute on function public.get_student_enrollment_history(uuid) to authenticated;
grant execute on function public.get_student_guardians(uuid) to authenticated;
grant execute on function public.get_class_roster(uuid,integer,integer) to authenticated;

comment on function public.get_student_guardians(uuid) is
  'Guardian contacts are returned only to selected-school schoolwide viewers or managers; assigned-only staff receive no rows.';
comment on column public.student_guardians.can_access_reports is
  'Future parent-report eligibility only. It creates no credential, login, session, or current report access.';
comment on function internal.normalize_guardian_record() is
  'Stores email lowercase and phones in internationally usable E.164 form (+ plus 8-15 digits).';
comment on function public.change_student_status(uuid,timestamptz,public.student_status,date,text) is
  'DECEASED and INACTIVE close a current enrolment as WITHDRAWN because no separate enrolment enum exists.';
