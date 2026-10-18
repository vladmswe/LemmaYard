import { CheckIcon, MinusIcon } from "lucide-react";
import { cn } from "cn";

import type { ItemState } from "@/lib/plans/progress";

export type MarkKind = "done" | "attempted" | "todo" | "unavailable";

export function markKind(state: ItemState): MarkKind {
  if (state.kind === "unavailable") return "unavailable";
  if (state.kind === "external") return state.done ? "done" : "todo";
  return state.status === "solved" ? "done" : state.status === "attempted" ? "attempted" : "todo";
}

const WORDS: Record<MarkKind, string> = {
  done: "Done",
  attempted: "Attempted",
  todo: "Not started",
  unavailable: "Unavailable",
};

/**
 * The status square of a plan item (mockup 06): filled success square with a
 * check = solved / done, warning square with a minus = attempted, outline =
 * not started, dashed = no longer available. Shape + sr-only word, never
 * colour alone (DESIGN.md §3).
 */
export function ItemMark({ kind, className }: { kind: MarkKind; className?: string }) {
  return (
    <span
      data-mark={kind}
      className={cn(
        "inline-grid size-5 shrink-0 place-items-center rounded-[5px] border",
        kind === "done" && "border-success bg-success text-card",
        kind === "attempted" && "border-warning bg-warning-bg text-warning",
        kind === "todo" && "border-input",
        kind === "unavailable" && "border-dashed border-input",
        className,
      )}
    >
      {kind === "done" && <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />}
      {kind === "attempted" && <MinusIcon aria-hidden className="size-3.5" strokeWidth={3} />}
      <span className="sr-only">{WORDS[kind]}</span>
    </span>
  );
}
