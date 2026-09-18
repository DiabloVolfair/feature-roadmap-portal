import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  httpClient,
  registerAccessTokenGetter,
  registerAccessTokenSetter,
  registerAuthFailureHandler,
} from "./httpClient";

// Validates: Requirements 19.8, 20.6 (access token refresh-and-retry flow)
//
// httpClient's interceptors are exercised end-to-end by swapping in a mock
// axios adapter (the standard way to test axios interceptors without a real
// network call) instead of mocking axios itself, so the actual request and
// response interceptor pipeline registered on the shared instance runs for
// real during these tests.

function makeError(status, config) {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data: {}, config };
  error.config = config;
  return error;
}

describe("httpClient auth refresh interceptor", () => {
  let adapter;

  beforeEach(() => {
    adapter = vi.fn();
    httpClient.defaults.adapter = adapter;

    // Reset registrations to a clean, known state before each test.
    registerAccessTokenGetter(() => "initial-token");
    registerAccessTokenSetter(() => {});
    registerAuthFailureHandler(() => {});
  });

  it("refreshes the token once and retries the original request, attaching the new token", async () => {
    let currentToken = "expired-token";
    registerAccessTokenGetter(() => currentToken);
    const setterSpy = vi.fn((token) => {
      currentToken = token;
    });
    registerAccessTokenSetter(setterSpy);

    adapter.mockImplementation((config) => {
      if (config.url === "/api/v1/protected") {
        if (config.headers.Authorization === "Bearer expired-token") {
          return Promise.reject(makeError(401, config));
        }
        if (config.headers.Authorization === "Bearer fresh-token") {
          return Promise.resolve({ status: 200, data: { ok: true }, config, headers: {} });
        }
      }
      if (config.url === "/api/v1/auth/refresh") {
        return Promise.resolve({
          status: 200,
          data: { data: { access_token: "fresh-token" } },
          config,
          headers: {},
        });
      }
      return Promise.reject(new Error(`Unexpected request to ${config.url}`));
    });

    const response = await httpClient.get("/api/v1/protected");

    expect(response.data).toEqual({ ok: true });
    expect(setterSpy).toHaveBeenCalledWith("fresh-token");
    const refreshCalls = adapter.mock.calls.filter(
      ([config]) => config.url === "/api/v1/auth/refresh"
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("logs the user out via the auth-failure handler when the refresh call itself fails, and propagates the refresh error", async () => {
    registerAccessTokenGetter(() => "expired-token");
    const failureHandler = vi.fn();
    registerAuthFailureHandler(failureHandler);

    adapter.mockImplementation((config) => {
      if (config.url === "/api/v1/protected") {
        return Promise.reject(makeError(401, config));
      }
      if (config.url === "/api/v1/auth/refresh") {
        return Promise.reject(makeError(401, config));
      }
      return Promise.reject(new Error(`Unexpected request to ${config.url}`));
    });

    await expect(httpClient.get("/api/v1/protected")).rejects.toBeTruthy();

    expect(failureHandler).toHaveBeenCalledTimes(1);
    const refreshCalls = adapter.mock.calls.filter(
      ([config]) => config.url === "/api/v1/auth/refresh"
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("coalesces two concurrent 401s into a single refresh call", async () => {
    let currentToken = "expired-token";
    registerAccessTokenGetter(() => currentToken);
    registerAccessTokenSetter((token) => {
      currentToken = token;
    });

    adapter.mockImplementation((config) => {
      if (config.url === "/api/v1/one" || config.url === "/api/v1/two") {
        if (config.headers.Authorization === "Bearer expired-token") {
          return Promise.reject(makeError(401, config));
        }
        return Promise.resolve({ status: 200, data: { url: config.url }, config, headers: {} });
      }
      if (config.url === "/api/v1/auth/refresh") {
        return Promise.resolve({
          status: 200,
          data: { data: { access_token: "fresh-token" } },
          config,
          headers: {},
        });
      }
      return Promise.reject(new Error(`Unexpected request to ${config.url}`));
    });

    const [resOne, resTwo] = await Promise.all([
      httpClient.get("/api/v1/one"),
      httpClient.get("/api/v1/two"),
    ]);

    expect(resOne.data).toEqual({ url: "/api/v1/one" });
    expect(resTwo.data).toEqual({ url: "/api/v1/two" });

    const refreshCalls = adapter.mock.calls.filter(
      ([config]) => config.url === "/api/v1/auth/refresh"
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("does not trigger the refresh flow for a 401 from an auth-flow endpoint like login", async () => {
    const failureHandler = vi.fn();
    registerAuthFailureHandler(failureHandler);

    adapter.mockImplementation((config) => {
      if (config.url === "/api/v1/auth/login") {
        return Promise.reject(makeError(401, config));
      }
      return Promise.reject(new Error(`Unexpected request to ${config.url}`));
    });

    await expect(
      httpClient.post("/api/v1/auth/login", { email: "a@b.com", password: "x" })
    ).rejects.toBeTruthy();

    const refreshCalls = adapter.mock.calls.filter(
      ([config]) => config.url === "/api/v1/auth/refresh"
    );
    expect(refreshCalls).toHaveLength(0);
    expect(failureHandler).not.toHaveBeenCalled();
  });

  it("does not attempt a second refresh when the retried request still 401s", async () => {
    registerAccessTokenGetter(() => "expired-token");
    registerAccessTokenSetter(() => {});
    const failureHandler = vi.fn();
    registerAuthFailureHandler(failureHandler);

    adapter.mockImplementation((config) => {
      if (config.url === "/api/v1/protected") {
        // Always 401s, even after "refresh" issues a new token.
        return Promise.reject(makeError(401, config));
      }
      if (config.url === "/api/v1/auth/refresh") {
        return Promise.resolve({
          status: 200,
          data: { data: { access_token: "still-no-good-token" } },
          config,
          headers: {},
        });
      }
      return Promise.reject(new Error(`Unexpected request to ${config.url}`));
    });

    await expect(httpClient.get("/api/v1/protected")).rejects.toBeTruthy();

    const protectedCalls = adapter.mock.calls.filter(
      ([config]) => config.url === "/api/v1/protected"
    );
    const refreshCalls = adapter.mock.calls.filter(
      ([config]) => config.url === "/api/v1/auth/refresh"
    );
    // Original request + exactly one retry, never more.
    expect(protectedCalls).toHaveLength(2);
    expect(refreshCalls).toHaveLength(1);
  });
});
