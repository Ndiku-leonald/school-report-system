import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ParentLoginPage from "@/app/parent/login/page";

describe("ParentPortalPage", () => {
  it("renders the parent verification fields and privacy guidance", () => {
    render(<ParentLoginPage />);

    expect(screen.getByLabelText("Access code")).toBeInTheDocument();
    expect(screen.getByLabelText("PIN")).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("button", { name: /sign in securely/i }),
    ).toHaveAttribute("type", "submit");
    expect(screen.getByText(/active guardians/i)).toBeInTheDocument();
  });
});
