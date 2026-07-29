import "server-only";

import {
  parseAdministrativeEnvironment,
  type AdministrativeEnvironment,
} from "@/lib/env/schema";

let cachedEnvironment: AdministrativeEnvironment | undefined;

export function getAdministrativeEnvironment() {
  cachedEnvironment ??= parseAdministrativeEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return cachedEnvironment;
}
