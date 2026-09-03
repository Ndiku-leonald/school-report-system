export function displayNumber(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value}${suffix}`;
}

export function formatPercentage(value: number | null | undefined) {
  return displayNumber(value, "%");
}

export function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  const inert = /^[=+\-@]/u.test(text.trim()) ? `'${text}` : text;
  return `"${inert.replaceAll('"', '""')}"`;
}

export function csvRow(
  values: readonly (string | number | null | undefined)[],
) {
  return values.map(csvEscape).join(",");
}

export function safeExportFilename(value: string) {
  const safe = value
    .replace(/[\r\n]/gu, " ")
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^[-.]+|[-.]+$/gu, "")
    .slice(0, 80);
  return safe || "academic-analytics";
}

export function rankingText(
  position: number | null,
  tied: boolean,
  tieSize: number,
) {
  if (position === null) return "Not ranked";
  return tied ? `${position} (tie of ${tieSize})` : String(position);
}
