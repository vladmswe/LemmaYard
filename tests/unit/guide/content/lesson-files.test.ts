// AC-G-1-8: every lesson folder is complete and consistent. Published lessons
// get the content checks (headings, word count, component refs); drafts only
// the structural ones. The pipeline fixture has its own describe.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LESSON_DATA, LESSON_SLUGS, getLesson } from "@/content/learn";
import { FIXTURE_LESSON } from "@/content/learn/_fixture";
import { GLOSSARY } from "@/content/learn/glossary";
import { lessonMetaSchema, type LessonData } from "@/lib/guide/content/types";

const LEARN = path.join(process.cwd(), "src/content/learn");
const PROBLEMS = path.join(process.cwd(), "problems");
const REQUIRED_FILES = ["lesson.mdx", "meta.ts", "quiz.ts", "complexity.ts", "glossary.ts"];

// PLAN-GUIDE 1.3: exact h2 text in this order; OPS = one or more free operation headings.
const OPS = Symbol("operation sections");
const COMMON: (string | typeof OPS)[] = [
  "Why it exists",
  "Mental model",
  OPS,
  "Cost",
  "Pitfalls",
  "In your language",
  "When to use it",
  "Check yourself",
  "Practice",
  "Recap",
];
const HEADINGS: Record<string, (string | typeof OPS)[]> = {
  "complexity-basics": [
    "Why it exists",
    "Counting steps",
    "Growth rates",
    "Best, worst, average, amortized",
    "Notation used in this guide",
    "Check yourself",
    "Practice",
    "Recap",
  ],
  "choosing-a-structure": ["Why it exists", "Decision table", "Combining structures", "Check yourself", "Practice", "Recap"],
};
const WORDS: Record<string, [number, number]> = { "complexity-basics": [700, 1500], "choosing-a-structure": [700, 1500] };
const DEFAULT_WORDS: [number, number] = [1200, 2000];

// ------------------------------------------------------------ MDX analysis

/** MDX without comments and fenced code (code fences may contain anything). */
function stripMdx(mdx: string): string {
  return mdx.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "");
}

