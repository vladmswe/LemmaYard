"use client";

// "Pin a problem" (docs/specs/rooms.md §2.5): search published problems by
// title (any difficulty, filters ignored) and pin one into the slot.
import { PinIcon, SearchIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { sessionApi } from "../live/session-api";

type Hit = { slug: string; title: string; difficulty: "easy" | "medium" | "hard"; tags: string[] };

export function ProblemSearchDialog({
  open,
  onOpenChange,
  roomId,
  sessionId,
  position,
  onPick,
  pending,
  inSession,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  sessionId: string;
  position: number;
  onPick: (slug: string) => void;
  pending: boolean;
  /** Slugs already in the session (a duplicate pin would be rejected). */
  inSession: ReadonlySet<string>;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!open || query.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await sessionApi.search(roomId, sessionId, query);
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setHits(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open, roomId, sessionId]);

  const showHits = q.trim().length > 0 ? hits : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQ("");
          setHits(null);
          setError(null);
        }
      }}
    >
      {/* The lobby moves focus to the slot itself after closing; Base UI would
          otherwise pick an older element from its focus history. */}
      <DialogContent className="sm:max-w-lg" finalFocus={false}>
        <DialogHeader>
          <DialogTitle>Pin a problem to Problem {position}</DialogTitle>
          <DialogDescription>
            Search all published problems by title. A pin ignores the topic filter and keeps its own difficulty.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-q`}>Title</Label>
          <div className="relative">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${id}-q`}
              autoFocus
              value={q}
              maxLength={60}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. Coin Change"
              className="pl-9"
              aria-describedby={`${id}-status`}
              autoComplete="off"
            />
          </div>
          <p id={`${id}-status`} aria-live="polite" className="text-sm text-muted-foreground">
            {error ??
              (loading
                ? "Searching…"
                : showHits === null
                  ? "Type part of a title."
                  : showHits.length === 0
                    ? "No published problem matches."
                    : `${showHits.length} result${showHits.length === 1 ? "" : "s"}`)}
          </p>
        </div>
        {showHits && showHits.length > 0 && (
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border" aria-label="Search results">
            {showHits.map((h) => (
              <li key={h.slug} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{h.title}</span>
                  <DifficultyBadge difficulty={h.difficulty} variant="text" className="text-xs" />
                </span>
                {inSession.has(h.slug) ? (
                  <span className="shrink-0 text-sm text-muted-foreground">Already in the session</span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => onPick(h.slug)}
                    aria-label={`Pin ${h.title}`}
                  >
                    <PinIcon aria-hidden />
                    Pin
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
