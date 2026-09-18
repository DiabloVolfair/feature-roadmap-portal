import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { validateResetPasswordForm } from "./ResetPasswordPage";

// Feature: sprint-1b-authentication-completion, Property 12:
// ResetPasswordPage calls the Reset_Password_Endpoint if and only if the
// new password is at least 8 characters and the confirmation matches.
// Validates: Requirements 19.2, 19.3
describe("validateResetPasswordForm", () => {
  test("returns no errors if and only if newPassword is >= 8 chars and confirmPassword matches", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (newPassword, confirmPassword) => {
        const result = validateResetPasswordForm({ newPassword, confirmPassword });
        const expectedValid = newPassword.length >= 8 && confirmPassword === newPassword;

        if (expectedValid) {
          expect(result).toEqual({});
        } else {
          expect(Object.keys(result).length).toBeGreaterThan(0);
          if (newPassword.length < 8) {
            expect(result).toHaveProperty("newPassword");
          }
          if (confirmPassword !== newPassword) {
            expect(result).toHaveProperty("confirmPassword");
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  test("returns a newPassword error when the password is too short (matching confirmation)", () => {
    const result = validateResetPasswordForm({ newPassword: "short", confirmPassword: "short" });
    expect(result).toHaveProperty("newPassword");
    expect(result).not.toHaveProperty("confirmPassword");
  });

  test("returns a confirmPassword error when the confirmation does not match", () => {
    const result = validateResetPasswordForm({
      newPassword: "longenough123",
      confirmPassword: "somethingelse",
    });
    expect(result).not.toHaveProperty("newPassword");
    expect(result).toHaveProperty("confirmPassword");
  });

  test("returns both errors when the password is too short and the confirmation does not match", () => {
    const result = validateResetPasswordForm({ newPassword: "short", confirmPassword: "nope" });
    expect(result).toHaveProperty("newPassword");
    expect(result).toHaveProperty("confirmPassword");
  });

  test("returns no errors for a valid, matching password pair", () => {
    const result = validateResetPasswordForm({
      newPassword: "longenough123",
      confirmPassword: "longenough123",
    });
    expect(result).toEqual({});
  });
});
