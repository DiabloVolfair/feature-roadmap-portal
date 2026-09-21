import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { useHealthCheck } from "./hooks/useHealthCheck";

vi.mock("./hooks/useHealthCheck");

// App.jsx's AuthProvider performs a real startup session check (refresh()
// then getCurrentUser()) on mount. Without mocking authService, that call
// would hit the real httpClient/axios stack in jsdom (no backend present),
// which is slow/noisy and - for the new /dashboard and /admin cases below -
// non-deterministic. Mocking authService here mirrors the pattern already
// established in ProtectedRoute.test.jsx/AdminRoute.test.jsx. refresh()
// defaults to rejecting (no session), matching the pre-existing tests'
// implicit logged-out expectations for HomePage/LoginPage/etc.
vi.mock("./services/authService", () => ({
  authService: {
    refresh: vi.fn(),
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    signup: vi.fn(),
    sendVerification: vi.fn(),
    verifyEmail: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

vi.mock("./services/dashboardService", () => ({
  dashboardService: {
    getUserDashboard: vi.fn(),
    getAdminDashboard: vi.fn(),
  },
}));

// HomePage (rendered at /) now calls useFeatureFeed, which wraps
// featureService.getFeatures in a React Query hook. Mocking featureService
// (rather than the hook) keeps this file's routing-focused tests exercising
// the real Feature_Hooks wiring while avoiding a real network call in jsdom.
vi.mock("./services/featureService", () => ({
  featureService: {
    getFeatures: vi.fn(),
    getFeature: vi.fn(),
    createFeature: vi.fn(),
    updateFeature: vi.fn(),
    deleteFeature: vi.fn(),
  },
}));

// RoadmapPage calls useRoadmap → roadmapService.getRoadmap via React Query.
// Mock it to resolve immediately so the page reaches its loaded state.
vi.mock("./services/roadmapService", () => ({
  roadmapService: {
    getRoadmap: vi.fn(),
  },
}));

import { authService } from "./services/authService";
import { featureService } from "./services/featureService";
import { roadmapService } from "./services/roadmapService";

// App.jsx renders a BrowserRouter, so routes are exercised by pushing the
// desired path onto jsdom's history before rendering <App /> for each case.
// A fresh, retry-disabled QueryClient is provided per render (App.jsx itself
// has no QueryClientProvider - that's main.jsx's responsibility - so tests
// supply their own, matching how the real app is composed at the root).
function renderAppAtPath(path) {
  window.history.pushState({}, "", path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

describe("App routing", () => {
  beforeEach(() => {
    useHealthCheck.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    });
    // Default to a logged-out session so the pre-existing tests (which
    // never mocked authService before) keep their original behavior.
    authService.refresh.mockRejectedValue(new Error("no session"));
    // Default the feed to a pending promise; individual tests that render
    // HomePage's loaded state aren't needed here since HomePage's own
    // states are covered by HomePage.test.jsx - this file only asserts
    // routing.
    featureService.getFeatures.mockReturnValue(new Promise(() => {}));
    // Default the roadmap to immediate resolved data so RoadmapPage reaches
    // its loaded state and renders the "Public Roadmap" heading.
    roadmapService.getRoadmap.mockResolvedValue({
      planned: [],
      in_progress: [],
      completed: [],
    });
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    vi.clearAllMocks();
  });

  it("renders the HomePage at /", () => {
    renderAppAtPath("/");

    expect(
      screen.getByRole("heading", {
        name: "Feature Request & Public Roadmap Portal",
      })
    ).toBeInTheDocument();
  });

  it("renders the LoginPage at /login", () => {
    renderAppAtPath("/login");

    expect(
      screen.getByRole("heading", { name: /Login/i })
    ).toBeInTheDocument();
  });

  it("renders the SignupPage at /signup", () => {
    renderAppAtPath("/signup");

    expect(
      screen.getByRole("heading", { name: /Signup/i })
    ).toBeInTheDocument();
  });

  it("renders the RoadmapPage at /roadmap", async () => {
    renderAppAtPath("/roadmap");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Roadmap/i })
      ).toBeInTheDocument();
    });
  });

  it("renders the NotFoundPage at an undefined path", () => {
    renderAppAtPath("/nonexistent-path");

    expect(
      screen.getByRole("heading", { name: /Not Found/i })
    ).toBeInTheDocument();
  });

  it("renders the ForgotPasswordPage at /forgot-password", () => {
    renderAppAtPath("/forgot-password");

    expect(
      screen.getByRole("heading", { name: /Forgot Password/i })
    ).toBeInTheDocument();
  });

  it("renders the ResetPasswordPage at /reset-password", () => {
    renderAppAtPath("/reset-password");

    expect(
      screen.getByRole("heading", { name: /Reset Password/i })
    ).toBeInTheDocument();
  });

  it("renders the VerifyEmailPage at /verify-email", async () => {
    renderAppAtPath("/verify-email");

    // No `token` query param is present, so VerifyEmailPage settles into
    // its failed/no-token state without ever calling authService.verifyEmail.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Email Verification/i })
      ).toBeInTheDocument();
    });
    expect(authService.verifyEmail).not.toHaveBeenCalled();
  });

  // /dashboard is wrapped in ProtectedRoute. With no authenticated session
  // (the default beforeEach: refresh() rejects), ProtectedRoute redirects to
  // /login, so this asserts the redirect behavior rather than mounting
  // DashboardPage itself - the redirect is the behavior specific to this
  // route's wiring, while DashboardPage's own rendering is already covered
  // by DashboardPage.test.jsx and ProtectedRoute's rendering branches are
  // already covered by ProtectedRoute.test.jsx.
  it("redirects /dashboard to the LoginPage when not authenticated", async () => {
    renderAppAtPath("/dashboard");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Login/i })
      ).toBeInTheDocument();
    });
  });

  // /admin is wrapped in AdminRoute. With no authenticated session, AdminRoute
  // redirects to / (HomePage) rather than /login - see AdminRoute's own
  // rendering tests for the authenticated-non-admin and authenticated-admin
  // branches.
  it("redirects /admin to the HomePage when not an authenticated admin", async () => {
    renderAppAtPath("/admin");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Feature Request & Public Roadmap Portal",
        })
      ).toBeInTheDocument();
    });
  });
});
