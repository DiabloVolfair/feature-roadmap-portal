import { Link } from "react-router-dom";
import { categoryBadgeClass, statusBadgeClass } from "../utils/badgeColors";

function RoadmapFeatureCard({ feature }) {
  return (
    <article
      aria-label={feature.title}
      className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm"
    >
      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryBadgeClass(feature.category)}`}>
          {feature.category.replace(/_/g, " ")}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(feature.status)}`}>
          {feature.status.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-sm font-medium text-slate-900 mb-2">{feature.title}</p>
      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
        <span>▲ {feature.vote_count}</span>
        <span>💬 {feature.comment_count}</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        by {feature.author_name} · {new Date(feature.created_at).toLocaleDateString()}
      </p>
      <Link
        to={`/features/${feature.id}`}
        className="text-xs text-indigo-600 hover:underline"
      >
        View Details →
      </Link>
    </article>
  );
}

export default RoadmapFeatureCard;
