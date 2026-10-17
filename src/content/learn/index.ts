// Lesson registry of the Data Structures guide (PLAN-GUIDE 2.6). Static
// imports only: every lesson's data modules, plus one explicit import() per
// lesson MDX so each lesson page bundles only its own content.
import type { MDXContent } from "mdx/types";

import type { LessonData, LessonMeta } from "@/lib/guide/content/types";

import { tables as complexityBasicsTables } from "./complexity-basics/complexity";
import { glossary as complexityBasicsGlossary } from "./complexity-basics/glossary";
import { meta as complexityBasicsMeta } from "./complexity-basics/meta";
import { quizzes as complexityBasicsQuizzes } from "./complexity-basics/quiz";
import { tables as arraysTables } from "./arrays/complexity";
import { glossary as arraysGlossary } from "./arrays/glossary";
import { meta as arraysMeta } from "./arrays/meta";
import { quizzes as arraysQuizzes } from "./arrays/quiz";
import { tables as dynamicArraysTables } from "./dynamic-arrays/complexity";
import { glossary as dynamicArraysGlossary } from "./dynamic-arrays/glossary";
import { meta as dynamicArraysMeta } from "./dynamic-arrays/meta";
import { quizzes as dynamicArraysQuizzes } from "./dynamic-arrays/quiz";
import { tables as linkedListsTables } from "./linked-lists/complexity";
import { glossary as linkedListsGlossary } from "./linked-lists/glossary";
import { meta as linkedListsMeta } from "./linked-lists/meta";
import { quizzes as linkedListsQuizzes } from "./linked-lists/quiz";
import { tables as stacksTables } from "./stacks/complexity";
import { glossary as stacksGlossary } from "./stacks/glossary";
import { meta as stacksMeta } from "./stacks/meta";
import { quizzes as stacksQuizzes } from "./stacks/quiz";
import { tables as queuesAndDequesTables } from "./queues-and-deques/complexity";
import { glossary as queuesAndDequesGlossary } from "./queues-and-deques/glossary";
import { meta as queuesAndDequesMeta } from "./queues-and-deques/meta";
import { quizzes as queuesAndDequesQuizzes } from "./queues-and-deques/quiz";
import { tables as hashTablesTables } from "./hash-tables/complexity";
import { glossary as hashTablesGlossary } from "./hash-tables/glossary";
import { meta as hashTablesMeta } from "./hash-tables/meta";
import { quizzes as hashTablesQuizzes } from "./hash-tables/quiz";
import { tables as heapsTables } from "./heaps/complexity";
import { glossary as heapsGlossary } from "./heaps/glossary";
import { meta as heapsMeta } from "./heaps/meta";
import { quizzes as heapsQuizzes } from "./heaps/quiz";
import { tables as binarySearchTreesTables } from "./binary-search-trees/complexity";
import { glossary as binarySearchTreesGlossary } from "./binary-search-trees/glossary";
import { meta as binarySearchTreesMeta } from "./binary-search-trees/meta";
import { quizzes as binarySearchTreesQuizzes } from "./binary-search-trees/quiz";
import { tables as balancedTreesTables } from "./balanced-trees/complexity";
import { glossary as balancedTreesGlossary } from "./balanced-trees/glossary";
import { meta as balancedTreesMeta } from "./balanced-trees/meta";
import { quizzes as balancedTreesQuizzes } from "./balanced-trees/quiz";
import { tables as graphsTables } from "./graphs/complexity";
import { glossary as graphsGlossary } from "./graphs/glossary";
import { meta as graphsMeta } from "./graphs/meta";
import { quizzes as graphsQuizzes } from "./graphs/quiz";
import { tables as graphTraversalTables } from "./graph-traversal/complexity";
import { glossary as graphTraversalGlossary } from "./graph-traversal/glossary";
import { meta as graphTraversalMeta } from "./graph-traversal/meta";
import { quizzes as graphTraversalQuizzes } from "./graph-traversal/quiz";
import { tables as triesTables } from "./tries/complexity";
import { glossary as triesGlossary } from "./tries/glossary";
import { meta as triesMeta } from "./tries/meta";
import { quizzes as triesQuizzes } from "./tries/quiz";
import { tables as bloomFiltersTables } from "./bloom-filters/complexity";
import { glossary as bloomFiltersGlossary } from "./bloom-filters/glossary";
import { meta as bloomFiltersMeta } from "./bloom-filters/meta";
import { quizzes as bloomFiltersQuizzes } from "./bloom-filters/quiz";
import { tables as choosingAStructureTables } from "./choosing-a-structure/complexity";
import { glossary as choosingAStructureGlossary } from "./choosing-a-structure/glossary";
import { meta as choosingAStructureMeta } from "./choosing-a-structure/meta";
import { quizzes as choosingAStructureQuizzes } from "./choosing-a-structure/quiz";

