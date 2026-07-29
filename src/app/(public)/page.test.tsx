import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LandingPage from "@/app/(public)/page";

describe("LandingPage", () => {
  it("renders the system introduction and access links", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: /academic results, handled with care/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Staff sign in" })).toHaveAttribute(
      "href",
      "/staff-login",
    );
    expect(
      screen.getByRole("link", { name: "Access a student report" }),
    ).toHaveAttribute("href", "/parent");
    expect(
      screen.getByText(
        /only authorised users may access academic information/i,
      ),
    ).toBeInTheDocument();
  });
});
