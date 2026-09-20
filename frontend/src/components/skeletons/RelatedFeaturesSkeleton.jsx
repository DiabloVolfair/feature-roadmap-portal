/**
 * RelatedFeaturesSkeleton is a pulsing placeholder shown by FeatureDetailsPage
 * while `useFeature(featureId)` is loading, approximating the shape of the
 * RelatedFeatures section it precedes: a horizontal row of card-shaped
 * blocks matching RelatedFeatures' up-to-4-card layout.
 *
 * Purely decorative and non-interactive; hidden from assistive technology.
 *
 * Requirements: 14.1, 14.5
 */
function RelatedFeaturesSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-4 w-40 rounded bg-slate-200" />
      <div className="mt-3 flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="h-28 w-48 flex-shrink-0 rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="h-3 w-3/4 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
            <div className="mt-3 flex gap-2">
              <div className="h-4 w-12 rounded-full bg-slate-100" />
              <div className="h-4 w-12 rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RelatedFeaturesSkeleton;
