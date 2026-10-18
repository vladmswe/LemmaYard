"use client";

import { CopyIcon, RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PLAN_VISIBILITIES, type PlanVisibility } from "@/lib/plans/schemas";

import { sendJson } from "./plans-api";
import { VISIBILITY } from "./visibility";

/** The link others open the plan with: the token only for "anyone with the link". */
export function shareUrl(origin: string, planId: string, visibility: PlanVisibility, token: string | null): string | null {
  if (visibility === "private") return null;
  const url = new URL(`/plans/${planId}`, origin);
  if (visibility === "unlisted" && token) url.searchParams.set("share", token);
  return url.toString();
}

/**
 * Owner's "Visibility" card (mockup 06): Private / Anyone with the link /
 * Public as a radio group, the link to copy, and "Reset link" (the old
 * link stops working). Everyone who opens the plan sees their own progress.
 */
export function VisibilityCard({
  planId,
  visibility: initial,
  shareToken: initialToken,
  origin,
}: {
  planId: string;
  /** The site origin (AUTH_URL), from the server: no hydration mismatch. */
  origin: string;
  visibility: PlanVisibility;
  shareToken: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [, startTransition] = useTransition();
  const [visibility, setVisibility] = useState(initial);
  const [token, setToken] = useState(initialToken);
  const [pending, setPending] = useState(false);
  const link = shareUrl(origin, planId, visibility, token);

  async function update(body: { visibility?: PlanVisibility; resetShareLink?: true }) {
    const previous = visibility;
    if (body.visibility) setVisibility(body.visibility);
    setPending(true);
    const res = await sendJson<{ visibility: PlanVisibility; shareToken: string | null }>("PATCH", `/api/plans/${planId}`, body);
    setPending(false);
    if (!res.ok) {
      setVisibility(previous);
      toast.error("Could not change who can see the plan", { description: res.error });
      return;
    }
    setVisibility(res.data.visibility);
    setToken(res.data.shareToken);
    if (body.resetShareLink) toast.success("New link created", { description: "The old link no longer opens the plan." });
    startTransition(() => router.refresh());
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it yourself.");
    }
  }

  return (
    <Card className="gap-4 px-6" data-testid="visibility-card">
      <h2 id={`${id}-label`} className="eyebrow">
        Visibility
      </h2>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={visibility}
        onValueChange={(value) => update({ visibility: value as PlanVisibility })}
        disabled={pending}
        className="gap-2.5"
      >
        {PLAN_VISIBILITIES.map((v) => {
          const meta = VISIBILITY[v];
          return (
            <label
              key={v}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors duration-120",
                visibility === v ? "border-primary bg-primary/5" : "border-border hover:border-border-strong",
              )}
            >
              <RadioGroupItem value={v} className="mt-1" aria-describedby={`${id}-${v}-hint`} />
              <span className="min-w-0">
                <span className="block font-semibold">{meta.label}</span>
                <span id={`${id}-${v}-hint`} className="block text-sm text-muted-foreground">
                  {meta.hint}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {link && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-link`} className="text-sm font-semibold">
            {visibility === "unlisted" ? "Link (anyone who has it can open the plan)" : "Link"}
          </label>
          <div className="flex gap-2">
            <Input id={`${id}-link`} readOnly value={link} className="min-w-0 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" size="icon" aria-label="Copy link" title="Copy link" onClick={copy}>
              <CopyIcon aria-hidden />
            </Button>
          </div>
          {visibility === "unlisted" && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => update({ resetShareLink: true })}
              disabled={pending}
            >
              <RotateCwIcon aria-hidden />
              Reset link
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
