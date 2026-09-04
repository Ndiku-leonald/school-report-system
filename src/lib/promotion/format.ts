import type { PromotionOutcome } from "./types";

export function promotionOutcomeLabel(outcome: PromotionOutcome | null) {
  if (!outcome) return "Not confirmed";
  return outcome.replaceAll("_", " ");
}

export function criterionStateLabel(state: unknown) {
  if (state === "MET") return "Met";
  if (state === "NOT_MET") return "Not met";
  return "Unavailable";
}

export function checksumPrefix(checksum: string | null) {
  return checksum ? `${checksum.slice(0, 12)}…` : "Unavailable";
}
