import type { NextConfig } from "next";

import {
  assertNoPrivilegedPublicEnvironmentVariables,
  parsePublicEnvironment,
} from "./src/lib/env/schema";

const isProductionBuild = process.env.NODE_ENV === "production";

if (isProductionBuild) {
  assertNoPrivilegedPublicEnvironmentVariables(process.env);
}

const publicEnvironment = isProductionBuild
  ? parsePublicEnvironment(process.env, { mode: "production" })
  : undefined;
const supabaseUrl =
  publicEnvironment?.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const storageOrigin = supabaseUrl ? new URL(supabaseUrl) : null;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/reports/[reportId]/pdf": [
      "./assets/fonts/report-noto-sans-400.ttf",
      "./assets/fonts/report-noto-sans-700.ttf",
    ],
  },
  experimental: {
    serverActions: {
      // Permit the application to receive a 5 MiB candidate and reject it
      // itself after type, size, and signature validation.
      bodySizeLimit: "6mb",
    },
  },
  images: storageOrigin
    ? {
        remotePatterns: [
          {
            protocol: storageOrigin.protocol.replace(":", "") as
              "http" | "https",
            hostname: storageOrigin.hostname,
            port: storageOrigin.port,
            pathname: "/storage/v1/object/sign/**",
          },
        ],
      }
    : undefined,
};

export default nextConfig;
