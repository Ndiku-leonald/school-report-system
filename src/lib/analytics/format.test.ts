import { describe, expect, it } from "vitest";

import {
  csvEscape,
  formatPercentage,
  rankingText,
  safeExportFilename,
} from "./format";

describe("analytics helper and display contracts", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [0, "0%"],
    [82.5, "82.5%"],
    [Number.NaN, "—"],
    [Number.POSITIVE_INFINITY, "—"],
  ])("formats percentage values safely: %s", (value, expected) => {
    expect(formatPercentage(value)).toBe(expected);
  });

  it("quotes commas, quotes, and newlines in CSV fields", () => {
    expect(csvEscape('Class, "A"\n')).toBe('"Class, ""A""\n"');
  });

  it.each(['=HYPERLINK("https://evil.example")', "+SUM(1,1)", "@cmd", "-1+2"])(
    "neutralizes spreadsheet formula input: %s",
    (value) => {
      expect(csvEscape(value).startsWith("\"'")).toBe(true);
    },
  );

  it("keeps ordinary labels unchanged apart from CSV quoting", () => {
    expect(csvEscape("Primary One")).toBe('"Primary One"');
  });

  it.each([
    ["2026 Term 1 Primary One", "2026-Term-1-Primary-One"],
    ["bad\r\nname", "bad-name"],
    ["../../", "academic-analytics"],
    ["", "academic-analytics"],
  ])("sanitizes export filenames", (value, expected) => {
    expect(safeExportFilename(value)).toBe(expected);
  });

  it.each([
    [null, false, 0, "Not ranked"],
    [1, false, 0, "1"],
    [2, true, 3, "2 (tie of 3)"],
  ])("preserves ranking tie text", (position, tied, tieSize, expected) => {
    expect(rankingText(position, tied, tieSize)).toBe(expected);
  });
});
