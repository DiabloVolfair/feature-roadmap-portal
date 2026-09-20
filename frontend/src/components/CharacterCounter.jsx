const WARNING_RATIO = 0.9;

/**
 * classifyCharacterCount is a pure function mapping a length/max pair to a
 * threshold classification: "warning" at [90% of max, max), "error" at
 * >= max, "normal" otherwise. Colocated with CharacterCounter so the
 * classification logic has a single source of truth for both
 * CreateFeatureModal and EditFeatureModal (Req 8.3, 8.4, 8.5).
 *
 * Requirements: 8.3, 8.4, 8.5
 */
export function classifyCharacterCount(length, max) {
  if (length >= max) return "error";
  if (length >= max * WARNING_RATIO) return "warning";
  return "normal";
}

const STATE_CLASSES = {
  normal: "text-slate-500",
  warning: "text-amber-600",
  error: "text-red-600",
};

/**
 * CharacterCounter: a small pure-render component showing
 * "{length} / {max}" beneath MarkdownEditor, visually indicating the
 * warning/error thresholds without ever blocking typing -
 * `validateFeatureForm` remains the sole submit-time gate (Req 8.3, 8.4,
 * 8.5, 8.6).
 *
 * Requirements: 8.3, 8.4, 8.5, 8.6
 */
function CharacterCounter({ length, max }) {
  const state = classifyCharacterCount(length, max);
  return (
    <p className={`text-sm ${STATE_CLASSES[state]}`} aria-live="polite">
      {length.toLocaleString()} / {max.toLocaleString()}
    </p>
  );
}

export default CharacterCounter;
