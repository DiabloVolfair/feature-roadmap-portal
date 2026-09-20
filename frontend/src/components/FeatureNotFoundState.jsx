import { Link } from "react-router-dom";

/**
 * FeatureNotFoundState is a page-embedded presentational component rendered
 * by FeatureDetailsPage in place of the skeletons when `useFeature(featureId)`
 * resolves to a 404 error (the requested feature does not exist).
 *
 * It shows a message stating the feature could not be found, plus a link
 * back to the feed using the same breadcrumb affordance and navigation
 * target as Requirement 15.5 (a plain `<Link to="/">`, not `navigate(-1)`).
 *
 * Requirements: 14.2
 */
function FeatureNotFoundState() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
      <h2 className="font-semibold text-slate-900">Feature not found</h2>
      <p className="mt-1 text-sm text-slate-600">
        We couldn&apos;t find the feature you&apos;re looking for. It may have
        been removed or the link may be incorrect.
      </p>
      <Link
        to="/"
        className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        Back to feed
      </Link>
    </div>
  );
}

export default FeatureNotFoundState;
