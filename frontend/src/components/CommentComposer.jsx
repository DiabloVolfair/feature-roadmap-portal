import { useState } from "react";
import MarkdownEditor from "./MarkdownEditor";
import CharacterCounter from "./CharacterCounter";

const COMMENT_MAX_LENGTH = 2000;
const COMMENT_MIN_LENGTH = 3;

/**
 * CommentComposer: a controlled comment input that combines MarkdownEditor
 * and CharacterCounter, enforcing the 3–2000 character content rule for
 * comment bodies (compose, reply, and edit modes).
 *
 * - Submit is disabled when content is < 3 or > 2000 chars, or while
 *   isLoading is true (Req 19.3, 19.4).
 * - Cancel is shown only when mode !== "compose" (Req 19.5).
 * - Submit label changes based on mode (Req 19.6).
 * - The textarea is labelled via a <label> element linked by id (Req 25.2,
 *   25.6).
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 25.2, 25.6
 */
function CommentComposer({
  onSubmit,
  onCancel,
  initialValue = "",
  mode = "compose",
  isLoading = false,
}) {
  const [content, setContent] = useState(initialValue);

  const isInvalid =
    content.length < COMMENT_MIN_LENGTH ||
    content.length > COMMENT_MAX_LENGTH ||
    isLoading;

  const submitLabel = mode === "edit" ? "Save changes" : "Post comment";
  const showCancel = mode !== "compose";

  function handleSubmit() {
    if (isInvalid) return;
    onSubmit(content);
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        id="comment-composer-label"
        htmlFor="comment-composer-textarea"
        className="sr-only"
      >
        {mode === "edit" ? "Edit comment" : mode === "reply" ? "Write a reply" : "Write a comment"}
      </label>

      {/* MarkdownEditor renders its own textarea; wrap in a labelled div so
          screen readers associate the region label (Req 25.2, 25.6) */}
      <div aria-labelledby="comment-composer-label">
        <MarkdownEditor value={content} onChange={setContent} />
      </div>

      <div className="flex items-center justify-between">
        <CharacterCounter length={content.length} max={COMMENT_MAX_LENGTH} />

        <div className="flex items-center gap-2">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isInvalid}
            aria-disabled={isInvalid ? "true" : "false"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CommentComposer;
