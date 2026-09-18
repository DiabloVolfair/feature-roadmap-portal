import { describe, it, expect, vi, beforeEach } from "vitest";

import { httpClient } from "./httpClient";
import { dashboardService } from "./dashboardService";

// httpClient is mocked at the module level so each dashboardService
// function's interaction with it (method, URL) and the raw resolved/
// rejected shape can be asserted directly, without a real network call.
vi.mock("./httpClient", () => ({
  httpClient: {
    get: vi.fn(),
  },
}));

// Validates: Requirements 16.5
describe("dashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserDashboard", () => {
    it("GETs /api/v1/user/dashboard and resolves with data.data", async () => {
      httpClient.get.mockResolvedValue({
        data: { data: { message: "Welcome to your dashboard." } },
      });

      const result = await dashboardService.getUserDashboard();

      expect(httpClient.get).toHaveBeenCalledWith("/api/v1/user/dashboard");
      expect(result).toEqual({ message: "Welcome to your dashboard." });
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("forbidden");
      httpClient.get.mockRejectedValue(error);

      await expect(dashboardService.getUserDashboard()).rejects.toBe(error);
    });
  });

  describe("getAdminDashboard", () => {
    it("GETs /api/v1/admin/dashboard and resolves with data.data", async () => {
      httpClient.get.mockResolvedValue({
        data: { data: { message: "Welcome Admin." } },
      });

      const result = await dashboardService.getAdminDashboard();

      expect(httpClient.get).toHaveBeenCalledWith("/api/v1/admin/dashboard");
      expect(result).toEqual({ message: "Welcome Admin." });
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("forbidden");
      httpClient.get.mockRejectedValue(error);

      await expect(dashboardService.getAdminDashboard()).rejects.toBe(error);
    });
  });
});
