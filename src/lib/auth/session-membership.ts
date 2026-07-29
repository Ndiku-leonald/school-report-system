import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

type UserSessionClient = SupabaseClient<Database>;

export async function setSessionActiveMembership(
  supabase: UserSessionClient,
  membershipId: string,
) {
  const { data, error } = await supabase.rpc("set_my_active_membership", {
    target_membership_id: membershipId,
  });

  if (error || data !== membershipId) {
    console.error("Active membership session selection failed.");
    return false;
  }

  return true;
}

export async function getSessionActiveMembership(supabase: UserSessionClient) {
  const { data, error } = await supabase.rpc("get_my_active_membership");

  if (error) {
    console.error("Active membership session selection could not be read.");
    return null;
  }

  return data;
}

export async function clearSessionActiveMembership(
  supabase: UserSessionClient,
) {
  const { error } = await supabase.rpc("clear_my_active_membership");

  if (error) {
    console.error("Active membership session selection could not be cleared.");
    return false;
  }

  return true;
}
