// Server-only syntax highlighting for guide code samples (PLAN-GUIDE 2.6).
// Shiki core with the JavaScript regex engine (no WASM), Python + JavaScript,
// light and dark themes as CSS variables (mapped in guide.css). Nothing here
// may reach a client bundle: only the HTML string leaves the server.
import type { ShikiTransformer } from "shiki";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import type { CodeLanguage, LineId } from "@/lib/guide/contracts";

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
    langs: [import("shiki/langs/python.mjs"), import("shiki/langs/javascript.mjs")],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

function lineAttributes(idsByLine: ReadonlyMap<number, readonly LineId[]>): ShikiTransformer {
  return {
    name: "lemmayard-line-ids",
    pre(node) {
      // The surrounding scroll box is the focusable region, not the <pre>.
      delete node.properties.tabindex;
    },
    line(node, line) {
      node.properties["data-line"] = String(line);
      const ids = idsByLine.get(line);
      if (ids && ids.length > 0) node.properties["data-line-ids"] = ids.join(" ");
    },
  };
}

/**
 * Highlights `source`; every line becomes
 * `<span class="line" data-line="N" data-line-ids="a b">` (ids only on marked lines).
 */
export async function highlightCode(
  source: string,
  language: CodeLanguage,
  idsByLine: ReadonlyMap<number, readonly LineId[]> = new Map(),
): Promise<string> {
  const hl = await getHighlighter();
  return hl.codeToHtml(source, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
    transformers: [lineAttributes(idsByLine)],
  });
}
