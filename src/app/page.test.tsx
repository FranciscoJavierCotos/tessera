import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LandingPage from "./page";

describe("LandingPage", () => {
  it("shows the product name and links to sign-in", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Tessera",
    );
    for (const link of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(link).toHaveAttribute("href", "/sign-in");
    }
  });
});
