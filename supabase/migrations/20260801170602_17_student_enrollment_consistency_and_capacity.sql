-- Stage 7 corrective migration: serialize capacity decisions, make one current
-- enrolment authoritative, separate student and enrolment lifecycles, preserve
-- historical directory filtering, serialize primary-guardian replacement, and
-- require Storage object existence before photo metadata is linked.

create function internal.assert_current_enrollment_preflight()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select enrollment.student_id
    from public.enrollments enrollment
    where enrollment.status in ('ACTIVE', 'REPEATING')
    group by enrollment.student_id
    having count(*) > 1
  ) then
    raise exception 'CURRENT_ENROLLMENT_PREFLIGHT_FAILED: a student has more than one ACTIVE or REPEATING enrolment'
      using errcode = '23514';
  end if;
end
$$;

select internal.assert_current_enrollment_preflight();

do $$
begin
  if exists (
    select 1
    from public.enrollments enrollment
    join public.students student on student.id = enrollment.student_id
    where enrollment.status in ('ACTIVE', 'REPEATING')
      and student.status <> 'ACTIVE'
  ) then
    raise exception 'ENROLLMENT_LIFECYCLE_PREFLIGHT_FAILED: a current enrolment belongs to a non-active student'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.enrollments enrollment
    where (enrollment.status in ('ACTIVE', 'REPEATING') and enrollment.exited_on is not null)
       or (enrollment.status in ('TRANSFERRED', 'WITHDRAWN', 'COMPLETED')
         and (enrollment.exited_on is null or enrollment.exited_on < enrollment.enrolled_on))
  ) then
    raise exception 'ENROLLMENT_DATES_PREFLIGHT_FAILED: an enrolment has inconsistent exit dates'
      using errcode = '23514';
  end if;
end
$$;

create unique index enrollment_one_current_per_student_idx
  on public.enrollments (student_id)
  where status in ('ACTIVE', 'REPEATING');

create or replace function internal.normalize_enrollment_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare student_status public.student_status;
begin
  new.class_number = nullif(btrim(new.class_number), '');

  if new.status in ('ACTIVE', 'REPEATING') then
    if new.exited_on is not null then
      raise exception 'ENROLLMENT_EXIT_INVALID' using errcode = '23514';
    end if;
    select student.status into student_status
    from public.students student
    where student.id = new.student_id;
    if not found then
      raise exception 'ENROLLMENT_STUDENT_NOT_FOUND' using errcode = '23503';
    end if;
    if student_status <> 'ACTIVE' then
      raise exception 'CURRENT_ENROLLMENT_REQUIRES_ACTIVE_STUDENT' using errcode = '23514';
    end if;
  elsif new.status in ('TRANSFERRED', 'WITHDRAWN', 'COMPLETED') then
    if new.exited_on is null then
      raise exception 'ENROLLMENT_EXIT_REQUIRED' using errcode = '23514';
    end if;
    if new.exited_on < new.enrolled_on then
      raise exception 'ENROLLMENT_EXIT_BEFORE_START' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

create or replace function internal.enforce_student_enrollment_consistency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'ACTIVE' and exists (
    select 1 from public.enrollments enrollment
    where enrollment.student_id = new.id
      and enrollment.status in ('ACTIVE', 'REPEATING')
  ) then
    raise exception 'NON_ACTIVE_STUDENT_HAS_CURRENT_ENROLLMENT' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists students_enrollment_consistency_stage7 on public.students;
create trigger students_enrollment_consistency_stage7
before insert or update of status on public.students
for each row execute function internal.enforce_student_enrollment_consistency();

