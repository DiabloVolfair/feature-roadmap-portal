import { useQueryClient } from "@tanstack/react-query";
import { useAnalytics } from "../hooks/useAdminBoard";

const STAT_CARDS = [
  { label: "Total Requests",  getValue: (d) => d.features.total },
  { label: "Under Review",    getValue: (d) => d.features.under_review },
  { label: "Planned",         getValue: (d) => d.features.planned },
  { label: "In Progress",     getValue: (d) => d.features.in_progress },
  { label: "Completed",       getValue: (d) => d.features.completed },
  { label: "Archived",        getValue: (d) => d.features.archived },
  { label: "Pinned",          getValue: (d) => d.features.pinned },
  { label: "Total Users",     getValue: (d) => d.users.total },
  { label: "Verified Users",  getValue: (d) => d.users.verified },
  { label: "Total Votes",     getValue: (d) => d.engagement.total_votes },
  { label: "Total Comments",  getValue: (d) => d.engagement.total_comments },
];

function SkeletonCard() {
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2 animate-pulse"
      role="status"
      aria-label="Loading"
    >
      <div className="h-3 w-20 bg-slate-200 rounded" />
      <div className="h-8 w-12 bg-slate-200 rounded" />
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center">
      <dt className="text-xs text-slate-500 mb-1">{label}</dt>
      <dd className="text-3xl font-bold text-slate-900">{value}</dd>
    </div>
  );
}

function AnalyticsDashboard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useAnalytics();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {STAT_CARDS.map((card) => (
            <SkeletonCard key={card.label} />
          ))}
        </dl>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-slate-600">Failed to load analytics data.</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["analytics"] })}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["analytics"] })}
          className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          ↻ Refresh
        </button>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STAT_CARDS.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.getValue(data)} />
        ))}
      </dl>
    </div>
  );
}

export default AnalyticsDashboard;
