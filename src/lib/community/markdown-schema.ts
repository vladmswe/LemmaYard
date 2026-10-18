// User markdown: the sanitize schema and the small rehype steps shared by the
// server renderer (src/components/community/user-markdown.tsx, + Shiki) and
// the client preview (user-markdown-preview.tsx). docs/specs/community.md §C.4.
//
// Pipeline (react-markdown + remark-gfm + rehype-sanitize; NO rehype-raw,
// ever, so raw HTML in markdown is never parsed into elements):
//   before sanitize  headings → h3/h4, images → links, code language → allowlist
//   sanitize         USER_MARKDOWN_SCHEMA (strict allowlist below)
//   after sanitize   external links get rel="ugc nofollow noopener noreferrer",
//                    protocol-relative hrefs dropped, @mentions → profile links,
//                    <pre> becomes a focusable scroll region
//   last line        react-markdown `allowedElements` = the schema's tags (+ Shiki's span)
//
// Pure and client-safe. C3/C5 render posts and lesson comments with the same
// pipeline: import from here, never widen the schema per page.
import type { Options as SanitizeSchema } from "rehype-sanitize";

import { CODE_LANGUAGES, resolveCodeLanguage } from "./types";

/** Every element user markdown may produce (no img, iframe, input, details, sup/sub, h1/h2, footnotes). */
export const USER_MARKDOWN_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h3",
  "h4",
  "hr",
  "i",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

const LANGUAGE_CLASS = new RegExp(`^language-(?:${CODE_LANGUAGES.map((l) => l.replace(/[+#]/g, "\\$&")).join("|")})$`);

export const USER_MARKDOWN_SCHEMA: SanitizeSchema = {
  tagNames: [...USER_MARKDOWN_TAGS],
  attributes: {
    a: ["href", "title"],
    code: [["className", LANGUAGE_CLASS]],
    ol: ["start"],
    td: ["align"],
    th: ["align"],
    "*": [],
  },
  protocols: { href: ["http", "https", "mailto"] },
  // No element may carry an id or a name; should one ever be allowed, it
  // still gets the user-content- prefix (DOM clobbering, AC-C-MD-2).
  clobber: ["id", "name", "ariaDescribedBy", "ariaLabelledBy"],
  clobberPrefix: "user-content-",
  // Dropped with their content (not unwrapped).
  strip: ["script", "style", "template", "noscript", "iframe", "object", "embed", "svg", "math", "textarea", "title"],
  ancestors: {
    tbody: ["table"],
    td: ["table"],
    th: ["table"],
    thead: ["table"],
    tr: ["table"],
    li: ["ol", "ul"],
  },
  required: {},
};

/** Elements react-markdown may emit after every plugin ran (Shiki adds spans). */
export const USER_MARKDOWN_ALLOWED_ELEMENTS: string[] = [...USER_MARKDOWN_TAGS, "span"];

export const UGC_REL = "ugc nofollow noopener noreferrer";

// --- A minimal hast walker (no unist-util-visit dependency) ---------------
export type HastText = { type: "text"; value: string };
export type HastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
};
export type HastNode = HastElement | HastText | { type: string; [key: string]: unknown };
export type HastParent = { type: string; children: HastNode[] };

export function isElement(node: HastNode, tagName?: string): node is HastElement {
  return node.type === "element" && (tagName === undefined || (node as HastElement).tagName === tagName);
}

/** Calls `fn` for every element, parents first. */
export function walkElements(node: HastParent, fn: (el: HastElement, parent: HastParent, index: number) => void): void {
  const children = node.children;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (isElement(child)) {
      fn(child, node, i);
      walkElements(child, fn);
    }
  }
}

export function textContent(node: HastNode): string {
  if (node.type === "text") return (node as HastText).value;
  if ("children" in node && Array.isArray(node.children)) return (node.children as HastNode[]).map(textContent).join("");
  return "";
}

// --- before sanitize ------------------------------------------------------

/** `#`/`##` → h3, `###`… → h4: the page keeps its own h1/h2 (§B.15). */
export function rehypeUserHeadings() {
  return (tree: HastParent) => {
    walkElements(tree, (el) => {
      const match = /^h([1-6])$/.exec(el.tagName);
      if (match) el.tagName = Number(match[1]) <= 2 ? "h3" : "h4";
    });
  };
}

