import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/types/database.generated";

export async function recordSystemAuditEvent(
  admin: SupabaseClient<Database>,
  event: {
    action: string;
    schoolId: string;
    entityId: string;
    newValues: Record<string, boolean | number | string | null>;
  },
) {
  const { error } = await admin.from("audit_logs").insert({
    action: event.action,
    actor_membership_id: null,
    actor_profile_id: null,
    entity_id: event.entityId,
    entity_type: "school_staff_membership",
    new_values: event.newValues,
    school_id: event.schoolId,
  });

  if (error) {
    throw new Error("The provisioning audit event could not be recorded.");
  }
}