create or replace function internal.student_manager_can_override_capacity(actor_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.staff_role_assignments assignment
    join public.school_staff_memberships membership
      on membership.id = assignment.membership_id
    where assignment.membership_id = actor_membership_id
      and assignment.granted_at <= now()
      and assignment.revoked_at is null
      and assignment.role in ('SCHOOL_ADMIN', 'SUPER_ADMIN')
      and membership.status = 'ACTIVE'
  );
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
volatile
security definer
set search_path = pg_catalog, public, internal
as $$
declare class_capacity integer; current_count integer;
begin
  select section.capacity into class_capacity
  from public.class_sections section
  where section.id = target_class_section_id
  for update;
  if not found then
    raise exception 'ENROLLMENT_CLASS_UNAVAILABLE' using errcode = '23514';
  end if;
  if class_capacity is null then
    return false;
  end if;

  select count(*) into current_count
  from public.enrollments enrollment
  where enrollment.class_section_id = target_class_section_id
    and enrollment.status in ('ACTIVE', 'REPEATING')
    and (excluded_enrollment_id is null or enrollment.id <> excluded_enrollment_id);

  if current_count < class_capacity then
    return false;
  end if;
  if not capacity_override then
    raise exception 'CLASS_CAPACITY_REACHED' using errcode = '23514';
  end if;
  if nullif(btrim(override_reason), '') is null or length(btrim(override_reason)) < 3 then
    raise exception 'CLASS_CAPACITY_OVERRIDE_REASON_REQUIRED' using errcode = '22023';
  end if;
  if not internal.student_manager_can_override_capacity(actor_membership_id) then
    raise exception 'CLASS_CAPACITY_OVERRIDE_FORBIDDEN' using errcode = '42501';
  end if;
  return true;
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
  select * into student from public.students
  where id = target_student_id and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if student.status <> 'ACTIVE' then
    raise exception 'STUDENT_STATUS_NOT_ENROLLABLE' using errcode = '23514';
  end if;
  if enrollment_status not in ('ACTIVE','REPEATING') then
    raise exception 'ENROLLMENT_STATUS_INVALID' using errcode = '22023';
  end if;
  destination := internal.assert_enrollment_destination(
    actor.school_id, target_academic_year_id, target_class_section_id, enrolled_on
  );
  override_used := internal.assert_class_capacity(
    actor.membership_id, destination.id, capacity_override, capacity_override_reason
  );
  insert into public.enrollments (
    student_id, academic_year_id, class_section_id, class_number, status, enrolled_on
  ) values (
    student.id, target_academic_year_id, target_class_section_id, class_number, enrollment_status, enrolled_on
  ) returning * into created;
  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ENROLLMENT_CREATED', 'enrollment', created.id, null,
    jsonb_build_object(
      'student_id', created.student_id, 'academic_year_id', created.academic_year_id,
      'class_section_id', created.class_section_id, 'class_number', created.class_number,
      'status', created.status, 'enrolled_on', created.enrolled_on,
      'capacity_override', override_used
    ), case when override_used then capacity_override_reason else null end
  );
  return query select created.id, created.status, created.updated_at;
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
declare actor record; existing public.enrollments%rowtype; changed public.enrollments%rowtype;
  student public.students%rowtype; scoped_student_id uuid;
