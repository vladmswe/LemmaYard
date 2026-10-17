// Lesson data types of the Data Structures guide (/learn), PLAN-GUIDE 2.6.
// Every lesson folder `src/content/learn/<slug>/` exports these from its
// meta.ts, quiz.ts, complexity.ts and glossary.ts.
import { z } from "zod";

export const TRACKS = ["foundations", "linear", "hashing", "trees", "graphs", "bonus", "review"] as const;
export type Track = (typeof TRACKS)[number];

export const TRACK_LABELS: Record<Track, string> = {
  foundations: "Foundations",
  linear: "Linear structures",
  hashing: "Hashing",
  trees: "Trees",
  graphs: "Graphs",
  bonus: "Bonus",
  review: "Review",
};

export interface PracticeLink {
  slug: string; // must exist in problems/
  why: string;
}

export interface LessonMeta {
  slug: string;
  title: string;
  summary: string; // reason to exist, <= 160 chars
  track: Track;
  order: number;
  prerequisites: string[];
  minutes: number;
  status: "draft" | "published";
  practice: PracticeLink[];
  updated: string; // YYYY-MM-DD
}

export const QUALIFIERS = ["worst", "average", "amortized", "expected", "best"] as const;
export type Qualifier = (typeof QUALIFIERS)[number];

export interface ComplexityCell {
  bound: string; // like "O(log n)"
  q: Qualifier;
  cond?: string; // e.g. "if balanced", "given the node"
}
export interface ComplexityRow {
  op: string;
  cells: ComplexityCell[]; // >= 1 cell with q "worst"
  why: string;
}
export interface ComplexityTableData {
  id: string;
  caption: string;
  rows: ComplexityRow[];
  space?: string;
  notes?: string[];
}

export interface QuizChoice {
  id: string;
  label: string;
  feedback: string;
}
export interface QuizQuestion {
  id: string;
  kind: "single" | "multi" | "order";
  prompt: string;
  code?: string;
  choices: QuizChoice[];
  answer: string[]; // "order": every choice id in the right order
  explain: string;
  recall?: string; // earlier lesson slug
  predictsState?: boolean; // true for "what is the state after ..." questions
}
export interface QuizData {
  id: string;
  questions: QuizQuestion[];
}

export interface GlossaryEntry {
  id: string; // [a-z0-9-]+
  term: string;
  definition: string;
}

/** What a lesson folder contributes besides its MDX. */
export interface LessonData {
  meta: LessonMeta;
  quizzes: readonly QuizData[];
  tables: readonly ComplexityTableData[];
  glossary: readonly GlossaryEntry[];
}

// ------------------------------------------------------------ runtime schemas

const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Lesson slugs are kebab-case; the pipeline fixture folder is "_fixture". */
export const lessonSlugRe = /^_?[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SUMMARY_MAX = 160;
export const BOUND_RE = /^(O|Θ|Ω)\(.+\)$/;

export const lessonMetaSchema = z.strictObject({
  slug: z.string().regex(lessonSlugRe),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(SUMMARY_MAX),
  track: z.enum(TRACKS),
  order: z.int().positive(),
  prerequisites: z.array(z.string().regex(kebab)),
  minutes: z.int().positive().max(120),
  status: z.enum(["draft", "published"]),
  practice: z.array(z.strictObject({ slug: z.string().regex(kebab), why: z.string().trim().min(1) })),
  updated: z.iso.date(),
});

export const complexityCellSchema = z.strictObject({
  bound: z.string().regex(BOUND_RE, "bound must look like O(...), Θ(...) or Ω(...)"),
  q: z.enum(QUALIFIERS),
  cond: z.string().trim().min(1).optional(),
});

export const complexityTableSchema = z.strictObject({
  id: z.string().regex(kebab),
  caption: z.string().trim().min(1),
  rows: z
    .array(
      z.strictObject({
        op: z.string().trim().min(1),
        cells: z
          .array(complexityCellSchema)
          .min(1)
          .refine((cells) => cells.some((c) => c.q === "worst"), "every row needs a worst-case cell"),
        why: z.string().trim().min(1),
      }),
    )
    .min(1),
  space: z.string().trim().min(1).optional(),
  notes: z.array(z.string().trim().min(1)).optional(),
});

export const quizQuestionSchema = z
  .strictObject({
    id: z.string().regex(kebab),
    kind: z.enum(["single", "multi", "order"]),
    prompt: z.string().trim().min(1),
    code: z.string().optional(),
    choices: z
      .array(z.strictObject({ id: z.string().regex(kebab), label: z.string().trim().min(1), feedback: z.string().trim().min(1) }))
      .min(2),
    answer: z.array(z.string()).min(1),
    explain: z.string().trim().min(1),
    recall: z.string().regex(kebab).optional(),
    predictsState: z.boolean().optional(),
  })
  .superRefine((q, ctx) => {
    const ids = q.choices.map((c) => c.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: `${q.id}: duplicate choice ids` });
    for (const a of q.answer) {
      if (!ids.includes(a)) ctx.addIssue({ code: "custom", message: `${q.id}: answer "${a}" is not a choice` });
    }
    if (new Set(q.answer).size !== q.answer.length) ctx.addIssue({ code: "custom", message: `${q.id}: duplicate answer ids` });
    if (q.kind === "single" && q.answer.length !== 1) {
      ctx.addIssue({ code: "custom", message: `${q.id}: a single-choice question has exactly one answer` });
    }
    if (q.kind === "order" && q.answer.length !== ids.length) {
      ctx.addIssue({ code: "custom", message: `${q.id}: an order question lists every choice in its answer` });
    }
  });

export const quizDataSchema = z.strictObject({
  id: z.string().regex(kebab),
  questions: z.array(quizQuestionSchema).min(1),
});

export const glossaryEntrySchema = z.strictObject({
  id: z.string().regex(kebab),
  term: z.string().trim().min(1),
  definition: z.string().trim().min(1),
});
