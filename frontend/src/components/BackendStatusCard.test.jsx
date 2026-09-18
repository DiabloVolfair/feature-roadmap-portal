import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BackendStatusCard from "./BackendStatusCard";
import { useHealthCheck } from "../hooks/useHealthCheck";

vi.mock("../hooks/useHealthCheck");

describe("BackendStatusCard", () => {
  it("renders the checking indicator while loading", () => {
    useHealthCheck.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    });

    render(<BackendStatusCard />);

    expect(screen.getByText("⏳ Checking...")).toBeInTheDocument();
  });

  it("renders the connected state when the health check succeeds", () => {
    useHealthCheck.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { success: true },
    });

    render(<BackendStatusCard />);

    expect(screen.getByText("🟢 Backend Connected")).toBeInTheDocument();
  });

  it("renders the disconnected state when the health check errors", () => {
    useHealthCheck.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    });

    render(<BackendStatusCard />);

    expect(screen.getByText("🔴 Backend Offline")).toBeInTheDocument();
  });
});
