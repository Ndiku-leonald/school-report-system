import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils/cn";

describe("cn", () => {
  it("joins conditional class names", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("keeps the last conflicting Tailwind utility", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });
});
