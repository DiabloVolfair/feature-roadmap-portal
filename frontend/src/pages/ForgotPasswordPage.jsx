import { useState } from "react";
import { toast } from "sonner";
import { isValidEmailFormat } from "./LoginPage";
import { authService } from "../services/authService";

/**
 * Pure validator for the ForgotPasswordPage form. Reuses the
 * `isValidEmailFormat` rule established in Sprint 1A's LoginPage. Returns a
 * map of field name to error message; an empty object means the form is
 * valid.
 *
 * Requirements: 18.2, 18.3
 */
export function validateForgotPasswordForm({ email }) {
  const errors = {};
  if (!email.trim() || !isValidEmailFormat(email)) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}

/**
 * ForgotPasswordPage renders a single-field form that requests a password
 * reset email. It always shows the same success message regardless of
 * whether an account exists for the submitted email, matching the
 * Forgot_Password_Endpoint's identical-response behavior. The user stays on
 * the page after a successful submission, since there is no next step to
 * navigate to until they follow the reset link separately.
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
 */
function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const errors = validateForgotPasswordForm({ email });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.forgotPassword(email);
      toast.success("If an account exists, a reset link has been generated.");
    } catch (error) {
      toast.error(error?.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-12 p-6 rounded-lg border border-slate-200 bg-white shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Forgot Password</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldErrors.email && (
            <p id="email-error" className="mt-1 text-sm text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? "Sending..." : "Send Reset Link"}
        </button>
      </form>
    </div>
  );
}

export default ForgotPasswordPage;
