import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminDashboardPage from "./AdminDashboardPage";
import { dashboardService } from "../services/dashboardService";

vi.mock("../services/dashboardService", () => ({
  dashboardService: {
    getAdminDashboard: vi.fn(),
  },
}));

// Validates: Requirements 16.1, 16.2, 16.3
describe("AdminDashboardPage", () => {
  it("renders the resolved message on success", async () => {
    dashboardService.getAdminDashboard.mockResolvedValue({
      message: "Welcome Admin.",
    });

    render(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Welcome Admin.")).toBeInTheDocument();
    });
  });

  it("renders a generic error state on any rejection", async () => {
    dashboardService.getAdminDashboard.mockRejectedValue(new Error("boom"));

    render(<AdminDashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong loading the admin dashboard.")
      ).toBeInTheDocument();
    });
  });
});