/** `![alt](src)` → a link with the alt text (no images in user content, AC-C-MD-2). */
export function rehypeImagesToLinks() {
  return (tree: HastParent) => {
    walkElements(tree, (el, parent, index) => {
      if (el.tagName !== "img") return;
      const src = typeof el.properties.src === "string" ? el.properties.src : "";
      const alt = typeof el.properties.alt === "string" && el.properties.alt.trim() ? el.properties.alt : src || "image";
      parent.children[index] = {
        type: "element",
        tagName: "a",
        properties: src ? { href: src } : {},
        children: [{ type: "text", value: alt }],
      } satisfies HastElement;
    });
  };
}

/** GFM footnotes are not part of the subset: the list goes, a reference stays as "[1]". */
export function rehypeDropFootnotes() {
  return (tree: HastParent) => {
    const visit = (parent: HastParent) => {
      for (let i = parent.children.length - 1; i >= 0; i -= 1) {
        const child = parent.children[i];
        if (!isElement(child)) continue;
        if (child.tagName === "section" && child.properties.dataFootnotes !== undefined) {
          parent.children.splice(i, 1);
          continue;
        }
        if (child.tagName === "sup" && child.children.some((c) => isElement(c, "a") && c.properties.dataFootnoteRef !== undefined)) {
          parent.children[i] = { type: "text", value: `[${textContent(child)}]` };
          continue;
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

/** `language-py` → `language-python`; unknown languages lose the class (plain text). */
export function rehypeCodeLanguage() {
  return (tree: HastParent) => {
    walkElements(tree, (el) => {
      if (el.tagName !== "code") return;
      const classes = Array.isArray(el.properties.className) ? (el.properties.className as unknown[]) : [];
      const tag = classes.map(String).find((c) => c.startsWith("language-"));
      const lang = tag ? resolveCodeLanguage(tag.slice("language-".length)) : null;
      if (lang) el.properties.className = [`language-${lang}`];
      else delete el.properties.className;
    });
  };
}

// --- after sanitize -------------------------------------------------------

/** Whether an href leaves the site (absolute with a scheme). */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * External links get `rel="ugc nofollow noopener noreferrer"` and stay in the
 * same tab; protocol-relative (`//host`) and backslash hrefs are dropped (the
 * sanitizer treats them as relative, browsers as another host).
 */
export function rehypeUserLinks() {
  return (tree: HastParent) => {
    walkElements(tree, (el) => {
      if (el.tagName !== "a") return;
      const href = typeof el.properties.href === "string" ? el.properties.href.trim() : null;
      delete el.properties.target;
      if (href === null) return;
      if (/^[\\/]{2}|^\/\\|^\\/.test(href) || /[\u0000-\u001F\u007F]/.test(href)) {
        delete el.properties.href;
        return;
      }
      if (isExternalHref(href)) el.properties.rel = UGC_REL.split(" ");
    });
  };
}

const MENTION_IN_TEXT = /(?<![\w@./])@([a-z0-9_]{3,20})(?![\w])/gi;

/** `@username` in text (not in code or links) → `/u/<username>` (§B.5). */
export function rehypeMentions() {
  return (tree: HastParent) => {
    const visit = (parent: HastParent) => {
      for (let i = 0; i < parent.children.length; i += 1) {
        const child = parent.children[i];
        if (isElement(child)) {
          if (child.tagName === "a" || child.tagName === "code" || child.tagName === "pre") continue;
          visit(child);
          continue;
        }
        if (child.type !== "text") continue;
        const value = (child as HastText).value;
        const parts: HastNode[] = [];
        let last = 0;
        for (const m of value.matchAll(MENTION_IN_TEXT)) {
          const at = m.index ?? 0;
          if (at > last) parts.push({ type: "text", value: value.slice(last, at) });
          parts.push({
            type: "element",
            tagName: "a",
            properties: { href: `/u/${m[1].toLowerCase()}` },
            children: [{ type: "text", value: m[0] }],
          } satisfies HastElement);
          last = at + m[0].length;
        }
        if (parts.length === 0) continue;
        if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
        parent.children.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
    };
    visit(tree);
  };
}

/** Code blocks scroll horizontally; a keyboard user must be able to reach them. */
export function rehypeFocusableCode() {
  return (tree: HastParent) => {
    walkElements(tree, (el) => {
      if (el.tagName === "pre") el.properties.tabIndex = 0;
    });
  };
}

/** The rehype plugin list for a renderer; `extra` runs last (the server adds Shiki). */
export function userMarkdownRehypePlugins<T>(sanitize: T, extra: unknown[] = []): unknown[] {
  return [
    rehypeDropFootnotes,
    rehypeUserHeadings,
    rehypeImagesToLinks,
    rehypeCodeLanguage,
    [sanitize, USER_MARKDOWN_SCHEMA],
    rehypeUserLinks,
    rehypeMentions,
    ...extra,
    rehypeFocusableCode,
  ];
}
