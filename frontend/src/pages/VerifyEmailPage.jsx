import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { authService } from "../services/authService";

/**
 * Pure gate deciding whether VerifyEmailPage should call
 * authService.verifyEmail for a given raw `token` query-parameter value.
 * Returns true if and only if `token` is defined/non-null and non-empty
 * after trimming whitespace.
 *
 * Requirements: 17.1, 17.5
 */
export function shouldCallVerifyEmail(token) {
  return Boolean(token?.trim());
}

/**
 * VerifyEmailPage reads a `token` query parameter and, if and only if it is
 * present and non-empty after trimming, calls authService.verifyEmail with
 * it. On success it shows a success state, a toast, and navigates to
 * /login after a two-second delay. On failure or a missing/blank token it
 * shows a failure state and never navigates.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5
 */
function VerifyEmailPage() {
  const [status, setStatus] = useState("verifying");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  useEffect(() => {
    if (!shouldCallVerifyEmail(token)) {
      setStatus("failed");
      return;
    }
    const trimmedToken = token.trim();

    authService
      .verifyEmail(trimmedToken)
      .then(() => {
        setStatus("success");
        toast.success("Email verified successfully.");
        setTimeout(() => navigate("/login"), 2000);
      })
      .catch(() => {
        setStatus("failed");
        toast.error("This verification link is invalid or has expired.");
      });
  }, [token, navigate]);

  return (
    <div className="max-w-sm mx-auto mt-12 p-6 rounded-lg border border-slate-200 bg-white shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Email Verification</h1>
      {status === "verifying" && <p className="text-sm text-slate-600">Verifying your email...</p>}
      {status === "success" && (
        <p className="text-sm text-slate-700">
          Your email has been verified. Redirecting to login...
        </p>
      )}
      {status === "failed" && (
        <p className="text-sm text-red-600">This verification link is invalid or has expired.</p>
      )}
    </div>
  );
}

export default VerifyEmailPage;
