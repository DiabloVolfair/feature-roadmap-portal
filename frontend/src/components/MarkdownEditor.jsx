import { useEffect, useRef, useState } from "react";
import MarkdownRenderer from "./markdown/MarkdownRenderer";
import {
  wrapSelection,
  prefixLines,
  insertAtCursor,
  insertLinkPlaceholder,
  TABLE_TEMPLATE,
} from "./markdown/toolbarActions";

const MAX_TEXTAREA_HEIGHT_PX = 480;

function isCollapsed(state) {
  return state.selectionEnd <= state.selectionStart;
}

/**
 * Wraps a non-empty selection in `[selected](url)` link syntax, keeping
 * the `url` placeholder selected next so it's ready to be typed over.
 * `insertLinkPlaceholder` (from toolbarActions) covers the collapsed-
 * selection case instead (Req 5.4).
 */
function wrapLinkAroundSelection(state) {
  const { value, selectionStart, selectionEnd } = state;
  const selected = value.slice(selectionStart, selectionEnd);
  const inserted = `[${selected}](url)`;
  const next = value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
  const urlStart = selectionStart + selected.length + 3; // "[" + selected + "]("
  return { value: next, selectionStart: urlStart, selectionEnd: urlStart + "url".length };
}

/**
 * TOOLBAR_ACTIONS: maps each toolbar button to a pure state-transform
 * function from `toolbarActions.js`, dispatched based on the current
 * selection shape (Req 5.3, 5.4, 5.5, 5.6).
 */
const TOOLBAR_ACTIONS = {
  h1: (state) => prefixLines(state, "# "),
  h2: (state) => prefixLines(state, "## "),
  bold: (state) => wrapSelection(state, { before: "**", placeholder: "bold text" }),
  italic: (state) => wrapSelection(state, { before: "*", placeholder: "italic text" }),
  bulletList: (state) => prefixLines(state, "- "),
  numberedList: (state) => prefixLines(state, "1. "),
  quote: (state) => prefixLines(state, "> "),
  codeBlock: (state) =>
    wrapSelection(state, { before: "```\n", after: "\n```", placeholder: "code" }),
  link: (state) => (isCollapsed(state) ? insertLinkPlaceholder(state) : wrapLinkAroundSelection(state)),
  horizontalRule: (state) => insertAtCursor(state, "\n---\n"),
  table: (state) => insertAtCursor(state, `${TABLE_TEMPLATE}\n`),
};

const TOOLBAR_BUTTONS = [
  { action: "h1", label: "Heading 1", text: "H1" },
  { action: "h2", label: "Heading 2", text: "H2" },
  { action: "bold", label: "Bold", text: "B" },
  { action: "italic", label: "Italic", text: "I" },
  { action: "bulletList", label: "Bullet List", text: "•" },
  { action: "numberedList", label: "Numbered List", text: "1." },
  { action: "quote", label: "Quote", text: "❝" },
  { action: "codeBlock", label: "Code Block", text: "</>" },
  { action: "link", label: "Insert link", text: "🔗" },
  { action: "horizontalRule", label: "Horizontal Rule", text: "―" },
  { action: "table", label: "Table", text: "▦" },
];

/**
 * MarkdownEditor: a reusable, controlled markdown editor combining a
 * toolbar, a `<textarea>`, and a Markdown_Renderer-backed live preview.
 * Used by CreateFeatureModal/EditFeatureModal in place of a plain
 * textarea (Req 5, 6, 8.7).
 *
 * `value`/`onChange` are fully controlled by the parent - MarkdownEditor
 * holds no copy of the markdown text itself, only the pending
 * selection to apply after a toolbar insertion and the live-preview
 * toggle state (which never affects `value`, Req 6.5).
 *
 * Requirements: 5.1, 5.2, 5.7, 5.8, 6.1, 6.2, 6.4, 6.5, 8.7
 */
function MarkdownEditor({ value, onChange }) {
  const textareaRef = useRef(null);
  const pendingSelectionRef = useRef(null);
  const [isPreviewEnabled, setIsPreviewEnabled] = useState(true);

  // Auto-grow the textarea to fit its content, capped at a shared fixed
  // maximum height beyond which it scrolls internally (Req implementation
  // detail for the toolbar/textarea layout).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    textarea.style.height = `${nextHeight}px`;
  }, [value]);

  // After a toolbar insertion changes `value`, restore focus and the new
  // selection once React has re-rendered the textarea with that value
  // (Req 5.7).
  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    pendingSelectionRef.current = null;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pending.selectionStart, pending.selectionEnd);
  }, [value]);

  function dispatchToolbarAction(action) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const state = {
      value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    };
    const result = TOOLBAR_ACTIONS[action](state);

    pendingSelectionRef.current = {
      selectionStart: result.selectionStart,
      selectionEnd: result.selectionEnd,
    };
    onChange(result.value);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="toolbar"
        aria-label="Markdown formatting"
        className="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-slate-50 p-1"
      >
        {TOOLBAR_BUTTONS.map(({ action, label, text }) => (
          <button
            key={action}
            type="button"
            aria-label={label}
            onClick={() => dispatchToolbarAction(action)}
            className="rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            {text}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={isPreviewEnabled}
          aria-label="Toggle live preview"
          onClick={() => setIsPreviewEnabled((current) => !current)}
          className="ml-auto rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200 aria-pressed:bg-slate-200"
        >
          Preview
        </button>
      </div>

      <div className={`flex flex-col gap-2 ${isPreviewEnabled ? "md:flex-row" : ""}`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full resize-none overflow-y-auto rounded-md border border-slate-300 px-3 py-2 font-mono text-sm ${
            isPreviewEnabled ? "md:w-1/2" : ""
          }`}
          style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px` }}
        />
        {isPreviewEnabled && (
          <div
            className="w-full overflow-y-auto rounded-md border border-slate-300 px-3 py-2 md:w-1/2"
            style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px` }}
          >
            <MarkdownRenderer>{value}</MarkdownRenderer>
          </div>
        )}
      </div>
    </div>
  );
}

export default MarkdownEditor;
