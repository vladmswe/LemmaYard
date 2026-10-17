// Practice problems for <PracticeLinks> (PLAN-GUIDE 2.6): title and difficulty
// come from `problems/<slug>/meta.json` through the importer's metaSchema, so
// the guide needs no database. Traced for serverless via next.config.ts.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { metaSchema } from "@/lib/problems/schema";

export interface PracticeProblem {
  readonly slug: string;
  readonly title: string;
  readonly difficulty: "easy" | "medium" | "hard";
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PROBLEMS_DIR = path.join(process.cwd(), "problems");

const cache = new Map<string, Promise<PracticeProblem>>();

/** Reads and validates one problem's meta.json; throws if it is missing or invalid. */
export function getPracticeProblem(slug: string, dir: string = PROBLEMS_DIR): Promise<PracticeProblem> {
  if (!SLUG_RE.test(slug)) return Promise.reject(new Error(`Invalid problem slug "${slug}"`));
  const key = `${dir}\0${slug}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = readFile(path.join(dir, slug, "meta.json"), "utf8").then((text) => {
      const meta = metaSchema.parse(JSON.parse(text));
      if (meta.slug !== slug) throw new Error(`problems/${slug}/meta.json has slug "${meta.slug}"`);
      return { slug: meta.slug, title: meta.title, difficulty: meta.difficulty };
    });
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}
