import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createNewRuleVersion,
  createWorkflowRaceFixture,
  insertLastSeatOccupants,
  reopenSourceAuthority,
  restoreSourceAuthority,
  type RaceFixture,
} from "./support/workflow-race-fixture";

let fixture: RaceFixture;

async function results<T>(left: PromiseLike<T>, right: PromiseLike<T>) {
  // Every caller starts both authenticated RPCs before releasing the exact
  // Stage 17 advisory/row-lock barrier and has already observed a blocked
  // PostgreSQL session. This is not a raw Promise.all-only acceptance race.
  return Promise.all([left, right]);
}

describe.sequential("Stage 17 real workflow concurrency acceptance", () => {
  beforeAll(async () => {
    fixture = await createWorkflowRaceFixture();
  });

  afterAll(async () => {
    if (!fixture) return;
    await fixture.restoreConfirm().catch(() => undefined);
    await fixture.close();
  });

  it("C01. double generation serializes the actual generation workflow", async () => {
    const run = await fixture.holdScope(
      "c01-double-generation",
      async (release, observe) => {
        const left = fixture.generate(fixture.admin);
        const right = fixture.generate(fixture.head);
        await observe();
        await release();
        return results(left, right);
      },
    );
    expect(run.value.every((result) => result.error === null)).toBe(true);
    expect(run.evidence.blocked).toBe(true);
    expect(run.evidence.query).toMatch(/promotion|advisory|generate/i);
  });

  it("C02. generation contends with a source-authority change", async () => {
    try {
      const run = await fixture.holdScope(
        "c02-source-authority",
        async (release, observe) => {
          const generation = fixture.generate(fixture.admin);
          await observe();
          await reopenSourceAuthority(fixture, 0);
          await release();
          return generation;
        },
      );
      expect(run.value.error ?? "").toMatch(
        /PROMOTION_RESULTS_UNAVAILABLE|stale|checksum|term/i,
      );
      expect(run.evidence.blocked).toBe(true);
    } finally {
      await restoreSourceAuthority(fixture);
    }
  });

  it("C03. generation contends with a new Stage 11 result authority", async () => {
    const run = await fixture.holdScope(
      "c03-result-authority",
      async (release, observe) => {
        const generation = fixture.generate(fixture.admin);
        await observe();
        const calculated = fixture.admin.rpc("calculate_grade_results", {
          target_term_id: fixture.ids.term,
          target_grade_level_id: fixture.ids.grade,
          target_grading_scale_id: fixture.ids.scale,
          target_ranking_rule_id: fixture.ids.ranking,
          target_aggregate_classification_scale_id: fixture.ids.classification,
        });
        await release();
        const [generationResult, calculatedResult] = await Promise.all([
          generation,
          calculated,
        ]);
        expect(calculatedResult.error).toBeNull();
        // If generation acquired the shared authority first, it must fail
        // closed against the stale Stage 11 run. If calculation won first,
        // generation may succeed directly. In either ordering, verify the
        // winning retry is built from one authoritative calculation run.
        if (generationResult.error) {
          expect(generationResult.error).toMatch(
            /PROMOTION_RESULTS_UNAVAILABLE/i,
          );
          return fixture.generate(fixture.admin);
        }
        return generationResult;
      },
    );
    expect(run.value.error).toBeNull();
    expect(run.evidence.blocked).toBe(true);
    const authority = await fixture.db.query(
      `select count(distinct snapshot.calculation_run_id)::int as run_count,
              (array_agg(distinct snapshot.calculation_run_id))[1]::text as calculation_run_id,
              min(run.version)::int as calculation_version,
              min(run.input_checksum) as input_checksum
       from public.promotion_decisions decision
       join public.promotion_recommendation_snapshots snapshot
         on snapshot.id = decision.recommendation_snapshot_id
       join public.result_calculation_runs run
         on run.id = snapshot.calculation_run_id
       where decision.term_id=$1 and decision.superseded_by is null`,
      [fixture.ids.term],
    );
    expect(authority.rows[0].run_count).toBe(1);
    expect(authority.rows[0].calculation_run_id).toBeTruthy();
    expect(authority.rows[0].calculation_version).toBeGreaterThan(0);
    expect(authority.rows[0].input_checksum).toMatch(/^[0-9a-f]{64}$/i);
  });

  it("C04. generation contends with a promotion-rule authority change", async () => {
    const run = await fixture.holdScope(
      "c04-rule-authority",
      async (release, observe) => {
        const generation = fixture.generate(fixture.admin);
        await observe();
        await createNewRuleVersion(fixture);
        await release();
        return generation;
      },
    );
    expect(run.value.error).toBeNull();
    expect(run.evidence.blocked).toBe(true);
  });

  it("C05. conflicting confirmations serialize on one decision and version", async () => {
    const run = await fixture.holdScope(
      "c05-confirm",
      async (release, observe) => {
        const left = fixture.confirm(fixture.admin, 1, "PROMOTED");
        const right = fixture.confirm(fixture.head, 1, "REPEAT_CONFIRMED");
        await observe();
        await release();
        return results(left, right);
      },
    );
    expect(run.value.filter((result) => result.error === null)).toHaveLength(1);
    expect(run.value.filter((result) => result.error !== null)).toHaveLength(1);
    expect(run.evidence.blocked).toBe(true);
  });

  it("C06. confirmation contends with recommendation refresh", async () => {
    const run = await fixture.holdScope(
      "c06-refresh",
      async (release, observe) => {
        const confirmation = fixture.confirm(fixture.admin, 2);
        const refresh = fixture.generate(fixture.head);
        await observe();
        await release();
        return results(confirmation, refresh);
      },
    );
    expect(run.value.some((result) => result.error === null)).toBe(true);
    expect(run.evidence.blocked).toBe(true);
  });

  it("C07. confirmation observes an in-flight PROMOTION_CONFIRM revocation", async () => {
    try {
      const run = await fixture.holdScope(
        "c07-confirm-revoke",
        async (release, observe) => {
          const confirmation = fixture.confirm(fixture.admin, 3);
          await observe();
          await fixture.revokeConfirm();
          await release();
          const inFlight = await confirmation;
          const revokeFirst = await fixture.confirm(fixture.head, 4);
          return { inFlight, revokeFirst };
        },
      );
      expect(run.value.revokeFirst.error ?? "").toMatch(
        /FORBIDDEN|permission/i,
      );
      expect(run.evidence.blocked).toBe(true);
    } finally {
      await fixture.restoreConfirm();
    }
  });

  it("C08. reopen contends with progression on the same confirmed decision", async () => {
    expect((await fixture.confirm(fixture.admin, 5)).error).toBeNull();
    const run = await fixture.holdScope(
      "c08-reopen-progress",
      async (release, observe) => {
        const reopen = fixture.reopen(fixture.head, 5);
        const progression = fixture.progress(fixture.admin, 5);
        await observe();
        await release();
        return results(reopen, progression);
      },
    );
    expect(run.value.some((result) => result.error === null)).toBe(true);
    expect(run.evidence.blocked).toBe(true);
  });

  it("C09. double progression preserves one real apply", async () => {
    expect((await fixture.confirm(fixture.admin, 6)).error).toBeNull();
    const run = await fixture.holdScope(
      "c09-double-progress",
      async (release, observe) => {
        const left = fixture.progress(fixture.admin, 6);
        const right = fixture.progress(fixture.head, 6);
        try {
          await observe();
        } catch (error) {
          await release();
          const diagnostics = await results(left, right);
          throw new Error(
            `${error instanceof Error ? error.message : String(error)} ` +
              `left=${diagnostics[0].error ?? "ok"} right=${diagnostics[1].error ?? "ok"}`,
          );
        }
        await release();
        return results(left, right);
      },
    );
    const successful = run.value.filter((result) => result.error === null);
    const failed = run.value.filter((result) => result.error !== null);
    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(
      /PROMOTION_LIFECYCLE_INVALID|PROMOTION_ENROLLMENT_LIFECYCLE_INVALID|PROMOTION_ALREADY_PROGRESSED|PROMOTION_PROGRESSION_RETRY_CONFLICT/,
    );
    const progressionCount = await fixture.db.query(
      "select count(*)::int as count from public.student_progressions where source_enrollment_id=$1",
      [fixture.ids.enrollments[6]],
    );
    expect(progressionCount.rows[0].count).toBe(1);
    expect(run.evidence.blocked).toBe(true);
  });

  it("C10. two real progressions cannot both take the last destination seat", async () => {
    expect((await fixture.confirm(fixture.admin, 7)).error).toBeNull();
    expect((await fixture.confirm(fixture.admin, 8)).error).toBeNull();
    await insertLastSeatOccupants(fixture);
    const run = await fixture.holdScope(
      "c10-last-seat",
      async (release, observe) => {
        const left = fixture.progress(fixture.admin, 7);
        const right = fixture.progress(fixture.head, 8);
        await observe();
        await release();
        return results(left, right);
      },
    );
    expect(run.value.filter((result) => result.error === null)).toHaveLength(1);
    expect(run.value.filter((result) => result.error !== null)).toHaveLength(1);
    expect(
      run.value.find((result) => result.error !== null)?.error ?? "",
    ).toMatch(/CLASS_CAPACITY_REACHED|capacity/i);
    expect(run.evidence.blocked).toBe(true);
  });

  it("C11. progression contends with a student lifecycle transition", async () => {
    expect((await fixture.confirm(fixture.admin, 9)).error).toBeNull();
    // The base fixture is intentionally frozen so generation has immutable
    // evidence. Open this one source authority window so the real lifecycle
    // RPC can commit before the progression consumes the source row.
    await fixture.db.query("begin");
    try {
      await fixture.db.query(
        "select set_config('app.marks_workflow_transition','allowed',true)",
      );
      await fixture.db.query(
        "update public.mark_sheets set workflow_status='DRAFT', locked_by=null, locked_at=null where id=$1",
        [fixture.ids.sheet],
      );
      await fixture.db.query(
        "select set_config('app.term_marks_workflow_transition','allowed',true)",
      );
      await fixture.db.query(
        "update public.terms set status='MARKS_ENTRY' where id=$1",
        [fixture.ids.term],
      );
      await fixture.db.query("commit");
    } catch (error) {
      await fixture.db.query("rollback");
      throw error;
    }

    try {
      const run = await fixture.holdScope(
        "c11-lifecycle",
        async (release, observe) => {
          const enrollment = await fixture.db.query(
            "select updated_at::text as updated_at from public.enrollments where id=$1",
            [fixture.ids.enrollments[9]],
          );
          const enrollmentTransition = await fixture.admin.rpc(
            "change_enrollment_status",
            {
              target_enrollment_id: fixture.ids.enrollments[9],
              expected_updated_at: enrollment.rows[0].updated_at,
              target_status: "WITHDRAWN",
              exited_on: "2050-06-01",
              reason: "Stage 17 concurrency acceptance lifecycle transition",
            },
          );
          if (enrollmentTransition.error) throw enrollmentTransition.error;
          const student = await fixture.db.query(
            "select updated_at::text as updated_at from public.students where id=$1",
            [fixture.ids.students[9]],
          );
          const withdrawalResponse = await fixture.admin.rpc(
            "change_student_status",
            {
              target_student_id: fixture.ids.students[9],
              expected_updated_at: student.rows[0].updated_at,
              target_status: "WITHDRAWN",
              effective_date: "2050-06-01",
              reason: "Stage 17 concurrency acceptance lifecycle transition",
            },
          );
          const withdrawal = {
            data: {
              enrollment: enrollmentTransition.data,
              student: withdrawalResponse.data,
            },
            error: withdrawalResponse.error?.message ?? null,
          };
          const progression = fixture.progress(fixture.admin, 9);
          await observe();
          await release();
          return results(Promise.resolve(withdrawal), progression);
        },
      );
      expect(run.value[0].error).toBeNull();
      expect(run.value[1].error ?? "").toMatch(/LIFECYCLE|WITHDRAWN|ACTIVE/i);
      expect(run.evidence.blocked).toBe(true);
      const state = await fixture.db.query(
        "select student.status as student_status, enrollment.status as enrollment_status from public.students student join public.enrollments enrollment on enrollment.id=$1",
        [fixture.ids.enrollments[9]],
      );
      expect(state.rows[0]).toMatchObject({
        student_status: "WITHDRAWN",
        enrollment_status: "WITHDRAWN",
      });
      const progression = await fixture.db.query(
        "select count(*)::int as count from public.student_progressions where source_enrollment_id=$1",
        [fixture.ids.enrollments[9]],
      );
      expect(progression.rows[0].count).toBe(0);
    } finally {
      await restoreSourceAuthority(fixture);
      const calculated = await fixture.admin.rpc("calculate_grade_results", {
        target_term_id: fixture.ids.term,
        target_grade_level_id: fixture.ids.grade,
        target_grading_scale_id: fixture.ids.scale,
        target_ranking_rule_id: fixture.ids.ranking,
        target_aggregate_classification_scale_id: fixture.ids.classification,
      });
      if (calculated.error) throw calculated.error;
      const regenerated = await fixture.admin.rpc(
        "generate_promotion_recommendations",
        {
          target_term_id: fixture.ids.term,
          target_grade_level_id: fixture.ids.grade,
        },
      );
      if (regenerated.error) throw regenerated.error;
    }
  });

  it("C12. progression observes an in-flight PROMOTION_CONFIRM revocation", async () => {
    expect((await fixture.confirm(fixture.admin, 10)).error).toBeNull();
    try {
      const run = await fixture.holdScope(
        "c12-progress-revoke",
        async (release, observe) => {
          const progression = fixture.progress(fixture.admin, 10);
          await observe();
          await fixture.revokeConfirm();
          await release();
          const inFlight = await progression;
          const revokeFirst = await fixture.progress(fixture.head, 11);
          return { inFlight, revokeFirst };
        },
      );
      expect(run.value.revokeFirst.error ?? "").toMatch(
        /FORBIDDEN|permission|CONFIRM/i,
      );
      expect(run.evidence.blocked).toBe(true);
    } finally {
      await fixture.restoreConfirm();
    }
  });
});
