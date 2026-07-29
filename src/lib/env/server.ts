import "server-only";

import {
  parseServerEnvironment,
  type ServerEnvironment,
} from "@/lib/env/schema";

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment() {
  cachedEnvironment ??= parseServerEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });

  return cachedEnvironment;
}
