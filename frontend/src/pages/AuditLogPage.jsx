import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuditLogs } from "../hooks/useAdminBoard";

const ACTION_OPTIONS = [
  { value: "",                  label: "All actions" },
  { value: "status_changed",    label: "Status Changed" },
  { value: "feature_deleted",   label: "Feature Deleted" },
  { value: "feature_archived",  label: "Feature Archived" },
  { value: "feature_restored",  label: "Feature Restored" },
  { value: "feature_pinned",    label: "Feature Pinned" },
  { value: "feature_unpinned",  label: "Feature Unpinned" },
];

const ACTION_BADGE_STYLES = {
  status_changed:   "bg-blue-100 text-blue-800",
  feature_deleted:  "bg-red-100 text-red-800",
  feature_archived: "bg-orange-100 text-orange-800",
  feature_restored: "bg-green-100 text-green-800",
  feature_pinned:   "bg-purple-100 text-purple-800",
  feature_unpinned: "bg-slate-100 text-slate-700",
};

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActionBadge({ action }) {
  const optionLabel = ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
  const style = ACTION_BADGE_STYLES[action] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style}`}>
      {optionLabel}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse" role="status" aria-label="Loading">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-200 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

function AuditLogPage() {
  const [page, setPage]     = useState(1);
  const [limit]             = useState(20);
  const [action, setAction] = useState("");

  const queryClient = useQueryClient();
  const params = { page, limit, action };
  const { data, isLoading, isError } = useAuditLogs(params);

  function handleActionChange(e) {
    setAction(e.target.value);
    setPage(1);
  }

  const items      = data?.items ?? [];
  const pagination = data?.pagination ?? {};

  if (isError) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-slate-600">Failed to load audit log data.</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["auditLogs"] })}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>

        {/* Action filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="action-filter" className="text-sm text-slate-600">
            Filter:
          </label>
          <select
            id="action-filter"
            value={action}
            onChange={handleActionChange}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Admin
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Feature
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Action
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Change
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    No audit entries found.
                  </td>
                </tr>
              ) : (
                items.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {entry.admin_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {entry.feature_title}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {entry.old_value != null || entry.new_value != null ? (
                        <span>
                          <span className="text-slate-500">{entry.old_value ?? "—"}</span>
                          {" → "}
                          <span className="text-slate-800">{entry.new_value ?? "—"}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(entry.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Page {page}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={!pagination.has_previous}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!pagination.has_next}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuditLogPage;