export const LESSON_SLUGS = [
  "complexity-basics",
  "arrays",
  "dynamic-arrays",
  "linked-lists",
  "stacks",
  "queues-and-deques",
  "hash-tables",
  "heaps",
  "binary-search-trees",
  "balanced-trees",
  "graphs",
  "graph-traversal",
  "tries",
  "bloom-filters",
  "choosing-a-structure",
] as const;
export type LessonSlug = (typeof LESSON_SLUGS)[number];

export const LESSON_DATA: Readonly<Record<LessonSlug, LessonData>> = {
  "complexity-basics": { meta: complexityBasicsMeta, quizzes: complexityBasicsQuizzes, tables: complexityBasicsTables, glossary: complexityBasicsGlossary },
  "arrays": { meta: arraysMeta, quizzes: arraysQuizzes, tables: arraysTables, glossary: arraysGlossary },
  "dynamic-arrays": { meta: dynamicArraysMeta, quizzes: dynamicArraysQuizzes, tables: dynamicArraysTables, glossary: dynamicArraysGlossary },
  "linked-lists": { meta: linkedListsMeta, quizzes: linkedListsQuizzes, tables: linkedListsTables, glossary: linkedListsGlossary },
  "stacks": { meta: stacksMeta, quizzes: stacksQuizzes, tables: stacksTables, glossary: stacksGlossary },
  "queues-and-deques": { meta: queuesAndDequesMeta, quizzes: queuesAndDequesQuizzes, tables: queuesAndDequesTables, glossary: queuesAndDequesGlossary },
  "hash-tables": { meta: hashTablesMeta, quizzes: hashTablesQuizzes, tables: hashTablesTables, glossary: hashTablesGlossary },
  "heaps": { meta: heapsMeta, quizzes: heapsQuizzes, tables: heapsTables, glossary: heapsGlossary },
  "binary-search-trees": { meta: binarySearchTreesMeta, quizzes: binarySearchTreesQuizzes, tables: binarySearchTreesTables, glossary: binarySearchTreesGlossary },
  "balanced-trees": { meta: balancedTreesMeta, quizzes: balancedTreesQuizzes, tables: balancedTreesTables, glossary: balancedTreesGlossary },
  "graphs": { meta: graphsMeta, quizzes: graphsQuizzes, tables: graphsTables, glossary: graphsGlossary },
  "graph-traversal": { meta: graphTraversalMeta, quizzes: graphTraversalQuizzes, tables: graphTraversalTables, glossary: graphTraversalGlossary },
  "tries": { meta: triesMeta, quizzes: triesQuizzes, tables: triesTables, glossary: triesGlossary },
  "bloom-filters": { meta: bloomFiltersMeta, quizzes: bloomFiltersQuizzes, tables: bloomFiltersTables, glossary: bloomFiltersGlossary },
  "choosing-a-structure": { meta: choosingAStructureMeta, quizzes: choosingAStructureQuizzes, tables: choosingAStructureTables, glossary: choosingAStructureGlossary },
};

export const LESSONS: readonly LessonMeta[] = LESSON_SLUGS.map((slug) => LESSON_DATA[slug].meta);

export const LESSON_LOADERS: Readonly<Record<LessonSlug, () => Promise<{ default: MDXContent }>>> = {
  "complexity-basics": () => import("./complexity-basics/lesson.mdx"),
  "arrays": () => import("./arrays/lesson.mdx"),
  "dynamic-arrays": () => import("./dynamic-arrays/lesson.mdx"),
  "linked-lists": () => import("./linked-lists/lesson.mdx"),
  "stacks": () => import("./stacks/lesson.mdx"),
  "queues-and-deques": () => import("./queues-and-deques/lesson.mdx"),
  "hash-tables": () => import("./hash-tables/lesson.mdx"),
  "heaps": () => import("./heaps/lesson.mdx"),
  "binary-search-trees": () => import("./binary-search-trees/lesson.mdx"),
  "balanced-trees": () => import("./balanced-trees/lesson.mdx"),
  "graphs": () => import("./graphs/lesson.mdx"),
  "graph-traversal": () => import("./graph-traversal/lesson.mdx"),
  "tries": () => import("./tries/lesson.mdx"),
  "bloom-filters": () => import("./bloom-filters/lesson.mdx"),
  "choosing-a-structure": () => import("./choosing-a-structure/lesson.mdx"),
};

export function isLessonSlug(slug: string): slug is LessonSlug {
  return (LESSON_SLUGS as readonly string[]).includes(slug);
}

export function getLesson(slug: string): LessonMeta | undefined {
  return isLessonSlug(slug) ? LESSON_DATA[slug].meta : undefined;
}

/** Published lessons sorted by order (drafts are hidden from the roadmap, nav and glossary). */
export function publishedLessons(lessons: readonly LessonMeta[] = LESSONS): LessonMeta[] {
  return lessons.filter((l) => l.status === "published").sort((a, b) => a.order - b.order);
}
