-- A controlled marks correction may follow a completed publication. Pending
-- downstream work still blocks reopen; finalized report history is retained
-- and superseded atomically when the corrected report is published.
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

  if exists (
       select 1 from public.report_batches batch
       where batch.term_id = selected_term.id
         and batch.status <> 'COMPLETED'
     )
     or exists (
       select 1 from public.reports report
       where report.term_id = selected_term.id
         and report.status not in ('PUBLISHED', 'WITHDRAWN', 'SUPERSEDED')
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
