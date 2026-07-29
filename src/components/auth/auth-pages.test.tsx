import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const membership = {
  id: "93000000-0000-4000-8000-000000000001",
  school_id: "91000000-0000-4000-8000-000000000001",
  profile_id: "92000000-0000-4000-8000-000000000001",
  employee_number: "SYNTHETIC-001",
  status: "ACTIVE",
  joined_at: null,
  left_at: null,
  created_at: "2026-07-29T00:00:00Z",
  updated_at: "2026-07-29T00:00:00Z",
  roles: [],
  school: {
    id: "91000000-0000-4000-8000-000000000001",
    name: "Synthetic School One",
    slug: "synthetic-school-one",
    school_code: "SYNTH-ONE",
    address: null,
    phone: null,
    email: null,
    timezone: "Africa/Kampala",
    logo_storage_path: null,
    is_active: true,
    created_at: "2026-07-29T00:00:00Z",
    updated_at: "2026-07-29T00:00:00Z",
  },
};

const context = {
  user: { id: membership.profile_id },
  profile: null,
  memberships: [
    membership,
    {
      ...membership,
      id: "93000000-0000-4000-8000-000000000002",
      employee_number: "SYNTHETIC-002",
      school_id: "91000000-0000-4000-8000-000000000002",
      school: {
        ...membership.school,
        id: "91000000-0000-4000-8000-000000000002",
        name: "Synthetic School Two",
        slug: "synthetic-school-two",
        school_code: "SYNTH-TWO",
      },
    },
  ],
  activeMembership: null,
};

vi.mock("@/lib/auth/actions", () => ({
  completeInvitationAction: async () => ({ status: "idle" }),
  requestPasswordResetAction: async () => ({ status: "idle" }),
  resetPasswordAction: async () => ({ status: "idle" }),
  selectActiveSchoolAction: async () => ({ status: "idle" }),
  signOutAction: async () => undefined,
}));
vi.mock("@/lib/auth/access", () => ({
  requireAuthenticatedStaff: async () => context,
}));
vi.mock("@/lib/auth/staff-context", () => ({
  getActiveMemberships: () => context.memberships,
  getStaffContext: async () => context,
}));

import AccountUnavailablePage from "@/app/(auth)/account-unavailable/page";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import SelectSchoolPage from "@/app/(auth)/select-school/page";

describe("staff authentication pages", () => {
  it("renders generic forgot-password guidance", () => {
    render(<ForgotPasswordPage />);

    expect(
      screen.getByRole("heading", { name: "Reset your password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send reset instructions" }),
    ).toBeInTheDocument();
  });

  it("renders the password confirmation surface", async () => {
    render(await ResetPasswordPage());

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
  });

  it("renders only the current staff member's school options", async () => {
    render(await SelectSchoolPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Synthetic School One")).toBeInTheDocument();
    expect(screen.getByText("Synthetic School Two")).toBeInTheDocument();
  });

  it("renders the unavailable state with secure sign-out", async () => {
    render(await AccountUnavailablePage());

    expect(
      screen.getByRole("heading", { name: "Staff access is unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAttribute(
      "type",
      "submit",
    );
  });
});
