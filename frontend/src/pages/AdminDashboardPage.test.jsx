import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AdminDashboardPage from "./AdminDashboardPage";
import { useAnalytics } from "../hooks/useAdminBoard";

vi.mock("../hooks/useAdminBoard", () => ({
  useAnalytics: vi.fn(),
}));

vi.mock("../services/adminBoardService");

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    useAnalytics.mockReturnValue({ data: undefined, isLoading: false });
  });

  // Navigation link cards

  it("renders a Link with to='/admin/board'", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /kanban board/i })).toHaveAttribute(
      "href",
      "/admin/board"
    );
  });

  it("renders a Link with to='/admin/analytics'", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /analytics/i })).toHaveAttribute(
      "href",
      "/admin/analytics"
    );
  });

  it("renders a Link with to='/admin/audit'", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /audit log/i })).toHaveAttribute(
      "href",
      "/admin/audit"
    );
  });

  // Summary stats with real data

  it("renders summary stats when analytics data is available", () => {
    useAnalytics.mockReturnValue({
      data: {
        features: { total: 42 },
        users: { total: 7 },
        engagement: { total_votes: 99 },
      },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("99")).toBeInTheDocument();
    expect(screen.getByText("Total Requests")).toBeInTheDocument();
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Total Votes")).toBeInTheDocument();
  });

  // Loading skeleton

  it("renders loading skeletons when useAnalytics returns isLoading: true", () => {
    useAnalytics.mockReturnValue({ data: undefined, isLoading: true });

    renderPage();

    // The animated skeleton divs are rendered instead of numeric values
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);

    // Stat labels should still be visible
    expect(screen.getByText("Total Requests")).toBeInTheDocument();
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Total Votes")).toBeInTheDocument();
  });
});
