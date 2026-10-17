import "@/components/guide/guide.css";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonShell, lessonMetadata } from "@/components/guide/content/LessonShell";
import { LESSONS } from "@/content/learn";
import { FIXTURE_LESSON, loadFixtureLesson } from "@/content/learn/_fixture";
import { getEnv } from "@/server/env";

import { fixturesEnabled } from "../guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = lessonMetadata(FIXTURE_LESSON.meta);

// Pipeline fixture lesson (M-G1): every lesson component once. 404 unless GUIDE_FIXTURES=1.
export default async function FixtureLessonPage() {
  if (!fixturesEnabled(getEnv())) notFound();
  const { default: Content } = await loadFixtureLesson();
  // Prev/next among all lessons (drafts included) so the nav renders here too.
  return <LessonShell lesson={FIXTURE_LESSON} Content={Content} published={LESSONS} />;
}
