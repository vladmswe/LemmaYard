// AC-G-1-9: complexity data (every row has a worst case, bounds look like
// O(...)/Θ(...)/Ω(...), every cell has a qualifier) and its rendering text.
import { describe, expect, it } from "vitest";

import { formatCell, formatCells } from "@/components/guide/content/ComplexityTable";
import { LESSON_DATA, LESSON_SLUGS } from "@/content/learn";
import { FIXTURE_LESSON } from "@/content/learn/_fixture";
import { BOUND_RE, complexityTableSchema, type ComplexityCell, type ComplexityTableData } from "@/lib/guide/content/types";

function tableProblems(tables: readonly ComplexityTableData[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const t of tables) {
    if (ids.has(t.id)) problems.push(`duplicate table id ${t.id}`);
    ids.add(t.id);
    const parsed = complexityTableSchema.safeParse(t);
    if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `${t.id} ${i.path.join(".")}: ${i.message}`));
  }
  return problems;
}

describe.each([...LESSON_SLUGS, "_fixture"])("complexity.ts of %s", (slug) => {
  const tables = slug === "_fixture" ? FIXTURE_LESSON.tables : LESSON_DATA[slug as keyof typeof LESSON_DATA].tables;
  it("is valid", () => {
    expect(tableProblems(tables)).toEqual([]);
    for (const t of tables) {
      for (const row of t.rows) {
        expect(row.cells.some((c) => c.q === "worst"), `${t.id} / ${row.op}: worst case`).toBe(true);
        for (const c of row.cells) expect(c.bound).toMatch(BOUND_RE);
      }
    }
  });
});

describe("complexity rules catch mistakes", () => {
  const table = (cells: unknown[]) => ({ id: "t", caption: "c", rows: [{ op: "get", cells, why: "w" }] });
  const issues = (t: unknown) => complexityTableSchema.safeParse(t).error?.issues.map((i) => i.message) ?? [];

  it("rejects a row without a worst-case cell", () => {
    expect(issues(table([{ bound: "O(1)", q: "average" }]))).toEqual(["every row needs a worst-case cell"]);
  });
  it("rejects bounds that are not O/Θ/Ω", () => {
    expect(issues(table([{ bound: "log n", q: "worst" }]))).toHaveLength(1);
    expect(issues(table([{ bound: "O()", q: "worst" }]))).toHaveLength(1);
    expect(issues(table([{ bound: "Θ(n log n)", q: "worst" }]))).toEqual([]);
  });
  it("rejects a cell without a qualifier at runtime and at type level", () => {
    expect(issues(table([{ bound: "O(1)" }])).length).toBeGreaterThan(0);
    // @ts-expect-error a ComplexityCell must carry a qualifier
    const noQualifier: ComplexityCell = { bound: "O(1)" };
    expect(noQualifier.bound).toBe("O(1)");
  });
});

describe("cell text", () => {
  it('reads "O(1) average · O(n) worst" with conditions', () => {
    expect(formatCells([{ bound: "O(1)", q: "average" }, { bound: "O(n)", q: "worst" }])).toBe("O(1) average · O(n) worst");
    expect(formatCell({ bound: "O(1)", q: "worst", cond: "given the node" })).toBe("O(1) worst (given the node)");
  });
});
