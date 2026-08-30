import { describe, expect, it } from "vitest";

import {
  contentDisposition,
  pdfDate,
  pdfNumber,
  pdfPosition,
  pdfSubjectStatus,
  pdfText,
  safeReportFilename,
} from "./format";

const report = {
  report_version: 3,
  snapshot_data: {
    student: { admission_number: "A/01", display_name: "Zoë Žurić" },
    academic_period: {
      academic_year_name: "2026/27",
      term_name: "Term Two",
    },
  },
} as Parameters<typeof safeReportFilename>[0];

describe("report PDF formatting", () => {
  it("removes control characters without changing extended Latin", () => {
    expect(pdfText("Zoë\u0000 Žurić")).toBe("Zoë Žurić");
  });

  it("uses explicit fallbacks for absent and non-finite values", () => {
    expect(pdfText(null)).toBe("Unavailable");
    expect(pdfNumber(Number.NaN)).toBe("Unavailable");
    expect(pdfNumber(88)).toBe("88");
  });

  it("accepts only the stable date prefix", () => {
    expect(pdfDate("2026-09-07T00:00:00.000Z")).toBe("2026-09-07");
    expect(pdfDate("not-a-date")).toBe("Unavailable");
  });

  it("renders subject states as readable labels", () => {
    expect(pdfSubjectStatus("COMPLETE", false, false)).toBe("Complete");
    expect(pdfSubjectStatus("COMPLETE", true, false)).toBe(
      "Complete · absence recorded",
    );
    expect(pdfSubjectStatus("COMPLETE", false, true)).toBe("Complete");
    expect(pdfSubjectStatus("INCOMPLETE", true, false)).toBe("Incomplete");
    expect(pdfSubjectStatus("EXEMPTED", false, true)).toBe("Exempted");
  });

  it("keeps frozen numeric positions visible when tied", () => {
    expect(pdfPosition(2, true, 2)).toBe("2 (tie of 2)");
    expect(pdfPosition(4, false, 3)).toBe("4");
    expect(pdfPosition(null, true, 2)).toBe("Unavailable");
  });

  it("normalizes dynamic filename segments to safe ASCII", () => {
    expect(safeReportFilename(report)).toBe(
      "A-01-Zoe-Zuric-2026-27-Term-Two-v3.pdf",
    );
  });

  it("does not allow header injection", () => {
    expect(contentDisposition("a\r\nb.pdf")).toBe(
      'attachment; filename="a--b.pdf"',
    );
  });
});
