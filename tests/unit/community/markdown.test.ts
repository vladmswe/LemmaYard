// User markdown (docs/specs/community.md §C.4; AC-C-MD-1/2/3): the XSS
// corpus renders without active content in BOTH renderers (server with
// Shiki, client preview), plus the subset rules (headings, images, code,
// footnotes, mentions) and a non-gating highlight benchmark.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UserMarkdown } from "@/components/community/user-markdown";
import UserMarkdownPreview from "@/components/community/user-markdown-preview";
import { bodyProblem } from "@/lib/community/body";
import { UGC_REL } from "@/lib/community/markdown-schema";

import { XSS_CORPUS } from "@/lib/community/testing/xss-corpus";

async function server(md: string): Promise<string> {
  return renderToStaticMarkup(await UserMarkdown({ children: md }));
}

function preview(md: string): string {
  return renderToStaticMarkup(createElement(UserMarkdownPreview, null, md));
}

const FORBIDDEN_TAGS = /<(script|iframe|object|embed|img|svg|math|style|form|input|base|meta|link|textarea|template|noscript|button|select|video|audio|source)\b/i;

type Tag = { name: string; attrs: Map<string, string> };

/**
 * Real elements of the output. renderToStaticMarkup escapes every `<` in text
 * and every `"` in attribute values, so `<name …>` here is always a tag and
 * `name="…"` pairs parse unambiguously (text like `onerror=` stays harmless text).
 */
