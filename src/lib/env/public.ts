import {
  parsePublicEnvironment,
  type PublicEnvironment,
} from "@/lib/env/schema";

let cachedEnvironment: PublicEnvironment | undefined;

export function getPublicEnvironment() {
  cachedEnvironment ??= parsePublicEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  return cachedEnvironment;
}
