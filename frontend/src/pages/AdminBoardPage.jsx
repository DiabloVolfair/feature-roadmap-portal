import { useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminBoard, useUpdateFeatureStatus } from "../hooks/useAdminBoard";
import KanbanColumn from "../components/KanbanColumn";
import KanbanFeatureCard from "../components/KanbanFeatureCard";

const COLUMNS = [
  { status: "under_review", label: "Under Review" },
  { status: "planned",      label: "Planned" },
  { status: "in_progress",  label: "In Progress" },
  { status: "completed",    label: "Completed" },
];

export function computeStats(board) {
  if (!board) return null;
  const all = Object.values(board).flat();
  return {
    total:         all.length,
    under_review:  board.under_review?.length ?? 0,
    planned:       board.planned?.length ?? 0,
    in_progress:   board.in_progress?.length ?? 0,
    completed:     board.completed?.length ?? 0,
    totalVotes:    all.reduce((s, f) => s + (f.vote_count ?? 0), 0),
    totalComments: all.reduce((s, f) => s + (f.comment_count ?? 0), 0),
  };
}

function AdminBoardPage() {
  const queryClient = useQueryClient();
  const { data: board, isLoading, isError } = useAdminBoard();
  const updateStatus = useUpdateFeatureStatus();
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeFeature = activeId
    ? Object.values(board ?? {}).flat().find(f => f.id === activeId)
    : null;

  function handleDragStart({ active }) {
    setActiveId(active.id);
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || over.id === active.data.current?.status) return;
    updateStatus.mutate({ featureId: active.id, status: over.id });
  }

  const stats = computeStats(board);

  if (isLoading) {
    return (
      <div className="p-6">
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          role="status"
          aria-label="Loading board"
        >
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
        <p className="text-slate-600 mb-4">Failed to load the board.</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["adminBoard"] })}
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
        <h1 className="text-2xl font-bold text-slate-900">Feature Board</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["adminBoard"] })}
          className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          ↻ Refresh
        </button>
      </div>

      {stats && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            ["Total", stats.total],
            ["Under Review", stats.under_review],
            ["Planned", stats.planned],
            ["In Progress", stats.in_progress],
            ["Completed", stats.completed],
            ["Votes", stats.totalVotes],
            ["Comments", stats.totalComments],
          ].map(([label, value]) => (
            <div key={label} className="bg-white border border-slate-200 rounded-lg p-3 text-center">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-xl font-bold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 min-w-[640px]">
            {COLUMNS.map(({ status, label }) => (
              <KanbanColumn
                key={status}
                status={status}
                label={label}
                features={board?.[status] ?? []}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeFeature ? <KanbanFeatureCard feature={activeFeature} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default AdminBoardPage;
