import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import KanbanFeatureCard from "./KanbanFeatureCard";

/**
 * KanbanColumn renders a single status column in the Kanban board.
 * It accepts drops from dragged KanbanFeatureCard items and renders
 * a scrollable list of features within a SortableContext.
 *
 * Props:
 *   status  — the status key used as the droppable id (e.g. "under_review")
 *   label   — human-readable column header (e.g. "Under Review")
 *   features — array of feature objects belonging to this column
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 18.2
 */
function KanbanColumn({ status, label, features }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className="flex flex-col bg-slate-50 rounded-xl border border-slate-200"
      aria-label={`${label} column`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">{label}</h2>
        <span className="text-xs font-medium bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">
          {features.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto max-h-[calc(100vh-16rem)] p-2 flex flex-col gap-2 transition-colors ${
          isOver ? "bg-indigo-50 border-2 border-indigo-300 rounded-b-xl" : ""
        }`}
      >
        <SortableContext items={features.map(f => f.id)} strategy={verticalListSortingStrategy}>
          {features.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-300 rounded-lg min-h-[80px] text-xs text-slate-400">
              No features here
            </div>
          ) : (
            features.map(feature => (
              <KanbanFeatureCard key={feature.id} feature={feature} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export default KanbanColumn;
