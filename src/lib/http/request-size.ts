export const SMALL_JSON_BODY_LIMIT_BYTES = 2048;

export function exceedsContentLength(
  contentLength: string | null,
  limit = SMALL_JSON_BODY_LIMIT_BYTES,
) {
  if (!contentLength) return false;
  const bytes = Number(contentLength);
  return Number.isFinite(bytes) && bytes > limit;
}
