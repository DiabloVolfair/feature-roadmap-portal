import { useEffect, useState } from "react";
import { dashboardService } from "../services/dashboardService";

/**
 * AdminDashboardPage is a minimal demonstration page rendered at `/admin`,
 * reached only through AdminRoute. It calls the Dashboard_Service's
 * admin-dashboard function on mount and renders the resolved message, or a
 * generic error state on any failure.
 *
 * Requirements: 16.3, 16.4
 */
function AdminDashboardPage() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    dashboardService
      .getAdminDashboard()
      .then((data) => {
        setMessage(data.message);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  if (status === "loading") {
    return <p className="text-slate-600">Loading...</p>;
  }

  if (status === "error") {
    return (
      <p className="text-slate-600">Something went wrong loading the admin dashboard.</p>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-2">
      <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
      <p className="text-slate-700">{message}</p>
    </div>
  );
}

export default AdminDashboardPage;