begin
  select * into actor from internal.require_student_manager();
  select enrollment.student_id into scoped_student_id
  from public.enrollments enrollment
  join public.students scoped_student on scoped_student.id = enrollment.student_id
  where enrollment.id = target_enrollment_id and scoped_student.school_id = actor.school_id;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into student from public.students where id = scoped_student_id for update;
  select * into existing from public.enrollments where id = target_enrollment_id for update;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if existing.status = target_status then raise exception 'ENROLLMENT_STATUS_NOOP' using errcode = '22023'; end if;
  if existing.status not in ('ACTIVE','REPEATING')
    or target_status not in ('ACTIVE','REPEATING','TRANSFERRED','WITHDRAWN','COMPLETED') then
    raise exception 'ENROLLMENT_STATUS_TRANSITION_INVALID' using errcode = '23514';
  end if;

  if target_status in ('ACTIVE','REPEATING') then
    if student.status <> 'ACTIVE' then
      raise exception 'CURRENT_ENROLLMENT_REQUIRES_ACTIVE_STUDENT' using errcode = '23514';
    end if;
    if exited_on is not null then
      raise exception 'ENROLLMENT_EXIT_INVALID' using errcode = '23514';
    end if;
  else
    if exited_on is null or nullif(btrim(reason), '') is null or length(btrim(reason)) < 3 then
      raise exception 'ENROLLMENT_EXIT_AND_REASON_REQUIRED' using errcode = '22023';
    end if;
    if exited_on < existing.enrolled_on then
      raise exception 'ENROLLMENT_EXIT_BEFORE_START' using errcode = '23514';
    end if;
  end if;

  update public.enrollments
  set status = target_status,
      exited_on = case when target_status in ('ACTIVE','REPEATING') then null else change_enrollment_status.exited_on end
  where id = existing.id returning * into changed;
  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'ENROLLMENT_STATUS_CHANGED', 'enrollment', changed.id,
    jsonb_build_object('status', existing.status, 'exited_on', existing.exited_on),
    jsonb_build_object('status', changed.status, 'exited_on', changed.exited_on),
    case when target_status in ('ACTIVE','REPEATING') then null else reason end
  );
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
  select * into existing from public.students
  where id = target_student_id and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if existing.status = target_status then raise exception 'STUDENT_STATUS_NOOP' using errcode = '22023'; end if;
  if not (
    (existing.status = 'ACTIVE' and target_status in ('TRANSFERRED','WITHDRAWN','COMPLETED','DECEASED','INACTIVE'))
    or (existing.status = 'INACTIVE' and target_status in ('ACTIVE','TRANSFERRED','WITHDRAWN'))
  ) then
    raise exception 'STUDENT_STATUS_TRANSITION_INVALID' using errcode = '23514';
  end if;
  if effective_date is null or nullif(btrim(reason), '') is null or length(btrim(reason)) < 3 then
    raise exception 'STUDENT_STATUS_REASON_AND_DATE_REQUIRED' using errcode = '22023';
  end if;

  select enrollment.* into current_enrollment
  from public.enrollments enrollment
  where enrollment.student_id = existing.id
    and enrollment.status in ('ACTIVE','REPEATING')
  for update;

  if found and target_status <> 'ACTIVE' then
    if effective_date < current_enrollment.enrolled_on then
      raise exception 'ENROLLMENT_EXIT_BEFORE_START' using errcode = '23514';
    end if;
    mapped_status := case target_status
      when 'TRANSFERRED' then 'TRANSFERRED'::public.enrollment_status
      when 'COMPLETED' then 'COMPLETED'::public.enrollment_status
      else 'WITHDRAWN'::public.enrollment_status end;
    update public.enrollments
    set status = mapped_status, exited_on = effective_date
    where id = current_enrollment.id returning * into changed_enrollment;
    perform internal.record_student_audit(
      actor.profile_id, actor.membership_id, actor.school_id,
      'ENROLLMENT_STATUS_CHANGED', 'enrollment', changed_enrollment.id,
      jsonb_build_object('status', current_enrollment.status, 'exited_on', current_enrollment.exited_on),
      jsonb_build_object('status', changed_enrollment.status, 'exited_on', changed_enrollment.exited_on),
      reason
    );
  end if;

  update public.students set status = target_status
  where id = existing.id returning * into changed;
  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_STATUS_CHANGED', 'student', changed.id,
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', changed.status, 'effective_date', effective_date),
    reason
  );
  return query select changed.id, changed.status, changed.updated_at;
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
declare actor record; student public.students%rowtype; guardian public.guardians%rowtype;
  created public.student_guardians%rowtype; former_primary public.student_guardians%rowtype;
