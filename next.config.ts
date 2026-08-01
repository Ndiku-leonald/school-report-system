import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const storageOrigin = supabaseUrl ? new URL(supabaseUrl) : null;

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
