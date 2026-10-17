import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

// Problem statements (AC-M3-4, AC-M3-5): GitHub-flavored markdown, raw HTML is
// never parsed (no rehype-raw), and the rendered tree goes through
// rehype-sanitize (GitHub schema: no scripts, no event handlers, safe URL
// protocols only). Server component: no markdown code ships to the browser.

const components: Components = {
  // The problem title is the page's only h1.
  h1: "h2",
  // Wide tables scroll inside the pane instead of stretching it.
  table: (props) => {
    const { node, ...rest } = props;
    void node;
    return (
      <div className="overflow-x-auto">
        <table {...rest} />
      </div>
    );
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
