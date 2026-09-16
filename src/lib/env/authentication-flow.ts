import "server-only";

import {
  parseAuthenticationFlowEnvironment,
  type AuthenticationFlowEnvironment,
} from "@/lib/env/schema";

let cachedEnvironment: AuthenticationFlowEnvironment | undefined;

export function getAuthenticationFlowEnvironment() {
  cachedEnvironment ??= parseAuthenticationFlowEnvironment({
    AUTH_FLOW_SIGNING_SECRET: process.env.AUTH_FLOW_SIGNING_SECRET,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return cachedEnvironment;
}
