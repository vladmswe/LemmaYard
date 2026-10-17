import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonShell, lessonMetadata } from "@/components/guide/content/LessonShell";
import { LESSON_DATA, LESSON_LOADERS, LESSON_SLUGS, isLessonSlug, publishedLessons } from "@/content/learn";

export const dynamicParams = false;

export function generateStaticParams() {
  return LESSON_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isLessonSlug(slug)) return {};
  return lessonMetadata(LESSON_DATA[slug].meta);
}

export default async function LessonPage({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;
  if (!isLessonSlug(slug)) notFound();
  const { default: Content } = await LESSON_LOADERS[slug]();
  return <LessonShell lesson={LESSON_DATA[slug]} Content={Content} published={publishedLessons()} />;
}
