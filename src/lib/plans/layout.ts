// Order of a study plan (docs/specs/community.md §B.8): the unsectioned items
// first ("Problems"), then the sections in order, each with its items. Pure
// helpers shared by the editor (Move up / Move down, no drag-only
// interaction) and the server (permutation check, positions).

export type PlanLayout = {
  unsectioned: string[];
  sections: { id: string; items: string[] }[];
};

export type Direction = "up" | "down";

/** Groups in display order: index 0 is the unsectioned list. */
function groups(layout: PlanLayout): string[][] {
  return [layout.unsectioned, ...layout.sections.map((s) => s.items)];
}

function fromGroups(layout: PlanLayout, next: string[][]): PlanLayout {
  return {
    unsectioned: next[0],
    sections: layout.sections.map((s, i) => ({ id: s.id, items: next[i + 1] })),
  };
}

/**
 * Moves one item a step. Inside a group it swaps with its neighbour; at the
 * edge it crosses into the previous group (as its last item) or the next one
 * (as its first), so the keyboard alone can move an item anywhere. Null when
 * it cannot move (first item overall moving up, last moving down) or is unknown.
 */
export function moveItem(layout: PlanLayout, itemId: string, direction: Direction): PlanLayout | null {
  const gs = groups(layout).map((g) => [...g]);
  const gi = gs.findIndex((g) => g.includes(itemId));
  if (gi === -1) return null;
  const g = gs[gi];
  const i = g.indexOf(itemId);
  if (direction === "up") {
    if (i > 0) {
      [g[i - 1], g[i]] = [g[i], g[i - 1]];
    } else {
      if (gi === 0) return null;
      g.splice(i, 1);
      gs[gi - 1].push(itemId);
    }
  } else if (i < g.length - 1) {
    [g[i], g[i + 1]] = [g[i + 1], g[i]];
  } else {
    if (gi === gs.length - 1) return null;
    g.splice(i, 1);
    gs[gi + 1].unshift(itemId);
  }
  return fromGroups(layout, gs);
}

/** Swaps a section with its neighbour (sections never move above the unsectioned list). */
export function moveSection(layout: PlanLayout, sectionId: string, direction: Direction): PlanLayout | null {
  const i = layout.sections.findIndex((s) => s.id === sectionId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= layout.sections.length) return null;
  const sections = [...layout.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { unsectioned: layout.unsectioned, sections };
}

/**
 * True when `layout` names exactly `itemIds` and `sectionIds`, each once:
 * the server only applies a full permutation of the plan's current content.
 */
export function isPermutationOf(layout: PlanLayout, itemIds: Iterable<string>, sectionIds: Iterable<string>): boolean {
  const items = new Set(itemIds);
  const sections = new Set(sectionIds);
  const seenItems = new Set<string>();
  for (const id of groups(layout).flat()) {
    if (!items.has(id) || seenItems.has(id)) return false;
    seenItems.add(id);
  }
  if (seenItems.size !== items.size) return false;
  const seenSections = new Set<string>();
  for (const s of layout.sections) {
    if (!sections.has(s.id) || seenSections.has(s.id)) return false;
    seenSections.add(s.id);
  }
  return seenSections.size === sections.size;
}

/** `position` and `section_id` of every item, and `position` of every section, from a layout (0-based). */
export function layoutPositions(layout: PlanLayout): {
  items: { id: string; sectionId: string | null; position: number }[];
  sections: { id: string; position: number }[];
} {
  const items = layout.unsectioned.map((id, position) => ({ id, sectionId: null as string | null, position }));
  for (const s of layout.sections) {
    s.items.forEach((id, position) => items.push({ id, sectionId: s.id, position }));
  }
  return { items, sections: layout.sections.map((s, position) => ({ id: s.id, position })) };
}
