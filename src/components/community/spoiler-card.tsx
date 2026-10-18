"use client";

import { EyeOffIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";

import { communityFetch } from "./community-api";

const Preview = dynamic(() => import("./user-markdown-preview"), { ssr: false });

/**
 * A "contains a solution" comment for a viewer who has not solved the
 * problem (docs/specs/community.md §B.5, AC-C-CM-5; mockup 08). The body is
 * NOT in the page: "Show" fetches it (`GET /api/comments/[id]?reveal=1`) and
 * renders it with the client markdown twin (same sanitizer, plain code).
 * A real button with aria-expanded; the revealed region is labelled by it.
 */
export function SpoilerCard({ commentId }: { commentId: string }) {
  const id = useId();
  const [body, setBody] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (body === null) {
      setPending(true);
      const result = await communityFetch<{ comment: { bodyMd: string | null } }>(
        `/api/comments/${commentId}?reveal=1`,
        "GET",
      );
      setPending(false);
      if (!result.ok || result.data.comment.bodyMd === null) {
        setError(result.ok ? "This comment is no longer available." : result.error);
        return;
      }
      setBody(result.data.comment.bodyMd);
    }
    setError(null);
    setOpen(true);
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-sunken px-4 py-3">
        <EyeOffIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Contains a solution</p>
          <p className="text-xs text-muted-foreground">Hidden until you solve it</p>
        </div>
        <Button
          id={`${id}-toggle`}
          variant="secondary"
          size="sm"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          loading={pending}
          onClick={() => void toggle()}
          data-testid="spoiler-toggle"
        >
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div id={`${id}-body`} role="region" aria-label="Revealed solution" hidden={!open}>
        {open && body !== null && <Preview>{body}</Preview>}
      </div>
    </div>
  );
}
