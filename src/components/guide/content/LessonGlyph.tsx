import type { Track } from "@/lib/guide/content/types";

type Kind = "cost" | "array" | "list" | "stack" | "queue" | "hash" | "tree" | "graph";

const BY_SLUG: Record<string, Kind> = {
  "complexity-basics": "cost",
  arrays: "array",
  "dynamic-arrays": "array",
  "linked-lists": "list",
  stacks: "stack",
  "queues-and-deques": "queue",
  "hash-tables": "hash",
  "bloom-filters": "hash",
  heaps: "tree",
  "binary-search-trees": "tree",
  "balanced-trees": "tree",
  tries: "tree",
  graphs: "graph",
  "graph-traversal": "graph",
};

const BY_TRACK: Record<Track, Kind> = {
  foundations: "cost",
  linear: "array",
  hashing: "hash",
  trees: "tree",
  graphs: "graph",
  bonus: "graph",
  review: "array",
};

/** Mini monoline figure of a lesson's structure (DESIGN.md §10, §13.8). Decorative. */
export function LessonGlyph({ slug, track, className }: { slug: string; track: Track; className?: string }) {
  const kind = BY_SLUG[slug] ?? BY_TRACK[track];
  return (
    <svg
      aria-hidden
      viewBox="0 0 56 32"
      width="56"
      height="32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-glyph={kind}
    >
      {kind === "cost" && <path d="M4 28 C 20 27, 30 22, 52 4 M4 28 H52 M4 28 V4" />}
      {kind === "array" && (
        <>
          <rect x="3" y="9" width="50" height="14" rx="2" />
          <path d="M15.5 9v14M28 9v14M40.5 9v14" />
        </>
      )}
      {kind === "list" && (
        <>
          <rect x="2" y="10" width="12" height="12" rx="2" />
          <rect x="22" y="10" width="12" height="12" rx="2" />
          <rect x="42" y="10" width="12" height="12" rx="2" />
          <path d="M14 16h8M34 16h8" />
        </>
      )}
      {kind === "stack" && (
        <>
          <rect x="16" y="4" width="24" height="7" rx="1.5" />
          <rect x="16" y="13" width="24" height="7" rx="1.5" />
          <rect x="16" y="22" width="24" height="7" rx="1.5" />
        </>
      )}
      {kind === "queue" && (
        <>
          <circle cx="28" cy="16" r="12" />
          <circle cx="28" cy="16" r="5" />
          <path d="M28 4v7M40 16h-7M28 28v-7M16 16h7" />
        </>
      )}
      {kind === "hash" && (
        <>
          <path d="M6 5v22M6 7h10M6 16h10M6 25h10" />
          <rect x="20" y="3" width="10" height="8" rx="1.5" />
          <rect x="20" y="12" width="10" height="8" rx="1.5" />
          <rect x="34" y="12" width="10" height="8" rx="1.5" />
          <path d="M30 16h4" />
        </>
      )}
      {kind === "tree" && (
        <>
          <circle cx="28" cy="6" r="4" />
          <circle cx="14" cy="26" r="4" />
          <circle cx="42" cy="26" r="4" />
          <path d="M25.5 9.5 16.5 22.5M30.5 9.5l9 13" />
        </>
      )}
      {kind === "graph" && (
        <>
          <circle cx="8" cy="8" r="4" />
          <circle cx="48" cy="8" r="4" />
          <circle cx="20" cy="26" r="4" />
          <circle cx="42" cy="26" r="4" />
          <path d="M12 8h32M10 11.5l8 11M24 26h14M46 11.5l-3 10.5" />
        </>
      )}
    </svg>
  );
}