function tags(html: string): Tag[] {
  return [...html.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^\s=>"]+(?:="[^"]*")?)*)\s*\/?>/g)].map((m) => ({
    name: m[1].toLowerCase(),
    attrs: new Map(
      [...m[2].matchAll(/\s+([^\s=>"]+)(?:="([^"]*)")?/g)].map((a) => [a[1].toLowerCase(), (a[2] ?? "").replace(/&amp;/g, "&")]),
    ),
  }));
}

/** A safe href: relative without a scheme (not `//` or `\`), a fragment, http(s) or mailto. */
function safeHref(href: string): boolean {
  if (/^(https?|mailto):/i.test(href)) return true;
  if (href.startsWith("#")) return true;
  if (/^[\\/]{2}|^\/\\|^\\/.test(href)) return false;
  // No scheme before the first / ? #.
  return !/^[^/?#]*:/.test(href);
}

/** Every rule an output must hold; returns the broken ones. */
function violations(html: string): string[] {
  const bad: string[] = [];
  const tag = FORBIDDEN_TAGS.exec(html);
  if (tag) bad.push(`forbidden tag <${tag[1]}>`);
  for (const t of tags(html)) {
    for (const [name, value] of t.attrs) {
      if (/^on/.test(name)) bad.push(`event handler ${name} on <${t.name}>`);
      if ((name === "id" || name === "name") && !value.startsWith("user-content-")) bad.push(`${name}=${value}`);
      if (name === "target") bad.push("target attribute");
      if (name === "style") {
        const decls = value.split(";").map((d) => d.trim()).filter(Boolean);
        if (!decls.every((d) => d.startsWith("--shiki-"))) bad.push(`style ${value}`);
      }
      if (name === "href" && !safeHref(value)) bad.push(`bad href ${value}`);
      if (name === "src" || name === "srcset" || name === "action" || name === "formaction" || name === "xlink:href") {
        bad.push(`${name} attribute`);
      }
    }
    const href = t.attrs.get("href");
    if (t.name === "a" && href && /^(https?|mailto):/i.test(href) && t.attrs.get("rel") !== UGC_REL) {
      bad.push(`external link without ugc rel: ${href}`);
    }
  }
  return bad;
}

describe("XSS corpus (AC-C-MD-1)", () => {
  it("has at least 80 payloads", () => {
    expect(XSS_CORPUS.length).toBeGreaterThanOrEqual(80);
    expect(new Set(XSS_CORPUS.map((p) => p.name)).size).toBe(XSS_CORPUS.length);
  });

  it.each(XSS_CORPUS.map((p) => [p.name, p.md] as const))("server renderer: %s", async (_name, md) => {
    expect(violations(await server(md))).toEqual([]);
  });

  it.each(XSS_CORPUS.map((p) => [p.name, p.md] as const))("client preview: %s", (_name, md) => {
    expect(violations(preview(md))).toEqual([]);
  });

  it("snapshot of the server output for the whole corpus (giant inputs excluded)", async () => {
    const parts: string[] = [];
    for (const p of XSS_CORPUS) {
      if (p.md.length > 2000) continue;
      parts.push(`## ${p.name}\n${await server(p.md)}`);
    }
    expect(parts.join("\n\n")).toMatchSnapshot();
  });

  it("rejects pathological nesting at the body rules, and the renderers survive it anyway", async () => {
    const deep = XSS_CORPUS.find((p) => p.name === "2000 nested blockquotes")!;
    expect(bodyProblem(deep.md)).toMatch(/nested/);
    expect(await server(deep.md)).toContain("deep");
    expect(preview(deep.md)).toContain("deep");
  });

  it("the checker itself flags active content", () => {
    expect(violations('<img src="x" onerror="a">')).not.toEqual([]);
    expect(violations('<p onclick="a">x</p>')).not.toEqual([]);
    expect(violations('<a href="javascript:x">a</a>')).not.toEqual([]);
    expect(violations('<a href="//evil.com">a</a>')).not.toEqual([]);
    expect(violations('<a href="https://x.com">a</a>')).not.toEqual([]);
    expect(violations('<p id="x">a</p>')).not.toEqual([]);
    expect(violations('<p style="color:red">a</p>')).not.toEqual([]);
    expect(violations('<p title="x onerror=y">onerror=alert(1)</p>')).toEqual([]);
  });
});

describe("markdown subset (AC-C-MD-2, AC-C-MD-3)", () => {
  it("turns images into links with their alt text", async () => {
    const html = await server("![a cat](https://example.com/cat.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain(`<a href="https://example.com/cat.png" rel="${UGC_REL}">a cat</a>`);
    expect(preview("![a cat](https://example.com/cat.png)")).toContain(">a cat</a>");
  });

  it("drops the href of an image with a dangerous src", async () => {
    const html = await server("![alt](javascript:alert(1))");
    expect(html).not.toMatch(/javascript/i);
    expect(html).toContain("alt");
  });

  it("maps headings below the page's own: # and ## → h3, ### and deeper → h4", async () => {
    const html = await server("# One\n\n## Two\n\n### Three\n\n###### Six");
    expect(html).not.toMatch(/<h[12]\b/);
    expect(html).toContain("<h3>One</h3>");
    expect(html).toContain("<h3>Two</h3>");
    expect(html).toContain("<h4>Three</h4>");
    expect(html).toContain("<h4>Six</h4>");
  });

  it.each(["python", "java", "cpp", "sql", "go", "rust", "typescript", "kotlin", "swift", "csharp", "c", "javascript"])(
    "highlights an allowlisted %s fence with Shiki",
    async (lang) => {
      const html = await server(`\`\`\`${lang}\nint x = 1;\n\`\`\``);
      expect(html).toContain('class="shiki');
      expect(html).toContain("--shiki-dark");
      expect(html).toContain(`data-language="${lang}"`);
    },
  );

  it("resolves fence aliases (py, js)", async () => {
    expect(await server("```py\nx = 1\n```")).toContain('data-language="python"');
    expect(await server("```js\nlet x = 1\n```")).toContain('data-language="javascript"');
  });

  it("renders an unknown language as escaped plain text", async () => {
    const html = await server("```weird\n<script>alert(1)</script>\n```");
    expect(html).not.toContain("shiki");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<pre tabindex="0"><code>&lt;');
  });

  it("makes code blocks focusable scroll regions", async () => {
    expect(await server("```\nx\n```")).toMatch(/<pre[^>]*tabindex="0"/);
  });

  it("drops footnotes, keeps the reference as [1]", async () => {
    const html = await server("text[^1]\n\n[^1]: the note");
    expect(html).not.toContain("the note");
    expect(html).not.toMatch(/<sup|<section|Footnotes/);
    expect(html).toContain("text[1]");
  });

  it("links @mentions to profiles, but not inside code or links", async () => {
    const html = await server("hi @JSun and `@code` and [@link](https://x.example)");
    expect(html).toContain('<a href="/u/jsun">@JSun</a>');
    expect(html).toContain("<code>@code</code>");
    expect(html).not.toContain("/u/code");
    expect(html).not.toContain("/u/link");
  });

  it("drops raw HTML elements (text content may remain, tags never)", async () => {
    const html = await server("<b>bold</b> and <div>block</div>");
    expect(html).not.toMatch(/<b>|<div>block/);
  });

  it("adds the ugc rel to external links and none to internal ones", async () => {
    const html = await server("[ext](https://example.com) [int](/problems/two-sum) [mail](mailto:a@b.c)");
    expect(html).toContain(`<a href="https://example.com" rel="${UGC_REL}">ext</a>`);
    expect(html).toContain('<a href="/problems/two-sum">int</a>');
    expect(html).toContain(`<a href="mailto:a@b.c" rel="${UGC_REL}">mail</a>`);
  });

  it("never leaves a protocol-relative or backslash href (other hosts stay unreachable)", async () => {
    for (const md of ["[a](//evil.com)", "[a](\\\\evil.com)", "[a](/\\evil.com)", "[a](https:/\\evil.com)"]) {
      for (const html of [await server(md), preview(md)]) {
        for (const t of tags(html)) {
          const href = t.attrs.get("href");
          if (href === undefined) continue;
          expect(href, md).not.toMatch(/^[\\/]{2}|^\/\\|\\/);
          expect(safeHref(href), md).toBe(true);
        }
      }
    }
    expect(await server("[a](//evil.com)")).not.toContain("href");
  });

  it("highlighting a 200-line block is fast after warm-up (benchmark, not a gate)", async () => {
    const block = Array.from({ length: 200 }, (_, i) => `x_${i} = [j * ${i} for j in range(${i})]  # line ${i}`).join("\n");
    await server(`\`\`\`python\n${block}\n\`\`\``);
    const runs = 5;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) {
      // A different block each run, so the LRU cache does not answer.
      await server(`\`\`\`python\n${block}\n# run ${i} ${Math.random()}\n\`\`\``);
    }
    const avg = (performance.now() - start) / runs;
    console.log(`[bench] 200-line python highlight + render: ${avg.toFixed(1)} ms avg (target < 30 ms)`);
    expect(avg).toBeLessThan(500);
  });
});
