import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { categoryBadgeClass, statusBadgeClass } from "../utils/badgeColors";

function KanbanFeatureCard({ feature }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: feature.id,
    data: { status: feature.status },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
      <button
        {...attributes}
        {...listeners}
        aria-label={`Drag ${feature.title} to reorder`}
        className="cursor-grab text-slate-400 hover:text-slate-600 mb-1 block"
      >
        ⠿
      </button>
      <p className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">{feature.title}</p>
      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryBadgeClass(feature.category)}`}>
          {feature.category.replace(/_/g, " ")}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(feature.status)}`}>
          {feature.status.replace(/_/g, " ")}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
        <span>▲ {feature.vote_count}</span>
        <span>💬 {feature.comment_count}</span>
      </div>
      <p className="text-xs text-slate-400 mb-2">
        by {feature.author_name} · {new Date(feature.created_at).toLocaleDateString()}
      </p>
      <Link to={`/features/${feature.id}`} className="text-xs text-indigo-600 hover:underline">
        View feature →
      </Link>
    </div>
  );
}

export default KanbanFeatureCard;
