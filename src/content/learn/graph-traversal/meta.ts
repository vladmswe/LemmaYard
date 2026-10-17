import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "graph-traversal",
  title: "Exploring graphs: BFS and DFS",
  summary:
    "Visit every vertex you can reach: breadth-first search finds shortest paths by edge count, depth-first search goes deep and backtracks.",
  track: "graphs",
  order: 12,
  prerequisites: ["queues-and-deques", "graphs"],
  minutes: 30,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
