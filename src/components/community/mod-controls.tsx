"use client";

import { LockIcon, LockOpenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_LIMITS } from "@/lib/community/types";

import { communityFetch } from "./community-api";

type Variant = "default" | "secondary" | "destructive" | "ghost";

export type ModActionSpec = {
  action: "hide" | "restore" | "remove" | "lock" | "unlock" | "set_spoiler" | "suspend" | "unsuspend" | "dismiss";
  targetType: "comment" | "thread" | "user";
  targetId: string;
  days?: 7 | 30;
  value?: boolean;
};

/**
 * One moderator action behind a reason dialog (docs/specs/community.md §C.8,
 * AC-C-RP-3): every action needs a reason, goes to the audit log and closes
 * the open reports on its target. Refreshes the page on success.
 */
export function ModActionButton({
  spec,
  label,
  title,
  description,
  defaultReason = "",
  variant = "secondary",
  icon,
  testId,
}: {
  spec: ModActionSpec;
  label: string;
  title: string;
  description: string;
  defaultReason?: string;
  variant?: Variant;
  icon?: ReactNode;
  testId?: string;
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Give a reason. It goes to the audit log.");
      return;
    }
    setPending(true);
    const result = await communityFetch("/api/mod/actions", "POST", { ...spec, reason });
    setPending(false);
    if (!result.ok) {
      setError(result.fieldErrors?.reason ?? result.error);
      return;
    }
    setOpen(false);
    toast.success(`${label}: done`);
    startTransition(() => router.refresh());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setReason(defaultReason);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant={variant} size="sm" data-testid={testId} />}>
        {icon}
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-reason`} className="text-sm font-semibold">
              Reason
            </label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              maxLength={COMMUNITY_LIMITS.modReasonMax}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : `${id}-help`}
              className="min-h-20"
              data-testid="mod-reason"
            />
            <p id={`${id}-help`} className="text-xs text-muted-foreground">
              Shown in the audit log{spec.action === "remove" ? " and to the author on the placeholder" : ""}.
            </p>
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={variant === "destructive" ? "destructive" : "default"} loading={pending} data-testid="mod-confirm">
              {label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Lock / unlock a discussion (moderators, on the full discussion page). */
export function ThreadLockControl({ threadId, locked }: { threadId: string; locked: boolean }) {
  return locked ? (
    <ModActionButton
      spec={{ action: "unlock", targetType: "thread", targetId: threadId }}
      label="Unlock discussion"
      title="Unlock this discussion?"
      description="Members can comment again."
      icon={<LockOpenIcon aria-hidden />}
    />
  ) : (
    <ModActionButton
      spec={{ action: "lock", targetType: "thread", targetId: threadId }}
      label="Lock discussion"
      title="Lock this discussion?"
      description="Nobody but moderators can add comments until it is unlocked. Existing comments stay."
      icon={<LockIcon aria-hidden />}
    />
  );
}