function h2Headings(mdx: string): string[] {
  return [...stripMdx(mdx).matchAll(/^##[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)].map((m) => (m[1] as string).trim());
}

/** Prose words outside code fences, JSX tags, imports/exports and markdown syntax. */
function proseWordCount(mdx: string): number {
  const text = stripMdx(mdx)
    .replace(/^(import|export)\s.*$/gm, "")
    .replace(/<[A-Za-z][^>]*\/>/g, " ")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/`[^`]*`/g, " x ")
    .replace(/\]\([^)]*\)/g, "]");
  return (text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
}

interface JsxUse {
  name: string;
  attrs: Record<string, string>;
}

function jsxUses(mdx: string, names: readonly string[]): JsxUse[] {
  const re = new RegExp(`<(${names.join("|")})\\b([^>]*?)/?>`, "g");
  return [...stripMdx(mdx).matchAll(re)].map((m) => ({
    name: m[1] as string,
    attrs: Object.fromEntries([...(m[2] as string).matchAll(/([A-Za-z]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  }));
}

/** Problems with the required headings (presence and order); [] when fine. */
function headingProblems(found: readonly string[], required: readonly (string | typeof OPS)[]): string[] {
  const fixed = required.filter((h): h is string => h !== OPS);
  const problems: string[] = [];
  const positions = fixed.map((h) => found.indexOf(h));
  fixed.forEach((h, i) => {
    if (positions[i] === -1) problems.push(`missing "## ${h}"`);
  });
  for (let i = 1; i < positions.length; i++) {
    const a = positions[i - 1] as number;
    const b = positions[i] as number;
    if (a !== -1 && b !== -1 && b < a) problems.push(`"## ${fixed[i]}" must come after "## ${fixed[i - 1]}"`);
  }
  const k = required.indexOf(OPS);
  if (k > 0) {
    const before = found.indexOf(required[k - 1] as string);
    const after = found.indexOf(required[k + 1] as string);
    if (before !== -1 && after !== -1 && after - before < 2) {
      problems.push(`at least one operation section between "## ${String(required[k - 1])}" and "## ${String(required[k + 1])}"`);
    }
  }
  return problems;
}

/** Problems with component references of one lesson's MDX; [] when fine. */
function refProblems(mdx: string, lesson: LessonData): string[] {
  const problems: string[] = [];
  const uses = jsxUses(mdx, ["Viz", "CodeTabs", "Quiz", "ComplexityTable", "Term"]);
  const vizIds = new Set<string>();
  for (const u of uses) {
    if ((u.name === "Viz" || u.name === "CodeTabs") && u.attrs.code !== undefined) {
      const [slug, name] = u.attrs.code.split("/");
      for (const ext of [".py", ".js", ".cases.json"]) {
        const file = path.join(LEARN, slug ?? "", "code", `${name}${ext}`);
        if (!existsSync(file)) problems.push(`<${u.name} code="${u.attrs.code}">: missing ${path.relative(process.cwd(), file)}`);
      }
    } else if (u.name === "CodeTabs") {
      problems.push("<CodeTabs> needs a code attribute");
    }
    if (u.name === "Viz") {
      const id = u.attrs.id;
      if (!id) problems.push("<Viz> needs an id");
      else if (vizIds.has(id)) problems.push(`<Viz id="${id}"> is used twice on this page`);
      else vizIds.add(id);
    }
    if (u.name === "Quiz" && !lesson.quizzes.some((q) => q.id === u.attrs.id)) {
      problems.push(`<Quiz id="${u.attrs.id}">: not in quiz.ts`);
    }
    if (u.name === "ComplexityTable" && !lesson.tables.some((t) => t.id === u.attrs.id)) {
      problems.push(`<ComplexityTable id="${u.attrs.id}">: not in complexity.ts`);
    }
    if (u.name === "Term") {
      const id = u.attrs.id ?? "";
      if (!lesson.glossary.some((g) => g.id === id) && !GLOSSARY.some((g) => g.id === id)) {
        problems.push(`<Term id="${id}">: no glossary.ts defines it`);
      }
    }
  }
  return problems;
}

// ------------------------------------------------------------ the checks

function readMdx(slug: string): string {
  return readFileSync(path.join(LEARN, slug, "lesson.mdx"), "utf8");
}

describe("lesson folders", () => {
  it("contain exactly the registered lessons plus the pipeline fixture", () => {
    const dirs = readdirSync(LEARN).filter((d) => statSync(path.join(LEARN, d)).isDirectory());
    expect(dirs.sort()).toEqual([...LESSON_SLUGS, "_fixture"].sort());
  });

  describe.each([...LESSON_SLUGS])("%s", (slug) => {
    const lesson = LESSON_DATA[slug];
    const { meta } = lesson;

    it("has every required file", () => {
      for (const f of REQUIRED_FILES) expect(existsSync(path.join(LEARN, slug, f)), f).toBe(true);
    });

    it("has a valid meta.ts for this folder", () => {
      expect(lessonMetaSchema.safeParse(meta).error?.issues ?? []).toEqual([]);
      expect(meta.slug).toBe(slug);
      expect(meta.summary.length).toBeLessThanOrEqual(160);
    });

    it("lists existing prerequisites with a smaller order", () => {
      for (const p of meta.prerequisites) {
        const pre = getLesson(p);
        expect(pre, `prerequisite ${p}`).toBeDefined();
        expect(pre?.order, `prerequisite ${p}`).toBeLessThan(meta.order);
      }
    });

    it("links practice problems that exist in problems/", () => {
      for (const p of meta.practice) {
        expect(existsSync(path.join(PROBLEMS, p.slug, "meta.json")), `problems/${p.slug}/meta.json`).toBe(true);
      }
    });

    it("compiles as MDX-safe references (code refs, ids) in any status", () => {
      expect(refProblems(readMdx(slug), lesson)).toEqual([]);
    });

    it.runIf(meta.status === "published")("has the required h2 headings in order", () => {
      expect(headingProblems(h2Headings(readMdx(slug)), HEADINGS[slug] ?? COMMON)).toEqual([]);
    });

    it.runIf(meta.status === "published")("has a prose word count within range", () => {
      const [min, max] = WORDS[slug] ?? DEFAULT_WORDS;
      const n = proseWordCount(readMdx(slug));
      expect(n, "prose words").toBeGreaterThanOrEqual(min);
      expect(n, "prose words").toBeLessThanOrEqual(max);
    });
  });
});

describe("pipeline fixture (_fixture)", () => {
  const mdx = readMdx("_fixture");

  it("has every required file and a valid meta.ts, outside the registry", () => {
    for (const f of REQUIRED_FILES) expect(existsSync(path.join(LEARN, "_fixture", f)), f).toBe(true);
    expect(lessonMetaSchema.safeParse(FIXTURE_LESSON.meta).error?.issues ?? []).toEqual([]);
    expect((LESSON_SLUGS as readonly string[]).includes("_fixture")).toBe(false);
  });

  it("uses every lesson component and its references resolve", () => {
    const names = new Set(
      jsxUses(mdx, ["Viz", "CodeTabs", "Quiz", "ComplexityTable", "Callout", "PracticeLinks", "Term"]).map((u) => u.name),
    );
    expect([...names].sort()).toEqual(["Callout", "CodeTabs", "ComplexityTable", "PracticeLinks", "Quiz", "Term", "Viz"]);
    expect(refProblems(mdx, FIXTURE_LESSON)).toEqual([]);
  });
});

describe("MDX checks catch mistakes", () => {
  it("finds h2 headings outside comments and code fences", () => {
    const mdx = "{/* ## Hidden */}\n## Why it exists\n```md\n## Not a heading\n```\n## Recap\n";
    expect(h2Headings(mdx)).toEqual(["Why it exists", "Recap"]);
  });

  it("reports missing, misordered headings and a missing operation section", () => {
    const ok = ["Why it exists", "Mental model", "Insert", "Cost", "Pitfalls", "In your language", "When to use it", "Check yourself", "Practice", "Recap"];
    expect(headingProblems(ok, COMMON)).toEqual([]);
    expect(headingProblems(ok.filter((h) => h !== "Pitfalls"), COMMON)).toEqual(['missing "## Pitfalls"']);
    const swapped = ["Why it exists", "Mental model", "Insert", "Pitfalls", "Cost", "In your language", "When to use it", "Check yourself", "Practice", "Recap"];
    expect(headingProblems(swapped, COMMON)).toEqual(['"## Pitfalls" must come after "## Cost"']);
    const noOps = ok.filter((h) => h !== "Insert");
    expect(headingProblems(noOps, COMMON)).toHaveLength(1);
  });

  it("counts prose words outside code, JSX and imports", () => {
    const mdx = 'import { x } from "./x";\n\nOne two three.\n\n<Viz def={x} id="a" />\n\n```py\nnot counted at all\n```\n\nFour `code` five.';
    expect(proseWordCount(mdx)).toBe(6); // One two three Four x(code) five
  });

  it("flags unresolved refs and duplicate viz ids", () => {
    const mdx = [
      '<Viz def={a} id="dup" code="_fixture/fixture_stack" />',
      '<Viz def={b} id="dup" code="_fixture/missing" />',
      '<Quiz id="nope" />',
      '<ComplexityTable id="nope" />',
      '<Term id="nope">x</Term>',
    ].join("\n");
    const problems = refProblems(mdx, FIXTURE_LESSON);
    expect(problems.some((p) => p.includes('<Viz id="dup"> is used twice'))).toBe(true);
    expect(problems.filter((p) => p.includes("_fixture/missing"))).toHaveLength(3);
    expect(problems).toContain('<Quiz id="nope">: not in quiz.ts');
    expect(problems).toContain('<ComplexityTable id="nope">: not in complexity.ts');
    expect(problems).toContain('<Term id="nope">: no glossary.ts defines it');
  });

  it("rejects bad metadata", () => {
    const bad = { ...FIXTURE_LESSON.meta, summary: "x".repeat(161), track: "misc", updated: "17.10.2026" };
    const paths = (lessonMetaSchema.safeParse(bad).error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths.sort()).toEqual(["summary", "track", "updated"]);
  });
});
