import { Link } from "react-router-dom";
import { useAnalytics } from "../hooks/useAdminBoard";

const NAV_CARDS = [
  { to: "/admin/board", title: "Kanban Board", description: "Drag and drop features between status columns.", icon: "📋" },
  { to: "/admin/analytics", title: "Analytics", description: "Live feature request and engagement statistics.", icon: "📊" },
  { to: "/admin/audit", title: "Audit Log", description: "History of all admin moderation actions.", icon: "📝" },
];

function AdminDashboardPage() {
  const { data, isLoading } = useAnalytics();

  const summaryStats = [
    { label: "Total Requests", value: data?.features?.total ?? 0 },
    { label: "Total Users", value: data?.users?.total ?? 0 },
    { label: "Total Votes", value: data?.engagement?.total_votes ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
        <p className="text-slate-500 mt-1">Manage your feature roadmap portal.</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        {summaryStats.map(({ label, value }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            {isLoading ? (
              <div className="h-8 w-16 mx-auto bg-slate-200 rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-slate-900">{value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Navigation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {NAV_CARDS.map(({ to, title, description, icon }) => (
          <Link key={to} to={to}
            className="block rounded-xl border-2 border-slate-200 bg-white p-5 hover:border-indigo-300 transition-colors">
            <div className="text-3xl mb-3">{icon}</div>
            <h2 className="font-semibold text-slate-900 mb-1">{title}</h2>
            <p className="text-sm text-slate-500">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default AdminDashboardPage;
