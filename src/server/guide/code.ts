// Code bundles for lesson players and <CodeTabs> (PLAN-GUIDE 2.6): reads
// `src/content/learn/<slug>/code/<name>.py|.js`, strips the @line markers and
// highlights both listings with Shiki. Memoised per ref for the process.
// The files are read at request time, so next.config.ts traces them
// (outputFileTracingIncludes) for serverless deployments.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseMarkedSource } from "@/lib/guide/code/markers";
import type { CodeBundle, CodeLanguage, CodeListing } from "@/lib/guide/contracts";

import { highlightCode } from "./highlight";

/** "<lesson-slug>/<name>", e.g. "heaps/min_heap"; the fixture lesson uses "_fixture/...". */
export const CODE_REF_RE = /^_?[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z][a-z0-9_]*$/;

export const LEARN_CONTENT_DIR = path.join(process.cwd(), "src", "content", "learn");

const EXT: Record<CodeLanguage, string> = { python: ".py", javascript: ".js" };

/** Absolute path of a code sample file (validated ref, no traversal). */
export function codeFilePath(ref: string, ext: ".py" | ".js" | ".cases.json"): string {
  if (!CODE_REF_RE.test(ref)) throw new Error(`Invalid code ref "${ref}" (expected "<lesson-slug>/<name>")`);
  const [slug, name] = ref.split("/") as [string, string];
  return path.join(LEARN_CONTENT_DIR, slug, "code", `${name}${ext}`);
}

async function loadListing(ref: string, language: CodeLanguage): Promise<CodeListing> {
  const file = codeFilePath(ref, EXT[language] as ".py" | ".js");
  const text = await readFile(file, "utf8");
  const { source, lineMap, idsByLine } = parseMarkedSource(text, language, path.relative(process.cwd(), file));
  const html = await highlightCode(source, language, idsByLine);
  return { ref, language, html, lineMap, source };
}

const cache = new Map<string, Promise<CodeBundle>>();

export function loadCodeBundle(ref: string): Promise<CodeBundle> {
  let hit = cache.get(ref);
  if (!hit) {
    hit = Promise.all([loadListing(ref, "python"), loadListing(ref, "javascript")]).then(
      ([python, javascript]) => ({ python, javascript }),
    );
    // A failed load (missing file, bad marker) is not cached, so a fix shows up in dev.
    hit.catch(() => cache.delete(ref));
    cache.set(ref, hit);
  }
  return hit;
}
