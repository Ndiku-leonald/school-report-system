import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function nftFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? nftFiles(path)
      : entry.name.endsWith(".nft.json")
        ? [path]
        : [];
  });
}

const required = [
  "assets/fonts/report-noto-sans-400.ttf",
  "assets/fonts/report-noto-sans-700.ttf",
];
const traces = nftFiles(join(process.cwd(), ".next"));
const traced = new Set(
  traces.flatMap((file) => {
    const json = JSON.parse(readFileSync(file, "utf8")) as { files?: string[] };
    return (json.files ?? []).map((path) => path.replaceAll("\\", "/"));
  }),
);
for (const asset of required) {
  if (![...traced].some((path) => path.endsWith(asset))) {
    throw new Error(`Next output trace does not include ${asset}`);
  }
}
console.log(`report PDF font trace passed (${required.join(", ")})`);
