"use client";

import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "cn";

import {
  USER_MARKDOWN_ALLOWED_ELEMENTS,
  userMarkdownRehypePlugins,
} from "@/lib/community/markdown-schema";

import "./community.css";

/**
 * Client twin of `UserMarkdown` for the composer's Preview tab and revealed
 * spoilers: the same sanitize schema and steps, without Shiki (code blocks are
 * plain). Loaded lazily (next/dynamic), so its bundle is paid only when used.
 */
export default function UserMarkdownPreview({ children, className }: { children: string; className?: string }) {
  return (
    <div dir="auto" className={cn("user-md", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={userMarkdownRehypePlugins(rehypeSanitize) as never}
        allowedElements={USER_MARKDOWN_ALLOWED_ELEMENTS}
        unwrapDisallowed
        skipHtml
      >
        {children}
      </Markdown>
    </div>
  );
}
