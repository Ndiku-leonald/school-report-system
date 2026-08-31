import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const productionRoots = ["src/app", "src/components", "src/lib"];

describe("report publication privileged Storage boundary", () => {
  it("keeps the service-role Storage wrapper private to approved server modules", async () => {
    const files = await Promise.all(
      productionRoots.flatMap(async (root) => {
        const entries = await import("node:fs/promises").then((fs) =>
          fs.readdir(root, { recursive: true, withFileTypes: true }),
        );
        return Promise.all(
          entries
            .filter(
              (entry) =>
                entry.isFile() &&
                /\.(ts|tsx)$/.test(entry.name) &&
                !entry.name.endsWith(".test.ts"),
            )
            .map(async (entry) => {
              const relative = `${entry.parentPath}/${entry.name}`.replaceAll(
                "\\",
                "/",
              );
              return { relative, source: await readFile(relative, "utf8") };
            }),
        );
      }),
    ).then((groups) => groups.flat());

    const imports = files.filter((file) =>
      file.source.includes("./storage-admin"),
    );
    expect(imports.map((file) => file.relative)).toEqual([
      "src/lib/report-publication/service.ts",
    ]);
  });
});
