import { useEffect, useState } from "react";
import { dashboardService } from "../services/dashboardService";

/**
 * DashboardPage calls the Dashboard_Service's user-dashboard function on
 * mount and renders its resolved message, a not-yet-verified state on a
 * 403 response, or a generic error state otherwise. It contains no
 * business logic beyond calling the Dashboard_Service and rendering its
 * resolved message or a failure state.
 *
 * Requirements: 16.1, 16.2, 16.4
 */
function DashboardPage() {
  const [state, setState] = useState({ status: "loading", message: null });

  useEffect(() => {
    dashboardService
      .getUserDashboard()
      .then(({ message }) => setState({ status: "ready", message }))
      .catch((error) => {
        if (error?.response?.status === 403) {
          setState({ status: "unverified", message: null });
        } else {
          setState({ status: "error", message: null });
        }
      });
  }, []);

  return (
    <div className="max-w-sm mx-auto mt-12 p-6 rounded-lg border border-slate-200 bg-white shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Dashboard</h1>
      {state.status === "loading" && <p className="text-sm text-slate-600">Loading...</p>}
      {state.status === "unverified" && (
        <p className="text-sm text-slate-600">Please verify your email to access the dashboard.</p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-red-600">Something went wrong loading your dashboard.</p>
      )}
      {state.status === "ready" && <p className="text-sm text-slate-700">{state.message}</p>}
    </div>
  );
}

export default DashboardPage;
