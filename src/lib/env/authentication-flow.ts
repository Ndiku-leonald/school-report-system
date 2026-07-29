import "server-only";

import {
  parseAuthenticationFlowEnvironment,
  type AuthenticationFlowEnvironment,
} from "@/lib/env/schema";

let cachedEnvironment: AuthenticationFlowEnvironment | undefined;

export function getAuthenticationFlowEnvironment() {
  cachedEnvironment ??= parseAuthenticationFlowEnvironment({
    AUTH_FLOW_SIGNING_SECRET: process.env.AUTH_FLOW_SIGNING_SECRET,
  });

  return cachedEnvironment;
}
