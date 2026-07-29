import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ParentPortalPage from "@/app/parent/page";

describe("ParentPortalPage", () => {
  it("renders the student verification fields and privacy guidance", () => {
    render(<ParentPortalPage />);

    expect(screen.getByLabelText("Student code")).toBeInTheDocument();
    expect(screen.getByLabelText("Secure PIN")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute(
      "type",
      "button",
    );
    expect(
      screen.getByText(/protect student information/i),
    ).toBeInTheDocument();
  });
});
