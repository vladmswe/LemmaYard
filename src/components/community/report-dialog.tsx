"use client";

import { FlagIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_LIMITS, REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason } from "@/lib/community/types";

import { communityFetch } from "./community-api";

/**
 * Report a comment (docs/specs/community.md §B.11, AC-C-RP-1): a reason from
 * the enum and optional details. The author never learns who reported.
 * Focus returns to the trigger when the dialog closes (Base UI).
 */
export function ReportDialog({ commentId, authorName }: { commentId: string; authorName: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError("Choose a reason.");
      return;
    }
    setPending(true);
    const result = await communityFetch("/api/reports", "POST", {
      targetType: "comment",
      targetId: commentId,
      reason,
      ...(details.trim() ? { details } : {}),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.fieldErrors?.details ?? result.error);
      return;
    }
    setOpen(false);
    setReason(null);
    setDetails("");
    setError(null);
    toast.success("Thanks. A moderator will look at it.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-muted-foreground" />}
        aria-label={`Report comment by ${authorName}`}
      >
        <FlagIcon aria-hidden className="size-3.5" />
        Report
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Report this comment</DialogTitle>
            <DialogDescription>
              Tell the moderators what is wrong. The author will not see who reported it.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-1" aria-describedby={error ? `${id}-error` : undefined}>
            <legend className="mb-2 text-sm font-semibold">Reason</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-1 text-sm hover:bg-accent">
                <input
                  type="radio"
                  name={`${id}-reason`}
                  value={r}
                  checked={reason === r}
                  onChange={() => {
                    setReason(r);
                    setError(null);
                  }}
                  className="size-4 accent-[var(--primary)]"
                />
                {REPORT_REASON_LABELS[r]}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-details`} className="text-sm font-semibold">
              Details <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id={`${id}-details`}
              value={details}
              maxLength={COMMUNITY_LIMITS.reportDetailsMax}
              onChange={(e) => setDetails(e.target.value)}
              className="min-h-20"
              aria-describedby={`${id}-details-help`}
            />
            <p id={`${id}-details-help`} className="text-xs text-muted-foreground">
              Up to {COMMUNITY_LIMITS.reportDetailsMax.toLocaleString("en-US")} characters. For copyright notices see{" "}
              <a href="/legal/report" className="text-link underline underline-offset-2">
                Report content / copyright
              </a>
              .
            </p>
          </div>
          {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} data-testid="report-submit">
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
