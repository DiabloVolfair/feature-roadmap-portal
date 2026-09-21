import { describe, it, expect, vi, beforeEach } from "vitest";

import { httpClient } from "./httpClient";
import { roadmapService } from "./roadmapService";

vi.mock("./httpClient", () => ({
  httpClient: {
    get: vi.fn(),
  },
}));

// Validates: Requirements 4.1, 4.2, 4.3, 4.4
describe("roadmapService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRoadmap", () => {
    it("GETs /api/v1/roadmap and resolves with data.data", async () => {
      const payload = {
        planned: [{ id: "1", title: "Feature A" }],
        in_progress: [],
        completed: [],
      };
      httpClient.get.mockResolvedValue({ data: { data: payload } });

      const result = await roadmapService.getRoadmap();

      expect(httpClient.get).toHaveBeenCalledWith("/api/v1/roadmap");
      expect(result).toEqual(payload);
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("network error");
      httpClient.get.mockRejectedValue(error);

      await expect(roadmapService.getRoadmap()).rejects.toBe(error);
    });
  });
});
