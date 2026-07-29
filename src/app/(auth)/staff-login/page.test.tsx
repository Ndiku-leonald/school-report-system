import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StaffLoginPage from "@/app/(auth)/staff-login/page";

describe("StaffLoginPage", () => {
  it("renders the visual sign-in form without authentication behavior", () => {
    render(<StaffLoginPage />);

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
      "button",
    );
    expect(
      screen.getByText(/authentication is not connected/i),
    ).toBeInTheDocument();
  });
});
