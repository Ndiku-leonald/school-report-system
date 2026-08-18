-- Keep read-model workflow capabilities in exact agreement with the mutation
-- rules introduced by migration 21. PostgreSQL remains authoritative for every
-- transition; these flags only prevent the application from advertising an
-- action that the corresponding RPC must reject.

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
      )
      and (
        (sheet.supersedes_mark_sheet_id is null
          and term.status = 'MARKS_ENTRY'
          and internal.membership_has_current_subject_assignment(
            actor.membership_id, sheet.teaching_assignment_id, sheet.term_id,
            sheet.class_section_id, sheet.subject_id
          ))
        or (sheet.supersedes_mark_sheet_id is not null
          and term.status = 'REVIEW')
      )),
    ('MARKS_SUBMIT' = any(actor.effective_permissions)
      and 'SUBJECT_TEACHER' = any(actor.effective_roles)
      and sheet.workflow_status = 'RETURNED'
      and completion.missing_required_cells = 0
      and internal.membership_has_bound_subject_assignment(
        actor.membership_id, sheet.teaching_assignment_id, sheet.term_id,
        sheet.class_section_id, sheet.subject_id
      )
      and (
        (term.status = 'MARKS_ENTRY'
          and internal.membership_has_current_subject_assignment(
            actor.membership_id, sheet.teaching_assignment_id, sheet.term_id,
            sheet.class_section_id, sheet.subject_id
          ))
        or term.status = 'REVIEW'
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

revoke all on function public.get_mark_sheet_workflow_detail(uuid)
from public, anon;
grant execute on function public.get_mark_sheet_workflow_detail(uuid)
to authenticated;

comment on function public.get_mark_sheet_workflow_detail(uuid) is
  'Returns selected-school workflow detail with capability flags that exactly mirror ordinary, returned, and correction submission rules.';
