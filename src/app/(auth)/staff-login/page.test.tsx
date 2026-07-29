import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({
  signInAction: async () => ({ status: "idle" }),
}));

import { StaffLoginContent } from "@/app/(auth)/staff-login/page";

describe("StaffLoginPage", () => {
  it("renders the functional staff sign-in form", () => {
    render(<StaffLoginContent />);

    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute(
      "type",
      "submit",
    );
    expect(
      screen.getByRole("link", { name: /forgot your password/i }),
    ).toBeInTheDocument();
  });
});
