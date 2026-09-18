import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { shouldCallVerifyEmail } from "./VerifyEmailPage";

// Feature: sprint-1b-authentication-completion, Property 10: VerifyEmailPage
// calls the Verify_Email_Endpoint if and only if a non-empty `token` query
// parameter is present.
// Validates: Requirements 17.1, 17.5
describe("shouldCallVerifyEmail", () => {
  test("returns true if and only if token is defined and non-empty after trimming", () => {
    fc.assert(
      fc.property(fc.string(), (token) => {
        const expected = token !== undefined && token !== null && token.trim().length > 0;
        expect(shouldCallVerifyEmail(token)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  test("returns false for null (missing query parameter, per useSearchParams().get())", () => {
    expect(shouldCallVerifyEmail(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(shouldCallVerifyEmail(undefined)).toBe(false);
  });

  test("returns false for an empty string", () => {
    expect(shouldCallVerifyEmail("")).toBe(false);
  });

  test("returns false for a whitespace-only string", () => {
    expect(shouldCallVerifyEmail("   \t\n  ")).toBe(false);
  });

  test("returns true for a non-empty token", () => {
    expect(shouldCallVerifyEmail("abc123")).toBe(true);
  });
});
