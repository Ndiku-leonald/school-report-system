import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getAdministrativeEnvironment } from "@/lib/env/administrative";
import type { Database } from "@/types/database.generated";

export function createAdministrativeSupabaseClient() {
  const environment = getAdministrativeEnvironment();

  return createClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