begin
  select * into actor from internal.require_student_manager();
  select * into student from public.students
  where id = target_student_id and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  perform 1 from public.student_guardians link
  where link.student_id = student.id order by link.id for update;
  select * into guardian from public.guardians
  where id = target_guardian_id and school_id = actor.school_id and is_active for update;
  if not found then raise exception 'GUARDIAN_NOT_FOUND' using errcode = 'P0002'; end if;
  if nullif(btrim(relationship), '') is null then
    raise exception 'GUARDIAN_RELATIONSHIP_INVALID' using errcode = '22023';
  end if;
  if primary_guardian then
    select * into former_primary from public.student_guardians
    where student_id = student.id and is_primary for update;
    if found then
      update public.student_guardians set is_primary = false where id = former_primary.id;
      perform internal.record_student_audit(
        actor.profile_id, actor.membership_id, actor.school_id,
        'STUDENT_GUARDIAN_PRIMARY_REMOVED', 'student_guardian', former_primary.id,
        jsonb_build_object('relationship_id', former_primary.id, 'is_primary', true),
        jsonb_build_object('relationship_id', former_primary.id, 'is_primary', false)
      );
    end if;
  end if;
  insert into public.student_guardians (
    student_id, guardian_id, relationship, is_primary, can_access_reports
  ) values (
    student.id, guardian.id, relationship, primary_guardian, report_access_eligible
  ) returning * into created;
  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_GUARDIAN_LINKED', 'student_guardian', created.id, null,
    to_jsonb(created) - array['created_at','updated_at']::text[]
  );
  return query select created.id, created.updated_at;
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
  former_primary public.student_guardians%rowtype; scoped_student_id uuid;
begin
  select * into actor from internal.require_student_manager();
  select link.student_id into scoped_student_id
  from public.student_guardians link
  join public.students student on student.id = link.student_id
  where link.id = target_relationship_id and student.school_id = actor.school_id;
  if not found then raise exception 'GUARDIAN_RELATIONSHIP_NOT_FOUND' using errcode = 'P0002'; end if;

  perform 1 from public.students student where student.id = scoped_student_id for update;
  perform 1 from public.student_guardians link
  where link.student_id = scoped_student_id order by link.id for update;
  select * into existing from public.student_guardians where id = target_relationship_id;
  if not found then raise exception 'GUARDIAN_RELATIONSHIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  if nullif(btrim(relationship), '') is null then
    raise exception 'GUARDIAN_RELATIONSHIP_INVALID' using errcode = '22023';
  end if;

  if primary_guardian and not existing.is_primary then
    select * into former_primary from public.student_guardians
    where student_id = existing.student_id and id <> existing.id and is_primary for update;
    if found then
      update public.student_guardians set is_primary = false where id = former_primary.id;
      perform internal.record_student_audit(
        actor.profile_id, actor.membership_id, actor.school_id,
        'STUDENT_GUARDIAN_PRIMARY_REMOVED', 'student_guardian', former_primary.id,
        jsonb_build_object('relationship_id', former_primary.id, 'is_primary', true),
        jsonb_build_object('relationship_id', former_primary.id, 'is_primary', false)
      );
    end if;
  end if;
  update public.student_guardians
  set relationship = update_student_guardian_relationship.relationship,
      is_primary = primary_guardian,
      can_access_reports = report_access_eligible
  where id = existing.id returning * into changed;
  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    'STUDENT_GUARDIAN_UPDATED', 'student_guardian', changed.id,
    to_jsonb(existing) - array['created_at','updated_at']::text[],
    to_jsonb(changed) - array['created_at','updated_at']::text[]
  );
  return query select changed.id, changed.updated_at;
end
$$;

create or replace function public.set_student_photo_path(
  target_student_id uuid, expected_updated_at timestamptz, photo_storage_path text
)
returns table (student_id uuid, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, internal, storage
as $$
declare actor record; existing public.students%rowtype; changed public.students%rowtype; normalized_path text;
begin
  select * into actor from internal.require_student_manager();
  select * into existing from public.students
  where id = target_student_id and school_id = actor.school_id for update;
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if existing.updated_at is distinct from expected_updated_at then perform internal.raise_student_conflict(); end if;
  normalized_path := nullif(btrim(photo_storage_path), '');
  if normalized_path is not null and normalized_path !~ (
    '^' || actor.school_id::text || '/' || existing.id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
  ) then
    raise exception 'STUDENT_PHOTO_PATH_INVALID' using errcode = '22023';
  end if;
  if normalized_path is not null and not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'student-photos' and object.name = normalized_path
  ) then
    raise exception 'STUDENT_PHOTO_OBJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if existing.photo_storage_path is not distinct from normalized_path then
    raise exception 'STUDENT_PHOTO_NOOP' using errcode = '22023';
  end if;
  update public.students set photo_storage_path = normalized_path
  where id = existing.id returning * into changed;
  perform internal.record_student_audit(
    actor.profile_id, actor.membership_id, actor.school_id,
    case when normalized_path is null then 'STUDENT_PHOTO_REMOVED' else 'STUDENT_PHOTO_CHANGED' end,
    'student', changed.id,
    jsonb_build_object('has_photo', existing.photo_storage_path is not null),
    jsonb_build_object('has_photo', changed.photo_storage_path is not null)
  );
  return query select changed.id, changed.updated_at;
