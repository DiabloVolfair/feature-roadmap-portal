import { useParams } from "react-router-dom";
import { useFeature } from "../hooks/useFeatures";

/**
 * FeatureDetailsPage fetches a single feature request via `useFeature(featureId)`
 * and displays its full details. `description_markdown` is rendered as raw,
 * whitespace-preserving plain text inside a `<pre>`-like block - never through
 * `react-markdown` or any other markdown renderer, since full markdown
 * rendering is deferred to Sprint 2B (Req 16.3). No voting controls, comment
 * thread, or status-change control is rendered, per this sprint's Non-Goals
 * (Req 16.4). A 404 from the underlying query renders a not-found message
 * rather than an unhandled error (Req 16.5).
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 24.4
 */
function FeatureDetailsPage() {
  const { featureId } = useParams();
  const { data: feature, isLoading, isError, error } = useFeature(featureId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-slate-600">Loading...</p>
      </div>
    );
  }

  if (isError && error?.response?.status === 404) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-slate-600">Feature request not found.</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-red-600">Something went wrong loading this feature request.</p>
      </div>
    );
  }

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-bold text-slate-900">{feature.title}</h1>
      <div className="text-sm text-slate-500">
        {feature.category} · {feature.status} · {feature.author_name} ·{" "}
        {new Date(feature.created_at).toLocaleDateString()} ·{" "}
        {feature.vote_count} votes · {feature.comment_count} comments
      </div>
      <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">
        {feature.description_markdown}
      </pre>
    </article>
  );
}

export default FeatureDetailsPage;
