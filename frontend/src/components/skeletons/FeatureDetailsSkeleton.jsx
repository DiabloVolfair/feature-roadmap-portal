/**
 * FeatureDetailsSkeleton is a pulsing placeholder shown by FeatureDetailsPage
 * while `useFeature(featureId)` is loading, approximating the shape of the
 * title/badges/author-card/dates region it precedes (a title-width bar,
 * badge-width chips, and an author-card-shaped block), consistent with the
 * "Skeleton Loader" reusable-component category in PROJECT_SPEC.md.
 *
 * Purely decorative and non-interactive; renders no text content, so it is
 * hidden from assistive technology via `aria-hidden`.
 *
 * Requirements: 14.1, 14.5
 */
function FeatureDetailsSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-6" aria-hidden="true">
      {/* breadcrumb-width bar */}
      <div className="h-3 w-24 rounded bg-slate-200" />

      {/* title-width bar */}
      <div className="mt-4 h-7 w-3/4 rounded bg-slate-200" />

      {/* badge-width chips */}
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-20 rounded-full bg-slate-100" />
        <div className="h-5 w-20 rounded-full bg-slate-100" />
      </div>

      {/* author-card-shaped block */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-200" />
        <div className="flex flex-col gap-2">
          <div className="h-3 w-32 rounded bg-slate-200" />
          <div className="h-3 w-24 rounded bg-slate-100" />
        </div>
      </div>

      {/* created/updated date line */}
      <div className="mt-4 h-3 w-40 rounded bg-slate-100" />
    </div>
  );
}

export default FeatureDetailsSkeleton;
