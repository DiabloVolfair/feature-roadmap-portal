import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "./HomePage";
import { useHealthCheck } from "../hooks/useHealthCheck";

vi.mock("../hooks/useHealthCheck");

describe("HomePage", () => {
  beforeEach(() => {
    useHealthCheck.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    });
  });

  it("renders the project title", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "Feature Request & Public Roadmap Portal",
      })
    ).toBeInTheDocument();
  });

  it("renders a project description under 200 characters", () => {
    render(<HomePage />);

    const description = screen.getByText(
      /Submit feature ideas, vote on what matters most/i
    );

    expect(description).toBeInTheDocument();
    expect(description.textContent.length).toBeLessThanOrEqual(200);
  });

  it('renders the "Feature feed coming soon" placeholder', () => {
    render(<HomePage />);

    expect(screen.getByText("Feature feed coming soon")).toBeInTheDocument();
  });

  it("does not render any feature-card component", () => {
    render(<HomePage />);

    expect(
      screen.queryByTestId(/feature-card/i)
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[class*="feature-card"]')
    ).not.toBeInTheDocument();
  });
});
