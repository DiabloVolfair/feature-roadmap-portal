import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { validateForgotPasswordForm } from "./ForgotPasswordPage";
import { isValidEmailFormat } from "./LoginPage";

// Feature: sprint-1b-authentication-completion, Property 11:
// ForgotPasswordPage calls the Forgot_Password_Endpoint if and only if the
// submitted email is non-empty and validly formatted.
// Validates: Requirements 18.2, 18.3
describe("validateForgotPasswordForm", () => {
  test("returns no errors if and only if email is non-empty (after trim) and validly formatted", () => {
    fc.assert(
      fc.property(fc.string(), (email) => {
        const result = validateForgotPasswordForm({ email });
        const expectedValid = email.trim().length > 0 && isValidEmailFormat(email);

        if (expectedValid) {
          expect(result).toEqual({});
        } else {
          expect(Object.keys(result).length).toBeGreaterThan(0);
          expect(result).toHaveProperty("email");
        }
      }),
      { numRuns: 100 }
    );
  });

  test("returns an error for an empty string", () => {
    const result = validateForgotPasswordForm({ email: "" });
    expect(result).toHaveProperty("email");
  });

  test("returns an error for a whitespace-only string", () => {
    const result = validateForgotPasswordForm({ email: "   \t\n  " });
    expect(result).toHaveProperty("email");
  });

  test("returns an error for an invalidly formatted email", () => {
    const result = validateForgotPasswordForm({ email: "not-an-email" });
    expect(result).toHaveProperty("email");
  });

  test("returns no errors for a validly formatted email", () => {
    const result = validateForgotPasswordForm({ email: "user@example.com" });
    expect(result).toEqual({});
  });
});
