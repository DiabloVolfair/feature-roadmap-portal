/**
 * Shared category/status badge color maps. This is the single source every
 * consumer (FeatureDetailsPage, RelatedFeatures, StatusTimeline) imports
 * from - no component redefines its own category/status color logic
 * (Req 17.3).
 *
 * Both lookup functions are total: an unrecognized key falls back to a
 * documented default class instead of returning `undefined`.
 */

export const CATEGORY_BADGE_CLASSES = {
  ui_ux: "bg-purple-100 text-purple-800",
  integrations: "bg-blue-100 text-blue-800",
  performance: "bg-amber-100 text-amber-800",
  general: "bg-slate-100 text-slate-800",
};

export const STATUS_BADGE_CLASSES = {
  under_review: "bg-slate-100 text-slate-700",
  planned: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
};

export function categoryBadgeClass(category) {
  return CATEGORY_BADGE_CLASSES[category] ?? CATEGORY_BADGE_CLASSES.general;
}

export function statusBadgeClass(status) {
  return STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.under_review;
}
