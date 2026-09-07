import { describe, expect, it } from "vitest";

import { runDeterministicAdvisoryRace } from "./support/deterministic-race";

const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;

if (!databaseUrl)
  throw new Error("SUPABASE_LOCAL_DB_URL is required for promotion races.");

describe.sequential("Stage 17 deterministic concurrency acceptance", () => {
  const races = [
    ["C01. double generation", "double-generation"],
    ["C02. generation versus source reopen", "generation-source-reopen"],
    ["C03. generation versus result authority", "generation-result-authority"],
    ["C04. generation versus rule change", "generation-rule-change"],
    ["C05. conflicting confirmation", "conflicting-confirmation"],
    ["C06. confirmation versus refresh", "confirmation-refresh"],
    [
      "C07. confirmation versus permission revocation",
      "confirmation-revocation",
    ],
    ["C08. reopen versus progression", "reopen-progression"],
    ["C09. double progression", "double-progression"],
    ["C10. last-seat capacity", "last-seat-capacity"],
    ["C11. progression versus lifecycle", "progression-lifecycle"],
    ["C12. progression versus permission revocation", "progression-revocation"],
  ] as const;

  for (const [title, label] of races)
    it(title, async () => {
      const result = await runDeterministicAdvisoryRace(databaseUrl!, label);
      expect(result.blocked, `${title} must observe a blocked session`).toBe(
        true,
      );
      expect(result.released, `${title} must release the winner`).toBe(true);
    });
});
