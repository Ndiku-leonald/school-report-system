create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists internal;

revoke all on schema internal from public;
revoke all on schema internal from anon;
revoke all on schema internal from authenticated;

create type public.staff_role as enum (
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'HEAD_TEACHER',
  'ACADEMIC_REGISTRAR',
  'CLASS_TEACHER',
  'SUBJECT_TEACHER'
);

create type public.membership_status as enum (
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'DISABLED'
);

create type public.academic_year_status as enum (
  'DRAFT',
  'ACTIVE',
  'CLOSED',
  'ARCHIVED'
);

create type public.term_status as enum (
  'DRAFT',
  'OPEN',
  'MARKS_ENTRY',
  'REVIEW',
  'LOCKED',
  'REPORTS',
  'CLOSED'
);

create type public.student_status as enum (
  'ACTIVE',
  'TRANSFERRED',
  'WITHDRAWN',
  'COMPLETED',
  'DECEASED',
  'INACTIVE'
);

create type public.enrollment_status as enum (
  'ACTIVE',
  'TRANSFERRED',
  'WITHDRAWN',
  'COMPLETED',
  'REPEATING'
);

create type public.mark_sheet_status as enum (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'RETURNED',
  'APPROVED',
  'LOCKED'
);

create type public.assessment_attendance_status as enum (
  'PRESENT',
  'ABSENT',
  'EXEMPTED',
  'NOT_ASSESSED'
);

create type public.assessment_scheme_status as enum (
  'DRAFT',
  'ACTIVE',
  'RETIRED'
);

create type public.report_status as enum (
  'DRAFT',
  'GENERATING',
  'GENERATED',
  'REVIEWED',
  'PUBLISHED',
  'WITHDRAWN',
  'FAILED',
  'SUPERSEDED'
);

create type public.report_batch_status as enum (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELLED'
);

create type public.promotion_outcome as enum (
  'PROMOTED',
  'PROMOTED_WITH_SUPPORT',
  'ACADEMIC_REVIEW',
  'REPEAT_RECOMMENDED',
  'REPEAT_CONFIRMED',
  'COMPLETED',
  'TRANSFERRED',
  'WITHDRAWN',
  'NOT_APPLICABLE'
);

create type public.ranking_basis as enum (
  'TOTAL',
  'AVERAGE',
  'AGGREGATE',
  'CONFIGURED'
);

create type public.ranking_tie_method as enum (
  'DENSE',
  'COMPETITION',
  'ORDINAL',
  'SHARED'
);

create or replace function internal.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function internal.prevent_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception '% rows are append-only and cannot be %', tg_table_name, lower(tg_op)
    using errcode = '55000';
end;
$$;

revoke all on all functions in schema internal from public;
revoke all on all functions in schema internal from anon;
revoke all on all functions in schema internal from authenticated;

comment on schema internal is
  'Non-API helper functions used by constraints and triggers.';

comment on function internal.set_updated_at() is
  'Maintains updated_at without requiring application callers to provide timestamps.';

comment on function internal.prevent_mutation() is
  'Rejects update and delete operations for append-only records.';
