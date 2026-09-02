import { describe, expect, it } from "vitest";

import { reportArtifactChecksum, reportArtifactPath } from "./artifact";

describe("report publication artifact identity", () => {
  it("computes lowercase SHA-256 and the canonical immutable path", () => {
    const reportId = "7bc00000-0000-4000-8000-000000000001";
    const bytes = new TextEncoder().encode("synthetic PDF bytes");
    const checksum = reportArtifactChecksum(bytes);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(reportArtifactPath(reportId, checksum)).toBe(
      `${reportId}/${checksum}.pdf`,
    );
  });

  it("rejects arbitrary paths and noncanonical checksums", () => {
    const reportId = "7bc00000-0000-4000-8000-000000000001";
    expect(() => reportArtifactPath(reportId, "../report.pdf")).toThrow();
    expect(() => reportArtifactPath(reportId, "A".repeat(64))).toThrow();
    expect(() => reportArtifactPath("not-a-uuid", "a".repeat(64))).toThrow();
  });
});