end
$$;

drop function public.list_students(
  text, public.student_status, uuid, uuid, uuid,
  public.enrollment_status, integer, integer
);

create function public.list_students(
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
  grade_name text, class_number text, class_capacity integer, active_class_count bigint,
  placement_is_current boolean, class_is_active boolean, total_count bigint
)
language plpgsql stable security definer
set search_path = pg_catalog, public, internal
as $$
declare normalized_search text := nullif(btrim(search_text), '');
  has_placement_filter boolean := filter_academic_year_id is not null
    or filter_grade_level_id is not null
    or filter_class_section_id is not null
    or filter_enrollment_status is not null;
begin
  if page_number < 1 or page_size < 1 or page_size > 100 then
    raise exception 'PAGINATION_INVALID' using errcode = '22023';
  end if;
  return query
  with authorised_students as (
    select student.*,
      internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ALL') as view_all,
      (normalized_search is not null and (
        student.admission_number ilike '%' || normalized_search || '%'
        or student.first_name ilike '%' || normalized_search || '%'
        or student.middle_name ilike '%' || normalized_search || '%'
        or student.last_name ilike '%' || normalized_search || '%'
      )) as identity_matches
    from public.students student
    where (
      internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ALL')
      or (
        internal.current_user_has_permission(student.school_id, 'STUDENTS_VIEW_ASSIGNED')
        and exists (
          select 1 from public.enrollments live_enrollment
          where live_enrollment.student_id = student.id
            and live_enrollment.status in ('ACTIVE','REPEATING')
            and internal.current_user_can_read_class_section(live_enrollment.class_section_id)
        )
      )
    )
    and (filter_student_status is null or student.status = filter_student_status)
  ), visible as (
    select student.*, placement.enrollment_id, placement.enrollment_status,
      placement.academic_year_id, placement.academic_year_name,
      placement.class_section_id, placement.class_name, placement.grade_level_id,
      placement.grade_name, placement.class_number, placement.class_capacity,
      placement.active_class_count, placement.placement_is_current,
      placement.class_is_active, placement.class_search_matches
    from authorised_students student
    left join lateral (
      select enrollment.id as enrollment_id, enrollment.status as enrollment_status,
        enrollment.academic_year_id, year.name as academic_year_name,
        enrollment.class_section_id, section.name as class_name,
        section.grade_level_id, grade.name as grade_name, enrollment.class_number,
        section.capacity as class_capacity,
        (select count(*) from public.enrollments peer
          where peer.class_section_id = section.id
            and peer.status in ('ACTIVE','REPEATING')) as active_class_count,
        enrollment.status in ('ACTIVE','REPEATING') as placement_is_current,
        section.is_active as class_is_active,
        (normalized_search is not null and (
          section.name ilike '%' || normalized_search || '%'
          or section.class_code ilike '%' || normalized_search || '%'
        )) as class_search_matches,
        year.starts_on
      from public.enrollments enrollment
      join public.academic_years year on year.id = enrollment.academic_year_id
      join public.class_sections section on section.id = enrollment.class_section_id
      join public.grade_levels grade on grade.id = section.grade_level_id
      where enrollment.student_id = student.id
        and (
          (student.view_all and (
            (has_placement_filter
              and (filter_academic_year_id is null or enrollment.academic_year_id = filter_academic_year_id)
              and (filter_grade_level_id is null or section.grade_level_id = filter_grade_level_id)
              and (filter_class_section_id is null or enrollment.class_section_id = filter_class_section_id)
              and (filter_enrollment_status is null or enrollment.status = filter_enrollment_status))
            or (not has_placement_filter and (
              enrollment.status in ('ACTIVE','REPEATING')
              or (not student.identity_matches and normalized_search is not null and (
                section.name ilike '%' || normalized_search || '%'
                or section.class_code ilike '%' || normalized_search || '%'
              ))
            ))
          ))
          or (not student.view_all
            and enrollment.status in ('ACTIVE','REPEATING')
            and internal.current_user_can_read_class_section(enrollment.class_section_id)
            and (filter_academic_year_id is null or enrollment.academic_year_id = filter_academic_year_id)
            and (filter_grade_level_id is null or section.grade_level_id = filter_grade_level_id)
            and (filter_class_section_id is null or enrollment.class_section_id = filter_class_section_id)
            and (filter_enrollment_status is null or enrollment.status = filter_enrollment_status))
        )
      order by
        case when not has_placement_filter and student.identity_matches
          and enrollment.status in ('ACTIVE','REPEATING') then 0 else 1 end,
        case when not has_placement_filter and not student.identity_matches
          and normalized_search is not null and (
            section.name ilike '%' || normalized_search || '%'
            or section.class_code ilike '%' || normalized_search || '%'
          ) then 0 else 1 end,
        year.starts_on desc, enrollment.enrolled_on desc, enrollment.id desc
      limit 1
    ) placement on true
    where (not has_placement_filter or placement.enrollment_id is not null)
      and (normalized_search is null or student.identity_matches or placement.class_search_matches)
  )
  select visible.id, visible.admission_number, visible.first_name, visible.middle_name,
    visible.last_name, visible.status, visible.photo_storage_path, visible.updated_at,
    visible.enrollment_id, visible.enrollment_status, visible.academic_year_id,
    visible.academic_year_name, visible.class_section_id, visible.class_name,
    visible.grade_level_id, visible.grade_name, visible.class_number,
    visible.class_capacity, visible.active_class_count, visible.placement_is_current,
    visible.class_is_active, count(*) over()
  from visible
  order by lower(visible.last_name), lower(visible.first_name),
    lower(visible.admission_number), visible.id
  limit page_size offset ((page_number - 1) * page_size);
