import { statusBadgeClass } from "../utils/badgeColors";

/**
 * StatusTimeline: read-only, four-fixed-stage Feature_Status lifecycle
 * display (Req 10). Renders "Under Review" -> "Planned" -> "In Progress"
 * -> "Completed" in order, always, regardless of the `status` prop's
 * validity (Req 10.1, 10.5).
 *
 * The stage matching `status` is distinguished from the other three by a
 * non-color-dependent means (a filled vs. unfilled marker plus bold vs.
 * regular label weight) in addition to color, and carries
 * `aria-current="step"` so assistive technology can determine the current
 * stage without relying on visual presentation (Req 10.2, 16.7).
 *
 * Renders no control that can change status - purely presentational
 * (Req 10.3). Used exclusively within FeatureDetailsPage (Req 10.4).
 */
const STAGES = [
  { value: "under_review", label: "Under Review" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

function StatusTimeline({ status }) {
  const currentIndex = STAGES.findIndex((stage) => stage.value === status);

  return (
    <ol className="flex flex-col gap-4 sm:flex-row sm:gap-2" aria-label="Feature status timeline">
      {STAGES.map((stage, index) => {
        const isCurrent = index === currentIndex;
        return (
          <li
            key={stage.value}
            className="flex flex-1 items-center gap-2 sm:flex-col sm:items-stretch sm:text-center"
            aria-current={isCurrent ? "step" : undefined}
          >
            <span
              aria-hidden="true"
              className={
                isCurrent
                  ? `inline-block h-3 w-3 shrink-0 rounded-full border-2 border-current ${statusBadgeClass(stage.value)}`
                  : "inline-block h-3 w-3 shrink-0 rounded-full border-2 border-slate-300 bg-transparent"
              }
            />
            <span className={isCurrent ? "text-sm font-bold text-slate-900" : "text-sm font-normal text-slate-500"}>
              {stage.label}
              {isCurrent && <span className="sr-only"> (current status)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default StatusTimeline;
