import { toast } from "sonner";

/**
 * ShareButton copies the feature's shareable URL to the clipboard and
 * reports the outcome via exactly one Sonner toast per activation.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

/**
 * Attempts to copy `text` to the clipboard using the Clipboard API
 * first; if that's unavailable or rejects, falls back to
 * `execCommandCopy` (or the default `document.execCommand("copy")`
 * based fallback) against a temporary, off-screen, focused, selected
 * textarea. Returns `true`/`false` for whether the copy succeeded,
 * never throws.
 *
 * `clipboard`/`execCommandCopy` are injectable so callers (tests) can
 * exercise every outcome branch without a real clipboard.
 *
 * Requirements: 12.1, 12.3, 12.4
 */
export async function copyToClipboard(
  text,
  { clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined, execCommandCopy } = {}
) {
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the execCommand-based fallback.
    }
  }
  return execCommandCopy ? execCommandCopy(text) : fallbackExecCommandCopy(text);
}

/**
 * Default execCommand("copy") fallback: creates a temporary, off-screen
 * textarea containing `text`, focuses and selects it, invokes
 * `document.execCommand("copy")`, then removes the element regardless
 * of outcome.
 *
 * Requirements: 12.3
 */
function fallbackExecCommandCopy(text) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(el);
  return ok;
}

/**
 * ShareButton copies `url` (defaulting to `window.location.href`) to
 * the clipboard on activation, then shows exactly one toast: the
 * success toast when the copy succeeded, the error toast otherwise
 * (Req 12.2-12.5).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */
function ShareButton({ url }) {
  const handleClick = async () => {
    const shareUrl = url ?? window.location.href;
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      toast.success("Feature link copied.");
    } else {
      toast.error("Could not copy the link. Please copy it manually.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Copy feature link"
      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.684 13.342a4.5 4.5 0 100-2.684m0 2.684a4.502 4.502 0 010-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a4.5 4.5 0 108.318-3.316 4.5 4.5 0 00-8.318 3.316zm0 9.632a4.5 4.5 0 108.318 3.316 4.5 4.5 0 00-8.318-3.316z"
        />
      </svg>
      Share
    </button>
  );
}

export default ShareButton;