end
$$;

revoke all on function internal.enforce_student_enrollment_consistency() from public, anon, authenticated;
revoke all on function internal.normalize_enrollment_record() from public, anon, authenticated;
revoke all on function internal.assert_class_capacity(uuid,uuid,boolean,text,uuid) from public, anon, authenticated;
revoke all on function internal.assert_current_enrollment_preflight() from public, anon, authenticated;
revoke all on function internal.student_manager_can_override_capacity(uuid) from public, anon, authenticated;
revoke execute on function public.list_students(text,public.student_status,uuid,uuid,uuid,public.enrollment_status,integer,integer) from public, anon;
grant execute on function public.list_students(text,public.student_status,uuid,uuid,uuid,public.enrollment_status,integer,integer) to authenticated;

comment on index enrollment_one_current_per_student_idx is
  'A student has at most one ACTIVE or REPEATING enrolment across all academic years. Close it before creating a later-year current enrolment.';
comment on function internal.assert_current_enrollment_preflight() is
  'Fails migration 17 clearly when existing data contains more than one current enrolment for a student; it never rewrites data.';
comment on function internal.assert_class_capacity(uuid,uuid,boolean,text,uuid) is
  'Locks the destination class row, recounts current placements while holding the lock, and keeps that lock until the caller transaction ends.';
comment on function public.change_enrollment_status(uuid,timestamptz,public.enrollment_status,date,text) is
  'Changes only an academic-year enrolment. Completing or closing it does not change the student lifecycle status.';
comment on function public.change_student_status(uuid,timestamptz,public.student_status,date,text) is
  'The sole Stage 7 student-lifecycle transition. Non-active transitions atomically close the single current enrolment; explicit reactivation creates no enrolment.';
comment on function public.list_students(text,public.student_status,uuid,uuid,uuid,public.enrollment_status,integer,integer) is
  'Returns current placements by default, latest matching historical placement for schoolwide filters, and live assignment scope only for assigned viewers.';
