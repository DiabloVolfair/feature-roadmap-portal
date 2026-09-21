import { describe, it, expect, vi, beforeEach } from "vitest";

import { httpClient } from "./httpClient";
import { featureVoteService } from "./featureVoteService";

// httpClient is mocked at the module level so each featureVoteService
// function's interaction with it (method, URL) and the raw resolved/
// rejected shape can be asserted directly, without a real network call.
vi.mock("./httpClient", () => ({
  httpClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Validates: Requirements 8.2, 8.3
describe("featureVoteService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("toggleVote", () => {
    it("POSTs /api/v1/features/{id}/vote and resolves with data.data", async () => {
      httpClient.post.mockResolvedValue({
        data: { data: { voted: true, vote_count: 5 } },
      });

      const result = await featureVoteService.toggleVote("abc123");

      expect(httpClient.post).toHaveBeenCalledWith(
        "/api/v1/features/abc123/vote",
      );
      expect(result).toEqual({ voted: true, vote_count: 5 });
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("conflict");
      httpClient.post.mockRejectedValue(error);

      await expect(featureVoteService.toggleVote("abc123")).rejects.toBe(error);
    });
  });

  describe("getVoteStatus", () => {
    it("GETs /api/v1/features/{id}/vote-status and resolves with data.data", async () => {
      httpClient.get.mockResolvedValue({
        data: { data: { has_voted: false, vote_count: 3 } },
      });

      const result = await featureVoteService.getVoteStatus("abc123");

      expect(httpClient.get).toHaveBeenCalledWith(
        "/api/v1/features/abc123/vote-status",
      );
      expect(result).toEqual({ has_voted: false, vote_count: 3 });
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("not found");
      httpClient.get.mockRejectedValue(error);

      await expect(featureVoteService.getVoteStatus("abc123")).rejects.toBe(
        error,
      );
    });
  });
});
