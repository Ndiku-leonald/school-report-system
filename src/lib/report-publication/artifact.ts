import { createHash } from "node:crypto";

export function reportArtifactChecksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function reportArtifactPath(reportId: string, checksum: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      reportId,
    )
  )
    throw new Error("Invalid report identifier.");
  if (!/^[0-9a-f]{64}$/.test(checksum))
    throw new Error("Invalid artifact checksum.");
  return `${reportId}/${checksum}.pdf`;
}
