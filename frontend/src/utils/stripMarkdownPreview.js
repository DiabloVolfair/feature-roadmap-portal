/**
 * Converts a markdown string into a plain-text approximation by stripping
 * common markdown syntax (images, links, headings/emphasis/inline-code/
 * blockquote/strikethrough markers), then truncates the result to at most
 * `maxLength` characters.
 *
 * Truncation contract: the returned string's length never exceeds
 * `maxLength`. No ellipsis or other marker is appended after truncating,
 * so the caller receives a plain, hard cutoff at exactly `maxLength`
 * characters (or fewer, if the stripped text is already shorter).
 *
 * Markdown is stripped BEFORE truncating (never the reverse), which avoids
 * two problems: rendering full markdown and truncating the rendered output
 * (which could cut in the middle of a tag), and truncating the raw
 * markdown source before parsing it (which could leave an unclosed
 * formatting token, e.g. a lone `**`, that renders incorrectly). Operating
 * on plain text first sidesteps both (Req 24.2, 24.3).
 *
 * Used by FeatureCard to compute the feed card's description preview from
 * the full `description_markdown` already present in the API response.
 *
 * @param {string} markdown - The raw markdown source (may be null/undefined).
 * @param {number} maxLength - The maximum number of characters to return.
 * @returns {string} The stripped, truncated plain-text preview.
 */
const MARKDOWN_PATTERNS = [
  [/!\[[^\]]*\]\([^)]*\)/g, ""], // images: ![alt](url) -> removed entirely
  [/\[([^\]]*)\]\([^)]*\)/g, "$1"], // links: [text](url) -> text
  [/[#*_`~>]/g, ""], // heading/emphasis/inline-code/strikethrough/quote markers
  [/\s+/g, " "], // collapse remaining whitespace/newlines
];

export function stripMarkdownPreview(markdown, maxLength) {
  const plainText = MARKDOWN_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    markdown ?? ""
  ).trim();

  return plainText.slice(0, maxLength);
}
