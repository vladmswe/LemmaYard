// Markdown sanitization (AC-M3-5): problem statements render through
// react-markdown + remark-gfm + rehype-sanitize, never as raw HTML.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "@/components/problem/markdown";

const render = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md));

describe("Markdown sanitization (AC-M3-5)", () => {
  it("never emits a live <script> element", () => {
    const html = render("Hello\n\n<script>alert(1)</script>\n\nafter <script>alert(2)</script>");
    expect(html).not.toMatch(/<script/i);
    // Raw HTML nodes are dropped; only the surrounding markdown text remains.
    expect(html).toBe("<p>Hello</p>\n\n<p>after alert(2)</p>");
  });

  it("never emits an <img> with an event handler", () => {
    const html = render('<img src="x" onerror="alert(1)">\n\n![pic](x.png "t")');
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).not.toMatch(/\son\w+=/i);
  });

  it("drops javascript: links", () => {
    const html = render("[x](javascript:alert(1)) and [y](JaVaScRiPt:alert(2)) and [z](  javascript:alert(3))");
    expect(html).not.toMatch(/href="\s*javascript:/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  it("drops other dangerous URL schemes and raw HTML attributes", () => {
    const html = render(
      '[d](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==) <a href="javascript:alert(1)">a</a> <iframe src="https://evil.example"></iframe> <div style="x" onclick="y">z</div>',
    );
    expect(html).not.toMatch(/href="data:/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/<a [^>]*href="javascript/i);
    expect(html).not.toMatch(/onclick=/i);
  });

  it("keeps safe links", () => {
    expect(render("[docs](https://example.com/a)")).toContain('href="https://example.com/a"');
  });

  it("renders code, lists and GFM tables", () => {
    const html = render(
      "Use `nums`.\n\n```\nx = 1\n```\n\n- one\n- two\n\n1. a\n2. b\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~old~~",
    );
    expect(html).toContain("<code>nums</code>");
    expect(html).toMatch(/<pre><code>x = 1\n<\/code><\/pre>/);
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toMatch(/<table>[\s\S]*<th>a<\/th>[\s\S]*<td>1<\/td>/);
    expect(html).toContain("<del>old</del>");
  });

  it("demotes h1 so the problem title stays the only h1", () => {
    expect(render("# Title")).toBe("<h2>Title</h2>");
  });
});
