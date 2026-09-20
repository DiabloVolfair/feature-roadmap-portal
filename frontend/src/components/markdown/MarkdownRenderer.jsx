import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "../../styles/markdown.css";

const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"];

function isAllowedHref(href) {
  try {
    const { protocol } = new URL(href, "http://__relative_probe__");
    // A relative/scheme-less href resolves against the probe base, so
    // its protocol comes back as "http:" from the probe itself - detect
    // that case separately rather than trusting the parsed protocol.
    if (href.startsWith("/") || !/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    return ALLOWED_LINK_SCHEMES.includes(protocol);
  } catch {
    return false;
  }
}

function SafeLink({ href, children }) {
  if (!isAllowedHref(href ?? "")) return <>{children}</>; // plain text, href discarded (Req 3.1)
  return <a href={href}>{children}</a>;
}

function SuppressedImage({ alt }) {
  return <>{alt}</>; // alt text only, url discarded (Req 3.2)
}

/**
 * MarkdownRenderer: the sole component in the Frontend_Application that
 * imports react-markdown (Req 3.7). Configures remark-gfm and overrides
 * `a`/`img` at the component level to enforce the link-scheme allow-list
 * and image suppression (Req 3.1-3.3). Never passes rehype-raw, so raw
 * HTML in the source renders as plain text, not live elements (Req 3.5).
 */
function MarkdownRenderer({ children }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: SafeLink, img: SuppressedImage }}>
        {children ?? ""}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
export { isAllowedHref };
