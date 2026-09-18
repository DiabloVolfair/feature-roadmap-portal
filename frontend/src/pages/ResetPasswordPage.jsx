import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { authService } from "../services/authService";

/**
 * validateResetPasswordForm is a pure function that independently validates
 * the new-password and confirm-password fields and returns a map of field
 * errors ({} means the form is valid).
 *
 * Requirements: 19.2
 */
export function validateResetPasswordForm({ newPassword, confirmPassword }) {
  const errors = {};
  if (newPassword.length < 8) {
    errors.newPassword = "Password must be at least 8 characters.";
  }
  if (confirmPassword !== newPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}

/**
 * ResetPasswordPage renders the new-password form for a password reset
 * link. It reads the `token` value from the URL query string and delegates
 * the actual reset call to the Frontend_Auth_Service.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5
 */
function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  async function handleSubmit(event) {
    event.preventDefault();

    const errors = validateResetPasswordForm({ newPassword, confirmPassword });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setIsSubmitting(true);
    try {
      await authService.resetPassword(token, newPassword);
      toast.success("Password updated.");
      navigate("/login");
    } catch (error) {
      toast.error(error?.response?.data?.message || "This reset link is invalid or has expired.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="newPassword" className="text-sm font-medium text-slate-700">
            New Password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
          {fieldErrors.newPassword && (
            <p className="text-sm text-red-600">{fieldErrors.newPassword}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
          {fieldErrors.confirmPassword && (
            <p className="text-sm text-red-600">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Reset Password
        </button>
      </form>
    </div>
  );
}

export default ResetPasswordPage;
