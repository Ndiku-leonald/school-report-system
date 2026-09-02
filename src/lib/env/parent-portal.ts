import "server-only";

import {
  parseParentPortalEnvironment,
  type ParentPortalEnvironment,
} from "./schema";

let cachedEnvironment: ParentPortalEnvironment | undefined;

export function getParentPortalEnvironment() {
  cachedEnvironment ??= parseParentPortalEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PARENT_ACCESS_RATE_LIMIT_SECRET:
      process.env.PARENT_ACCESS_RATE_LIMIT_SECRET,
  });

  return cachedEnvironment;
}
