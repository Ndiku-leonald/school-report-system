import { describe, expect, it } from "vitest";

import {
  checksumPrefix,
  criterionStateLabel,
  promotionOutcomeLabel,
} from "./format";

describe("promotion presentation helpers", () => {
  it("keeps recommended and confirmed repetition distinct", () => {
    expect(promotionOutcomeLabel("REPEAT_RECOMMENDED")).toBe(
      "REPEAT RECOMMENDED",
    );
    expect(promotionOutcomeLabel("REPEAT_CONFIRMED")).toBe("REPEAT CONFIRMED");
  });

  it("uses explicit non-color evidence labels", () => {
    expect(criterionStateLabel("MET")).toBe("Met");
    expect(criterionStateLabel("NOT_MET")).toBe("Not met");
    expect(criterionStateLabel("UNAVAILABLE")).toBe("Unavailable");
  });

  it("shows only a safe checksum prefix", () => {
    const checksum = "a".repeat(64);
    expect(checksumPrefix(checksum)).toBe("aaaaaaaaaaaa…");
    expect(checksumPrefix(null)).toBe("Unavailable");
  });
});
