import "server-only";

import { headers } from "next/headers";

import { createAdministrativeSupabaseClient } from "@/lib/supabase/admin";
import type { StaffMembershipContext } from "@/lib/auth/staff-context";

type AuditEvent = {
  action: string;
  entityType: string;
  entityId?: string | null;
  membership: StaffMembershipContext;
  newValues?: Record<string, boolean | number | string | null>;
  reason?: string;
};

export async function recordStaffAuditEvent(event: AuditEvent) {
  try {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0];
    const requestId = requestHeaders.get("x-request-id");
    const supabase = createAdministrativeSupabaseClient();
    const { error } = await supabase.from("audit_logs").insert({
      school_id: event.membership.school_id,
      actor_profile_id: event.membership.profile_id,
      actor_membership_id: event.membership.id,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId,
      new_values: event.newValues,
      reason: event.reason,
      request_id:
        requestId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          requestId,
        )
          ? requestId
          : null,
      ip_address: forwardedFor || null,
      user_agent: requestHeaders.get("user-agent"),
    });

    if (error) {
      console.error("Staff authentication audit event was not persisted.", {
        action: event.action,
      });
      return false;
    }

    return true;
  } catch {
    console.error("Staff authentication audit event could not be recorded.", {
      action: event.action,
    });
    return false;
  }
}
