// src/app/global-error.tsx replaces the root layout: it must render a whole
// document on its own, load nothing external (CSP) and never show the error
// message, only the digest.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GlobalError from "@/app/global-error";

const render = (error: unknown) => renderToStaticMarkup(createElement(GlobalError, { error, retry: () => {} }));

describe("global-error", () => {
  it("renders its own dark html/body with an alert, a retry button and a home link", () => {
    const html = render(Object.assign(new Error("db password is hunter2"), { digest: "123456789" }));
    expect(html).toMatch(/^<html lang="en" class="dark"/);
    expect(html).toContain("<body");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h1");
    expect(html).toMatch(/<button type="button"[^>]*>Try again<\/button>/);
    expect(html).toMatch(/<a href="\/"[^>]*>Home<\/a>/);
    expect(html).toContain("<title>Error | LemmaYard</title>");
    expect(html).toContain("Error ID: 123456789");
    expect(html).not.toContain("hunter2");
  });

  it("loads no external resource: no script, stylesheet link, image or font URL", () => {
    const html = render(new Error("x"));
    expect(html).not.toMatch(/<script|<link|<img|<iframe|url\(|https?:\/\//);
  });

  it("omits the footnote without a digest, also for thrown non-Error values", () => {
    for (const error of [new Error("x"), "a string", null, { digest: 42 }]) {
      expect(render(error)).not.toContain("Error ID");
    }
  });
});
