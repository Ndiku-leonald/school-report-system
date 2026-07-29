create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  school_code text not null unique
    check (length(btrim(school_code)) between 1 and 50),
  address text,
  phone text,
  email text,
  timezone text not null default 'Africa/Kampala'
    check (length(btrim(timezone)) > 0),
  logo_storage_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  setting_key text not null check (length(btrim(setting_key)) between 1 and 100),
  setting_value jsonb not null default '{}'::jsonb
    check (jsonb_typeof(setting_value) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_settings_school_key_unique
    unique (school_id, setting_key)
);

comment on table public.school_settings is
  'Non-sensitive branding and school preference values. Secrets are prohibited.';

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  middle_name text check (
    middle_name is null or length(btrim(middle_name)) between 1 and 100
  ),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile data keyed to auth.users; authentication secrets remain in auth.';

create table public.school_staff_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  employee_number text not null
    check (length(btrim(employee_number)) between 1 and 50),
  status public.membership_status not null default 'INVITED',
  joined_at date,
  left_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_staff_employee_number_unique
    unique (school_id, employee_number),
  constraint school_staff_membership_dates_valid
    check (left_at is null or joined_at is null or left_at >= joined_at)
);

create unique index school_staff_one_active_membership_idx
  on public.school_staff_memberships (school_id, profile_id)
  where status = 'ACTIVE';

create table public.staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null
    references public.school_staff_memberships(id) on delete restrict,
  role public.staff_role not null,
  granted_by uuid
    references public.school_staff_memberships(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint staff_role_assignment_dates_valid
    check (revoked_at is null or revoked_at >= granted_at)
);

create unique index staff_role_one_active_assignment_idx
  on public.staff_role_assignments (membership_id, role)
  where revoked_at is null;

create index school_settings_school_idx
  on public.school_settings (school_id);

create index school_staff_profile_idx
  on public.school_staff_memberships (profile_id);

create index school_staff_school_status_idx
  on public.school_staff_memberships (school_id, status);

create index staff_role_membership_idx
  on public.staff_role_assignments (membership_id);

create index staff_role_granted_by_idx
  on public.staff_role_assignments (granted_by)
  where granted_by is not null;

create trigger schools_set_updated_at
before update on public.schools
for each row execute function internal.set_updated_at();

create trigger school_settings_set_updated_at
before update on public.school_settings
for each row execute function internal.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function internal.set_updated_at();

create trigger school_staff_memberships_set_updated_at
before update on public.school_staff_memberships
for each row execute function internal.set_updated_at();
