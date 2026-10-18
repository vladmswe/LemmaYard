// Server-side loader of the LeetCode catalog (docs/specs/leetcode-integration.md
// §6.5). Both JSON files are bundled with the server code (no filesystem read
// and no network request at runtime), validated with Zod once per process,
// merged, and memoized. Never sent to the client as a whole: callers return
// single entries (host lobby view, search route) only.
//
// Returns null when LEETCODE_CATALOG_ENABLED=0 (kill switch) or when either
// file is invalid: LeetCode auto-pick is then unavailable and hand-picked
// LeetCode links keep working.
import { catalogFileSchema, isHidden, mergeCatalog, overlayFileSchema, type CatalogSource, type LeetCodeProblem } from "@/lib/leetcode/catalog-schema";
import { provenanceOf, type LeetCodeProvenance } from "@/lib/leetcode/labels";
import type { Difficulty } from "@/lib/rooms/types";
import { getEnv } from "@/server/env";

import catalogJson from "./catalog.json";
import overlayJson from "./overlay.json";

export type LeetCodeCatalog = {
  source: CatalogSource;
  /** Every problem (catalog + overlay extras), sorted by number. */
  problems: LeetCodeProblem[];
  /** Problems rooms may use: neither premium nor excluded. */
  visible: LeetCodeProblem[];
  bySlug: ReadonlyMap<string, LeetCodeProblem>;
};

export type CatalogLoad = { ok: true; catalog: LeetCodeCatalog } | { ok: false; issues: string[] };

/** Validates and merges raw file contents (pure apart from the arguments; used by tests too). */
export function loadCatalog(catalogRaw: unknown, overlayRaw: unknown): CatalogLoad {
  const catalog = catalogFileSchema.safeParse(catalogRaw);
  if (!catalog.success) return { ok: false, issues: catalog.error.issues.map((i) => `catalog.json ${i.path.join(".")}: ${i.message}`) };
  const overlay = overlayFileSchema.safeParse(overlayRaw);
  if (!overlay.success) return { ok: false, issues: overlay.error.issues.map((i) => `overlay.json ${i.path.join(".")}: ${i.message}`) };
  const merged = mergeCatalog(catalog.data, overlay.data);
  if (!merged.ok) return { ok: false, issues: merged.issues.map((i) => `overlay.json ${i}`) };
  return {
    ok: true,
    catalog: {
      source: catalog.data.source,
      problems: merged.problems,
      visible: merged.problems.filter((p) => !isHidden(p)),
      bySlug: new Map(merged.problems.map((p) => [p.slug, p])),
    },
  };
}

let memo: { value: LeetCodeCatalog | null } | undefined;

function buildOnce(): LeetCodeCatalog | null {
  const loaded = loadCatalog(catalogJson, overlayJson);
  if (loaded.ok) return loaded.catalog;
  // One line, no data: the files are in the repository, the test suite names the problems.
  console.error(`LeetCode catalog disabled: invalid data (${loaded.issues.length} issue${loaded.issues.length === 1 ? "" : "s"})`);
  return null;
}

/** The merged catalog, or null when switched off or invalid. */
export function getLeetCodeCatalog(): LeetCodeCatalog | null {
  if (getEnv().LEETCODE_CATALOG_ENABLED === "0") return null;
  memo ??= { value: buildOnce() };
  return memo.value;
}

/** A catalog problem usable in rooms (null for unknown, premium or excluded slugs). */
export function findVisibleProblem(catalog: LeetCodeCatalog, slug: string): LeetCodeProblem | null {
  const p = catalog.bySlug.get(slug);
  return p && !isHidden(p) ? p : null;
}

/**
 * Which values of a LeetCode slot snapshot are estimates: only for a slot
 * filled from the catalog (no room-list entry, and the snapshot still equals
 * the catalog values). Typed links and room-list entries carry what a person
 * entered, so they get no "estimated" labels.
 */
export function slotProvenance(slot: {
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  rating: number | null;
  bankId: string | null;
}): LeetCodeProvenance | null {
  if (slot.bankId !== null) return null;
  const catalog = getLeetCodeCatalog();
  const p = catalog?.bySlug.get(slot.slug);
  if (!p || p.title !== slot.title || p.rating !== slot.rating || p.difficulty !== slot.difficulty) return null;
  return provenanceOf(p);
}
