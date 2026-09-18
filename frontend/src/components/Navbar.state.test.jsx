import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { selectNavbarState } from "./Navbar";

// Feature: sprint-1b-authentication-completion, Property 13: the Navbar's
// state-selection function picks exactly one of four states as a pure
// function of authentication, verification, and role.
// Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5, 20.6
describe("selectNavbarState", () => {
  test("returns exactly one of the five documented outcomes, determined solely by loading/isAuthenticated/is_verified/role", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.string(),
        (loading, isAuthenticated, is_verified, role) => {
          const outcome = selectNavbarState({
            loading,
            isAuthenticated,
            is_verified,
            role,
          });

          expect([
            "loading",
            "guest",
            "unverified",
            "verified-user",
            "admin",
          ]).toContain(outcome);

          const expected = loading
            ? "loading"
            : !isAuthenticated
              ? "guest"
              : !is_verified
                ? "unverified"
                : role === "admin"
                  ? "admin"
                  : "verified-user";
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
            selectNavbarState({ loading: true, isAuthenticated, is_verified, role })
          ).toBe("loading");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("loading=false, isAuthenticated=false yields 'guest'", () => {
    expect(
      selectNavbarState({
        loading: false,
        isAuthenticated: false,
        is_verified: false,
        role: undefined,
      })
    ).toBe("guest");
  });

  test("loading=false, isAuthenticated=true, is_verified=false yields 'unverified'", () => {
    expect(
      selectNavbarState({
        loading: false,
        isAuthenticated: true,
        is_verified: false,
        role: "user",
      })
    ).toBe("unverified");
  });

  test("loading=false, isAuthenticated=true, is_verified=true, role='user' yields 'verified-user'", () => {
    expect(
      selectNavbarState({
        loading: false,
        isAuthenticated: true,
        is_verified: true,
        role: "user",
      })
    ).toBe("verified-user");
  });

  test("loading=false, isAuthenticated=true, is_verified=true, role='admin' yields 'admin'", () => {
    expect(
      selectNavbarState({
        loading: false,
        isAuthenticated: true,
        is_verified: true,
        role: "admin",
      })
    ).toBe("admin");
  });
});
