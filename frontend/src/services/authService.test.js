import { describe, it, expect, vi, beforeEach } from "vitest";

import { httpClient } from "./httpClient";
import { authService } from "./authService";

// httpClient is mocked at the module level so each authService function's
// interaction with it (method, URL, body) and the raw resolved/rejected
// shape can be asserted directly, without a real network call.
vi.mock("./httpClient", () => ({
  httpClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Validates: Requirements 17.2, 18.2, 19.3
describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendVerification", () => {
    it("POSTs to /api/v1/auth/send-verification with no body and resolves with data.data", async () => {
      httpClient.post.mockResolvedValue({ data: { data: { token: "raw-verification-token" } } });

      const result = await authService.sendVerification();

      expect(httpClient.post).toHaveBeenCalledWith("/api/v1/auth/send-verification");
      expect(result).toEqual({ token: "raw-verification-token" });
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("network error");
      httpClient.post.mockRejectedValue(error);

      await expect(authService.sendVerification()).rejects.toBe(error);
    });
  });

  describe("verifyEmail", () => {
    it("POSTs to /api/v1/auth/verify-email with { token } and resolves with the full response data", async () => {
      const responseData = { success: true, message: "Email verified.", data: null };
      httpClient.post.mockResolvedValue({ data: responseData });

      const result = await authService.verifyEmail("raw-token");

      expect(httpClient.post).toHaveBeenCalledWith("/api/v1/auth/verify-email", { token: "raw-token" });
      expect(result).toBe(responseData);
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("invalid token");
      httpClient.post.mockRejectedValue(error);

      await expect(authService.verifyEmail("bad-token")).rejects.toBe(error);
    });
  });

  describe("forgotPassword", () => {
    it("POSTs to /api/v1/auth/forgot-password with { email } and resolves with the full response data", async () => {
      const responseData = {
        success: true,
        message: "If an account exists, a reset link has been generated.",
        data: null,
      };
      httpClient.post.mockResolvedValue({ data: responseData });

      const result = await authService.forgotPassword("user@example.com");

      expect(httpClient.post).toHaveBeenCalledWith("/api/v1/auth/forgot-password", {
        email: "user@example.com",
      });
      expect(result).toBe(responseData);
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("network error");
      httpClient.post.mockRejectedValue(error);

      await expect(authService.forgotPassword("user@example.com")).rejects.toBe(error);
    });
  });

  describe("resetPassword", () => {
    it("POSTs to /api/v1/auth/reset-password with { token, new_password } and resolves with the full response data", async () => {
      const responseData = { success: true, message: "Password updated.", data: null };
      httpClient.post.mockResolvedValue({ data: responseData });

      const result = await authService.resetPassword("raw-token", "newpassword123");

      expect(httpClient.post).toHaveBeenCalledWith("/api/v1/auth/reset-password", {
        token: "raw-token",
        new_password: "newpassword123",
      });
      expect(result).toBe(responseData);
    });

    it("rejects with the httpClient error unchanged", async () => {
      const error = new Error("invalid token");
      httpClient.post.mockRejectedValue(error);

      await expect(authService.resetPassword("bad-token", "newpassword123")).rejects.toBe(error);
    });
  });
});
