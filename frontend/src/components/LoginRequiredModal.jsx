import { useNavigate } from "react-router-dom";

/**
 * LoginRequiredModal prompts a guest (unauthenticated viewer) to log in when
 * they attempt to vote. It renders only when `isOpen` is true (returns null
 * otherwise), displaying the exact message `Log in to vote for feature
 * requests.` and three actions: Login, Signup, and Cancel (Req 14.1, 14.3).
 *
 * Login and Signup navigate to `/login` and `/signup` respectively, but only
 * in response to an explicit activation of those actions — there is no
 * navigation on open (Req 14.4). Cancel invokes `onClose`, closing the modal
 * without navigating away and without casting a vote (Req 14.5).
 *
 * Requirements: 14.1, 14.3, 14.4, 14.5
 */
function LoginRequiredModal({ isOpen, onClose }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-required-modal-title"
    >
      <div className="max-w-md mx-auto p-6 rounded-lg border border-slate-200 bg-white shadow-sm w-full">
        <h2 id="login-required-modal-title" className="text-xl font-semibold text-slate-900 mb-2">
          Log in to vote
        </h2>
        <p className="text-sm text-slate-700 mb-6">Log in to vote for feature requests.</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => navigate("/signup")}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300"
          >
            Signup
          </button>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginRequiredModal;
