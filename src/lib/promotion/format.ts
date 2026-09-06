import type { PromotionOutcome } from "./types";

export function promotionOutcomeLabel(outcome: PromotionOutcome | null) {
  if (!outcome) return "Not confirmed";
  const labels: Record<PromotionOutcome, string> = {
    PROMOTED: "Promoted",
    PROMOTED_WITH_SUPPORT: "Promoted with support",
    ACADEMIC_REVIEW: "Academic review",
    REPEAT_RECOMMENDED: "Repeat recommended",
    REPEAT_CONFIRMED: "Repeat confirmed",
    COMPLETED: "Completed",
  };
  return labels[outcome];
}

export function criterionStateLabel(state: unknown) {
  if (state === "MET") return "Met";
  if (state === "NOT_MET") return "Not met";
  return "Unavailable";
}

export function checksumPrefix(checksum: string | null) {
  return checksum ? `${checksum.slice(0, 12)}…` : "Unavailable";
}
