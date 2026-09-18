import { describe, test, expect, vi } from "vitest";
import fc from "fast-check";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AdminRoute, { selectAdminRouteOutcome } from "./AdminRoute";
import { AuthProvider } from "../context/AuthContext";
import { authService } from "../services/authService";

// AdminRoute reads `useAuth()`, so rendering it requires an AuthProvider
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

function renderAdminRoute() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <div>AdminSecret</div>
              </AdminRoute>
            }
          />
          <Route path="/" element={<div>Home Page Marker</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

// Feature: sprint-1b-authentication-completion, Property 9: AdminRoute
// renders exactly one of three states as a pure function of `loading`,
// `isAuthenticated`, `is_verified`, and `role`.
// Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
describe("selectAdminRouteOutcome", () => {
  test("returns exactly one of the three documented outcomes, determined solely by loading/isAuthenticated/is_verified/role", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.string(),
        (loading, isAuthenticated, is_verified, role) => {
          const outcome = selectAdminRouteOutcome({
            loading,
            isAuthenticated,
            is_verified,
            role,
          });

          expect(["loading", "children", "redirect-home"]).toContain(outcome);

          const expected = loading
            ? "loading"
            : isAuthenticated && is_verified && role === "admin"
              ? "children"
              : "redirect-home";
          expect(outcome).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("loading=true always yields 'loading' regardless of everything else", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.string(),
        (isAuthenticated, is_verified, role) => {
          expect(
            selectAdminRouteOutcome({ loading: true, isAuthenticated, is_verified, role })
          ).toBe("loading");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("loading=false, isAuthenticated=true, is_verified=true, role='admin' yields 'children'", () => {
    expect(
      selectAdminRouteOutcome({
        loading: false,
        isAuthenticated: true,
        is_verified: true,
        role: "admin",
      })
    ).toBe("children");
  });

  test("loading=false and any of isAuthenticated=false / is_verified=false / role!=='admin' yields 'redirect-home'", () => {
    expect(
      selectAdminRouteOutcome({
        loading: false,
        isAuthenticated: false,
        is_verified: true,
        role: "admin",
      })
    ).toBe("redirect-home");

    expect(
      selectAdminRouteOutcome({
        loading: false,
        isAuthenticated: true,
        is_verified: false,
        role: "admin",
      })
    ).toBe("redirect-home");

    expect(
      selectAdminRouteOutcome({
        loading: false,
        isAuthenticated: true,
        is_verified: true,
        role: "user",
      })
    ).toBe("redirect-home");
  });
});

// Rendering-level tests: confirm AdminRoute actually redirects via
// <Navigate> or renders its children when mounted in a real router tree,
// rather than only exercising the pure decision function above.
// Validates: Requirements 14.4, 15.4, 15.5
describe("AdminRoute (rendering)", () => {
  test("redirects to / and does not render children when authenticated but not a verified admin", async () => {
    authService.refresh.mockResolvedValue("access-token");
    authService.getCurrentUser.mockResolvedValue({
      id: "1",
      email: "user@example.com",
      is_verified: true,
      role: "user", // authenticated + verified, but not an admin
    });

    renderAdminRoute();

    await waitFor(() => {
      expect(screen.getByText("Home Page Marker")).toBeInTheDocument();
    });
    expect(screen.queryByText("AdminSecret")).not.toBeInTheDocument();
  });

  test("renders children when authenticated as a verified admin", async () => {
    authService.refresh.mockResolvedValue("access-token");
    authService.getCurrentUser.mockResolvedValue({
      id: "1",
      email: "admin@example.com",
      is_verified: true,
      role: "admin",
    });

    renderAdminRoute();

    await waitFor(() => {
      expect(screen.getByText("AdminSecret")).toBeInTheDocument();
    });
    expect(screen.queryByText("Home Page Marker")).not.toBeInTheDocument();
  });
});
