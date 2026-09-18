import { describe, test, expect, vi } from "vitest";
import fc from "fast-check";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute, { selectProtectedRouteOutcome } from "./ProtectedRoute";
import { AuthProvider } from "../context/AuthContext";
import { authService } from "../services/authService";

// ProtectedRoute reads `useAuth()`, so rendering it requires an AuthProvider
// ancestor. authService is mocked so the provider's startup session-check
// effect settles deterministically without a real network call in jsdom.
vi.mock("../services/authService", () => ({
  authService: {
    refresh: vi.fn(),
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    signup: vi.fn(),
  },
}));

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Secret</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page Marker</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

// Feature: sprint-1b-authentication-completion, Property 8: ProtectedRoute
// renders exactly one of three states as a pure function of `loading` and
// `isAuthenticated`.
// Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5
describe("selectProtectedRouteOutcome", () => {
  test("returns exactly one of the three documented outcomes, determined solely by loading/isAuthenticated", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.string(),
        (loading, isAuthenticated, is_verified, role) => {
          const outcome = selectProtectedRouteOutcome({
            loading,
            isAuthenticated,
            // is_verified/role must have no effect on the outcome; passed
            // through to prove that.
            is_verified,
            role,
          });

          expect(["loading", "children", "redirect-login"]).toContain(outcome);

          const expected = loading
            ? "loading"
            : isAuthenticated
              ? "children"
              : "redirect-login";
          expect(outcome).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("loading=true always yields 'loading' regardless of isAuthenticated", () => {
    fc.assert(
      fc.property(fc.boolean(), (isAuthenticated) => {
        expect(selectProtectedRouteOutcome({ loading: true, isAuthenticated })).toBe("loading");
      }),
      { numRuns: 100 }
    );
  });

  test("loading=false, isAuthenticated=true yields 'children'", () => {
    expect(selectProtectedRouteOutcome({ loading: false, isAuthenticated: true })).toBe("children");
  });

  test("loading=false, isAuthenticated=false yields 'redirect-login'", () => {
    expect(selectProtectedRouteOutcome({ loading: false, isAuthenticated: false })).toBe("redirect-login");
  });
});

// Rendering-level tests: confirm ProtectedRoute actually redirects via
// <Navigate> or renders its children when mounted in a real router tree,
// rather than only exercising the pure decision function above.
// Validates: Requirements 14.4, 15.4, 15.5
describe("ProtectedRoute (rendering)", () => {
  test("redirects to /login and does not render children when not authenticated", async () => {
    authService.refresh.mockRejectedValue(new Error("no session"));

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText("Login Page Marker")).toBeInTheDocument();
    });
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });

  test("renders children when authenticated", async () => {
    authService.refresh.mockResolvedValue("access-token");
    authService.getCurrentUser.mockResolvedValue({
      id: "1",
      email: "user@example.com",
      is_verified: true,
      role: "user",
    });

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText("Secret")).toBeInTheDocument();
    });
    expect(screen.queryByText("Login Page Marker")).not.toBeInTheDocument();
  });
});
