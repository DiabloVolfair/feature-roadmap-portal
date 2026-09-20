"""Markdown_Sanitizer.

Provides a single server-side function that sanitizes raw HTML embedded in
`description_markdown` before that content is trusted anywhere. This is
defense-in-depth: it does not replace the frontend `MarkdownRenderer`'s
rendering-time controls (link-scheme allow-list, image suppression, and
never passing `rehype-raw`), which remain the primary defense.

Requirements: 3.4
"""

import re

# Matches <script>...</script>, <style>...</style>, <iframe>...</iframe>,
# <object>...</object>, <embed>...</embed> (paired, with any inner content,
# including across newlines), as well as their self-closing/unpaired forms
# (e.g. a stray <embed src="..."> with no closing tag, or void-style
# `<iframe .../>`). Applied case-insensitively since HTML tag names are
# case-insensitive.
_DANGEROUS_TAGS = re.compile(
    r"<(script|style|iframe|object|embed)\b[^>]*>.*?</\1\s*>"
    r"|<(?:script|style|iframe|object|embed)\b[^>]*/?>",
    re.IGNORECASE | re.DOTALL,
)

# Matches any on* event-handler attribute (onclick, onerror, onload, etc.)
# with a quoted value, e.g. onclick="alert(1)" or onerror='...'.
_EVENT_HANDLER_ATTR = re.compile(r'\s+on\w+\s*=\s*(["\']).*?\1', re.IGNORECASE | re.DOTALL)

# Matches href/src attributes whose value uses the javascript: URI scheme,
# e.g. href="javascript:alert(1)" or src='javascript:void(0)'.
_JS_URI_ATTR = re.compile(
    r'\s+(?:href|src)\s*=\s*(["\'])\s*javascript:.*?\1',
    re.IGNORECASE | re.DOTALL,
)


def sanitize_markdown(raw: str) -> str:
    """Remove/neutralize dangerous raw HTML embedded in markdown source.

    Strips `script`, `style`, `iframe`, `object`, and `embed` tags (paired
    or self-closing), removes `on*` event-handler attributes, and removes
    `href`/`src` attribute values using the `javascript:` URI scheme.
    Applied identically regardless of call site (Requirement 3.6).

    Args:
        raw: The raw markdown source, potentially containing literal HTML.

    Returns:
        The sanitized markdown source with dangerous constructs removed.
    """
    text = _DANGEROUS_TAGS.sub("", raw)
    text = _EVENT_HANDLER_ATTR.sub("", text)
    text = _JS_URI_ATTR.sub("", text)
    return text
