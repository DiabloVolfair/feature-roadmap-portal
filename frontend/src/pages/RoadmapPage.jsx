import { useQueryClient } from "@tanstack/react-query";
import { useRoadmap } from "../hooks/useRoadmap";
import { statusBadgeClass } from "../utils/badgeColors";
import RoadmapHeader from "../components/RoadmapHeader";
import RoadmapColumn from "../components/RoadmapColumn";

const COLUMNS = [
  { status: "planned",     label: "Planned" },
  { status: "in_progress", label: "In Progress" },
  { status: "completed",   label: "Completed" },
];

const STATUS_LEGEND = [
  { status: "planned",     label: "Planned" },
  { status: "in_progress", label: "In Progress" },
  { status: "completed",   label: "Completed" },
];

function RoadmapPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useRoadmap();

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
             role="status" aria-label="Loading roadmap">
          {COLUMNS.map(c => (
            <div key={c.status} className="bg-slate-100 rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-600 mb-4">Failed to load the roadmap. Please try again.</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["roadmap"] })}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <main aria-label="Public roadmap" className="p-6 space-y-6">
      <RoadmapHeader
        totalPlanned={data?.planned?.length ?? 0}
        totalInProgress={data?.in_progress?.length ?? 0}
        totalCompleted={data?.completed?.length ?? 0}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {COLUMNS.map(({ status, label }) => (
          <RoadmapColumn
            key={status}
            status={status}
            label={label}
            features={data?.[status] ?? []}
          />
        ))}
      </div>

      <section aria-label="Status legend" className="mt-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Status Legend</h2>
        <div className="flex flex-wrap gap-3">
          {STATUS_LEGEND.map(({ status, label }) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(status)}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default RoadmapPage;
