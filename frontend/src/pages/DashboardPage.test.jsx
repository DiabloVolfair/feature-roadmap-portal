import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "./DashboardPage";
import { dashboardService } from "../services/dashboardService";

vi.mock("../services/dashboardService", () => ({
  dashboardService: {
    getUserDashboard: vi.fn(),
  },
}));

// Validates: Requirements 16.1, 16.2, 16.3
describe("DashboardPage", () => {
  it("renders the resolved message on success", async () => {
    dashboardService.getUserDashboard.mockResolvedValue({
      message: "Welcome to your dashboard.",
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Welcome to your dashboard.")
      ).toBeInTheDocument();
    });
  });

  it("renders the not-yet-verified state on a 403 rejection", async () => {
    dashboardService.getUserDashboard.mockRejectedValue({
      response: { status: 403 },
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Please verify your email to access the dashboard.")
      ).toBeInTheDocument();
    });
  });

  it("renders a generic error state on any other rejection", async () => {
    dashboardService.getUserDashboard.mockRejectedValue(new Error("boom"));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong loading your dashboard.")
      ).toBeInTheDocument();
    });
  });

  it("renders a generic error state on a non-403 status rejection", async () => {
    dashboardService.getUserDashboard.mockRejectedValue({
      response: { status: 500 },
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong loading your dashboard.")
      ).toBeInTheDocument();
    });
  });
});
