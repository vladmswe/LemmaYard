// Server-only Shiki for code blocks in user markdown (docs/specs/community.md
// §C.4, AC-C-MD-3). Same setup as the guide (src/server/guide/highlight.ts):
// Shiki core + the JavaScript regex engine (no WASM), GitHub light/dark
// themes as CSS variables. Languages load lazily, one grammar per allowlisted
// language, and results are cached per process (LRU, 500 entries, keyed by
// sha256(lang + code)). Shiki escapes the code itself, so its HAST is safe;
// its inline `style` attributes only set colour variables.
import { createHash } from "node:crypto";

import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import type { CodeLanguage } from "@/lib/community/types";
import {
  isElement,
  textContent,
  walkElements,
  type HastElement,
  type HastParent,
} from "@/lib/community/markdown-schema";

type Highlightable = Exclude<CodeLanguage, "text">;

const GRAMMARS: Record<Highlightable, () => Promise<unknown>> = {
  python: () => import("shiki/langs/python.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
};

const THEMES = { light: "github-light-default", dark: "github-dark-default" } as const;

let highlighter: Promise<HighlighterCore> | undefined;
const loaded = new Map<Highlightable, Promise<void>>();

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import("shiki/themes/github-light-default.mjs"), import("shiki/themes/github-dark-default.mjs")],
    langs: [],
    // forgiving: a grammar regex the JS engine cannot translate matches nothing instead of throwing.
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

async function ensureLanguage(hl: HighlighterCore, lang: Highlightable): Promise<void> {
  let pending = loaded.get(lang);
  if (!pending) {
    pending = GRAMMARS[lang]().then((mod) =>
      hl.loadLanguage((mod as { default: Parameters<HighlighterCore["loadLanguage"]>[0] }).default),
    );
    loaded.set(lang, pending);
  }
  await pending;
}

const CACHE_MAX = 500;
const cache = new Map<string, HastElement>();

function cacheGet(key: string): HastElement | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: HastElement): void {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

export function isHighlightable(lang: string): lang is Highlightable {
  return Object.hasOwn(GRAMMARS, lang);
}

/** `<pre class="shiki">…</pre>` as HAST for `code` in `lang` (a fresh copy, safe to mutate). */
export async function highlightToHast(code: string, lang: Highlightable): Promise<HastElement> {
  const key = createHash("sha256").update(lang).update("\0").update(code).digest("hex");
  let pre = cacheGet(key);
  if (!pre) {
    const hl = await getHighlighter();
    await ensureLanguage(hl, lang);
    const root = hl.codeToHast(code, { lang, themes: THEMES, defaultColor: false }) as unknown as HastParent;
    const first = root.children.find((c) => isElement(c, "pre")) as HastElement | undefined;
    if (!first) throw new Error("shiki returned no <pre>");
    pre = first;
    cacheSet(key, pre);
  }
  return structuredClone(pre);
}

/** Size of the highlight cache (tests). */
export function highlightCacheSize(): number {
  return cache.size;
}

/**
 * rehype step (after sanitize): `pre > code.language-x` with an allowlisted,
 * highlightable language becomes Shiki's `<pre class="shiki">`. Plain and
 * unknown-language blocks stay as escaped text.
 */
export function rehypeShikiUserCode() {
  return async (tree: HastParent) => {
    const jobs: Promise<void>[] = [];
    walkElements(tree, (el, parent, index) => {
      if (el.tagName !== "pre") return;
      const code = el.children.find((c) => isElement(c, "code")) as HastElement | undefined;
      if (!code) return;
      const classes = Array.isArray(code.properties.className) ? (code.properties.className as unknown[]).map(String) : [];
      const lang = classes.find((c) => c.startsWith("language-"))?.slice("language-".length);
      if (!lang || !isHighlightable(lang)) return;
      // Fenced code ends with a newline; Shiki would render an empty last line.
      const source = textContent(code).replace(/\n$/, "");
      jobs.push(
        highlightToHast(source, lang).then((pre) => {
          pre.properties["data-language"] = lang;
          parent.children[index] = pre;
        }),
      );
    });
    await Promise.all(jobs);
  };
}
