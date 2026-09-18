import { useHealthCheck } from "../hooks/useHealthCheck";
import { mapHealthState } from "../services/healthService";

const STATE_CONTENT = {
  checking: {
    text: "⏳ Checking...",
    className: "bg-slate-100 text-slate-600",
  },
  connected: {
    text: "🟢 Backend Connected",
    className: "bg-green-50 text-green-700",
  },
  disconnected: {
    text: "🔴 Backend Offline",
    className: "bg-red-50 text-red-700",
  },
};

/**
 * BackendStatusCard displays the current connectivity state of the
 * Backend_Application, derived from useHealthCheck() via mapHealthState().
 *
 * Requirements: 4.4, 12.2, 12.3, 12.4
 */
function BackendStatusCard() {
  const { isLoading, isError, data } = useHealthCheck();
  const state = mapHealthState({ isLoading, isError, data });
  const { text, className } = STATE_CONTENT[state];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">Backend Status</p>
      <p
        className={`mt-2 inline-flex items-center rounded-md px-3 py-1 text-sm font-medium ${className}`}
      >
        {text}
      </p>
    </div>
  );
}

export default BackendStatusCard;
