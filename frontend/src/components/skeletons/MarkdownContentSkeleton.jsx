/**
 * MarkdownContentSkeleton is a pulsing placeholder shown by FeatureDetailsPage
 * while `useFeature(featureId)` is loading, approximating the shape of the
 * rendered markdown content region it precedes (a heading-width bar followed
 * by several paragraph-width lines).
 *
 * Purely decorative and non-interactive; hidden from assistive technology.
 *
 * Requirements: 14.1, 14.5
 */
function MarkdownContentSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-6" aria-hidden="true">
      {/* heading-width bar */}
      <div className="h-4 w-1/3 rounded bg-slate-200" />

      {/* paragraph-width lines */}
      <div className="mt-4 flex flex-col gap-2">
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-5/6 rounded bg-slate-100" />
        <div className="h-3 w-2/3 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export default MarkdownContentSkeleton;
