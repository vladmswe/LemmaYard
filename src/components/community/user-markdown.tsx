import { MarkdownAsync } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "cn";

import {
  USER_MARKDOWN_ALLOWED_ELEMENTS,
  userMarkdownRehypePlugins,
} from "@/lib/community/markdown-schema";
import { rehypeShikiUserCode } from "@/server/community/highlight";

import "./community.css";

/**
 * User-written markdown on the server (docs/specs/community.md §C.4): GFM,
 * the strict sanitize schema of src/lib/community/markdown-schema.ts, then
 * Shiki for allowlisted code fences. Raw HTML is never parsed (no
 * rehype-raw). Server component: no markdown code ships for reading.
 * Rendered with `dir="auto"` and no `lang` (user content may be any language).
 * C3/C5 reuse this component for posts and lesson comments.
 */
export async function UserMarkdown({ children, className }: { children: string; className?: string }) {
  const rendered = await MarkdownAsync({
    children,
    remarkPlugins: [remarkGfm],
    // The list is built from the shared plugin steps; react-markdown's own types are looser than ours.
    rehypePlugins: userMarkdownRehypePlugins(rehypeSanitize, [rehypeShikiUserCode]) as never,
    allowedElements: USER_MARKDOWN_ALLOWED_ELEMENTS,
    unwrapDisallowed: true,
    skipHtml: true,
  });
  return (
    <div dir="auto" className={cn("user-md", className)}>
      {rendered}
    </div>
  );
}
