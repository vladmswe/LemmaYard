// The pipeline fixture lesson (M-G1), kept out of the lesson registry.
import type { MDXContent } from "mdx/types";

import type { LessonData } from "@/lib/guide/content/types";

import { tables } from "./complexity";
import { glossary } from "./glossary";
import { meta } from "./meta";
import { quizzes } from "./quiz";

export const FIXTURE_LESSON: LessonData = { meta, quizzes, tables, glossary };

export const loadFixtureLesson = (): Promise<{ default: MDXContent }> => import("./lesson.mdx");
