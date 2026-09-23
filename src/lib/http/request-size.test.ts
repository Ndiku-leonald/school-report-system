import { describe, expect, it } from "vitest";

import {
  exceedsContentLength,
  SMALL_JSON_BODY_LIMIT_BYTES,
} from "@/lib/http/request-size";

describe("request body size guard", () => {
  it.each([
    [null, false],
    [String(SMALL_JSON_BODY_LIMIT_BYTES), false],
    [String(SMALL_JSON_BODY_LIMIT_BYTES + 1), true],
    ["not-a-number", false],
  ])(
    "classifies content length %s as oversized=%s",
    (contentLength, expected) => {
      expect(exceedsContentLength(contentLength)).toBe(expected);
    },
  );
});
