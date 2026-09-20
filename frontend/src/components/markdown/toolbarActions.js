/**
 * toolbarActions: pure textarea-manipulation helpers used by MarkdownEditor's
 * toolbar. Each function operates on a `{ value, selectionStart, selectionEnd }`
 * state shape and returns the same shape, so they're testable without a real
 * DOM `<textarea>` (Req 5.3-5.6).
 */

/**
 * Wraps the current selection (or a placeholder, if the selection is
 * collapsed) in `before`/`after` markers as a single span-level unit,
 * including across multi-line selections (Req 5.3, Property 8).
 */
export function wrapSelection(state, { before, after = before, placeholder }) {
  const { value, selectionStart, selectionEnd } = state;
  const hasSelection = selectionEnd > selectionStart;
  const inner = hasSelection ? value.slice(selectionStart, selectionEnd) : placeholder;
  const next = value.slice(0, selectionStart) + before + inner + after + value.slice(selectionEnd);
  const innerStart = selectionStart + before.length;
  return { value: next, selectionStart: innerStart, selectionEnd: innerStart + inner.length };
}

/**
 * Prefixes every line touched by the current selection with `prefix`,
 * rather than wrapping a span (Req 5.5, Property 10).
 */
export function prefixLines(state, prefix) {
  const { value, selectionStart, selectionEnd } = state;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEnd = value.indexOf("\n", selectionEnd);
  const effectiveEnd = lineEnd === -1 ? value.length : lineEnd;
  const block = value.slice(lineStart, effectiveEnd);
  const prefixed = block
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(effectiveEnd);
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length };
}

/**
 * Inserts `text` at the current cursor position, collapsing the
 * selection to just after the inserted text.
 */
export function insertAtCursor(state, text) {
  const { value, selectionStart } = state;
  const next = value.slice(0, selectionStart) + text + value.slice(selectionStart);
  const cursor = selectionStart + text.length;
  return { value: next, selectionStart: cursor, selectionEnd: cursor };
}

/**
 * Inserts a `[link text](url)` placeholder at the cursor and selects the
 * placeholder's inner "link text" span, so a collapsed-selection link
 * insertion leaves the label ready to be typed over (Req 5.4, Property 9).
 */
export function insertLinkPlaceholder(state) {
  const withLink = insertAtCursor(state, "[link text](url)");
  const linkTextStart = state.selectionStart + 1; // skip "["
  return { ...withLink, selectionStart: linkTextStart, selectionEnd: linkTextStart + "link text".length };
}

export const TABLE_TEMPLATE = "| Header | Header |\n| --- | --- |\n| Cell | Cell |";
