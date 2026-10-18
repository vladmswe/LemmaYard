// Study plan ordering (community C2): Move up / Move down for items (across
// section edges) and sections, the server's permutation check and positions.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isPermutationOf, layoutPositions, moveItem, moveSection, type PlanLayout } from "@/lib/plans/layout";

const layout: PlanLayout = {
  unsectioned: ["a", "b"],
  sections: [
    { id: "S1", items: ["c"] },
    { id: "S2", items: [] },
    { id: "S3", items: ["d", "e"] },
  ],
};

const flat = (l: PlanLayout) => [...l.unsectioned, ...l.sections.flatMap((s) => s.items)];

describe("moveItem", () => {
  it("swaps inside a group", () => {
    expect(moveItem(layout, "b", "up")!.unsectioned).toEqual(["b", "a"]);
    expect(moveItem(layout, "d", "down")!.sections[2].items).toEqual(["e", "d"]);
  });

  it("crosses into the previous group as its last item and the next as its first", () => {
    const up = moveItem(layout, "c", "up")!;
    expect(up.unsectioned).toEqual(["a", "b", "c"]);
    expect(up.sections[0].items).toEqual([]);
    const down = moveItem(layout, "c", "down")!;
    expect(down.sections[0].items).toEqual([]);
    expect(down.sections[1].items).toEqual(["c"]); // into the empty section
    expect(moveItem(down, "c", "down")!.sections[2].items).toEqual(["c", "d", "e"]);
  });

  it("is null at the very ends and for unknown ids", () => {
    expect(moveItem(layout, "a", "up")).toBeNull();
    expect(moveItem(layout, "e", "down")).toBeNull();
    expect(moveItem(layout, "zzz", "up")).toBeNull();
  });

  it("never loses or duplicates an item and keeps the sections (property)", () => {
    const ids = ["a", "b", "c", "d", "e"];
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(...ids), fc.constantFrom("up" as const, "down" as const)), { maxLength: 60 }), (moves) => {
        let current = layout;
        for (const [id, dir] of moves) current = moveItem(current, id, dir) ?? current;
        expect([...flat(current)].sort()).toEqual(ids);
        expect(current.sections.map((s) => s.id)).toEqual(["S1", "S2", "S3"]);
        expect(isPermutationOf(current, ids, ["S1", "S2", "S3"])).toBe(true);
      }),
    );
  });

  it("does not mutate its input", () => {
    const copy = structuredClone(layout);
    moveItem(layout, "c", "up");
    moveSection(layout, "S1", "down");
    expect(layout).toEqual(copy);
  });
});

describe("moveSection", () => {
  it("swaps with the neighbour and stops at the ends", () => {
    expect(moveSection(layout, "S2", "up")!.sections.map((s) => s.id)).toEqual(["S2", "S1", "S3"]);
    expect(moveSection(layout, "S2", "down")!.sections.map((s) => s.id)).toEqual(["S1", "S3", "S2"]);
    expect(moveSection(layout, "S1", "up")).toBeNull();
    expect(moveSection(layout, "S3", "down")).toBeNull();
    expect(moveSection(layout, "nope", "up")).toBeNull();
  });
});

describe("isPermutationOf", () => {
  const items = ["a", "b", "c", "d", "e"];
  const sections = ["S1", "S2", "S3"];
  it("accepts exactly the plan's items and sections", () => {
    expect(isPermutationOf(layout, items, sections)).toBe(true);
  });
  it.each([
    ["a missing item", { ...layout, unsectioned: ["a"] }],
    ["a duplicate item", { ...layout, unsectioned: ["a", "b", "a"] }],
    ["an item of another plan", { ...layout, unsectioned: ["a", "b", "x"] }],
    ["a missing section", { ...layout, sections: layout.sections.slice(0, 2) }],
    ["a duplicate section", { ...layout, sections: [...layout.sections, { id: "S1", items: [] }] }],
    ["a foreign section", { ...layout, sections: [{ id: "X", items: ["c"] }, ...layout.sections.slice(1)] }],
  ])("rejects %s", (_, bad) => {
    expect(isPermutationOf(bad as PlanLayout, items, sections)).toBe(false);
  });
});

describe("layoutPositions", () => {
  it("numbers items per group from 0 and sections in order", () => {
    expect(layoutPositions(layout)).toEqual({
      items: [
        { id: "a", sectionId: null, position: 0 },
        { id: "b", sectionId: null, position: 1 },
        { id: "c", sectionId: "S1", position: 0 },
        { id: "d", sectionId: "S3", position: 0 },
        { id: "e", sectionId: "S3", position: 1 },
      ],
      sections: [
        { id: "S1", position: 0 },
        { id: "S2", position: 1 },
        { id: "S3", position: 2 },
      ],
    });
  });
});
