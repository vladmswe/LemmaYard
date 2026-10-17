// Roadmap of /learn (PLAN-GUIDE 2.8): published lessons grouped by track.
import { TRACK_LABELS, TRACKS, type LessonMeta, type Track } from "./types";

export interface RoadmapSection {
  readonly track: Track;
  readonly label: string;
  readonly lessons: readonly LessonMeta[];
}

/** Published lessons only, tracks in guide order, lessons by `order`; empty tracks are left out. */
export function buildRoadmap(lessons: readonly LessonMeta[]): RoadmapSection[] {
  const published = lessons.filter((l) => l.status === "published").sort((a, b) => a.order - b.order);
  return TRACKS.map((track) => ({
    track,
    label: TRACK_LABELS[track],
    lessons: published.filter((l) => l.track === track),
  })).filter((s) => s.lessons.length > 0);
}
