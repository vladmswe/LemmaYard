"use client";

import { CheckIcon, CopyIcon, Link2Icon, Link2OffIcon, RefreshCwIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_INVITE_EXPIRY_DAYS, INVITE_EXPIRY_DAYS, type InviteExpiryDays } from "@/lib/rooms/invite";
import { INVITE_EXPIRY_LABELS } from "@/lib/rooms/schemas";

import { LocalDate } from "./local-date";
import { useRoomAction } from "./use-room-action";

const EXPIRY_ITEMS = INVITE_EXPIRY_DAYS.map((d) => ({ value: String(d), label: INVITE_EXPIRY_LABELS[d] }));
const EXPIRY_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

type Confirm = "rotate" | "disable" | null;

/**
 * Owner's invite link (spec §1.2 step 2, §8.1). The token exists in the
 * browser only in the response to "Create link": it is shown once, never
 * stored, and gone after a reload. "New link" kills the old one at once.
 */
export function InviteLinkCard({
  roomId,
  invite,
}: {
  roomId: string;
  invite: { active: boolean; expiresAt: string | null };
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [days, setDays] = useState<InviteExpiryDays>(DEFAULT_INVITE_EXPIRY_DAYS);
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirmState] = useState<Exclude<Confirm, null>>("rotate");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { run, pending } = useRoomAction();

  // A link created in this tab is active until the server says otherwise.
  const active = created !== null || invite.active;
  const expiresAt = created?.expiresAt ?? invite.expiresAt;

  function ask(kind: Exclude<Confirm, null>) {
    setConfirmState(kind);
    setConfirmOpen(true);
  }

  async function rotate() {
    const res = await run<{ url: string; expiresAt: string }>(
      `/api/rooms/${roomId}/invite`,
      { action: "rotate", expiresInDays: days },
      { success: active ? "New link created. The old link no longer works." : "Invite link created" },
    );
    if (res.ok) {
      setCreated(res.data);
      setCopied(false);
      setConfirmOpen(false);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }

  async function disable() {
    const res = await run(`/api/rooms/${roomId}/invite`, { action: "disable" }, { success: "Invite link turned off" });
    if (res.ok) {
      setCreated(null);
      setConfirmOpen(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      inputRef.current?.select();
      toast.info("Press Ctrl+C (⌘C on Mac) to copy the selected link.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Invite link</h2>
        <CardDescription>Anyone with the link can join while it is active. Send it in any messenger.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {created ? (
          <Field>
            <Label htmlFor={`${id}-url`}>Link</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={inputRef}
                id={`${id}-url`}
                readOnly
                value={created.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-describedby={`${id}-url-help`}
                className="w-full min-w-0 font-mono text-sm sm:flex-1"
              />
              <Button variant="secondary" onClick={copy} className="shrink-0 self-start sm:self-auto">
                {copied ? <CheckIcon aria-hidden className="text-success" /> : <CopyIcon aria-hidden />}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
            <span aria-live="polite" className="sr-only">
              {copied ? "Copied" : ""}
            </span>
            <FieldHelp id={`${id}-url-help`}>
              Expires <LocalDate iso={created.expiresAt} options={EXPIRY_FORMAT} />. Copy it now: for security the full
              link is shown only once.
            </FieldHelp>
          </Field>
        ) : active && expiresAt ? (
          <div className="flex gap-3 rounded-md border bg-surface-sunken px-4 py-3 text-sm">
            <Link2Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-semibold">
                A link is active until <LocalDate iso={expiresAt} options={EXPIRY_FORMAT} />
              </p>
              <p className="mt-0.5 text-muted-foreground">
                For security a link is shown only when it is created. Create a new link to copy one again; the
                current link then stops working.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 rounded-md border bg-surface-sunken px-4 py-3 text-sm">
            <Link2OffIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">No active link. Create one to invite friends.</p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-36">
            <Label id={`${id}-expiry-label`}>Expires after</Label>
            <Select
              items={EXPIRY_ITEMS}
              value={String(days)}
              onValueChange={(v) => v && setDays(Number(v) as InviteExpiryDays)}
            >
              <SelectTrigger aria-labelledby={`${id}-expiry-label ${id}-expiry-value`} className="w-full">
                <SelectValue id={`${id}-expiry-value`} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="start">
                {EXPIRY_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {active ? (
            <>
              <Button variant="secondary" onClick={() => ask("rotate")} disabled={pending}>
                <RefreshCwIcon aria-hidden />
                New link
              </Button>
              <Button variant="ghost" onClick={() => ask("disable")} disabled={pending}>
                <Link2OffIcon aria-hidden />
                Turn off
              </Button>
            </>
          ) : (
            <Button onClick={rotate} loading={pending}>
              <Link2Icon aria-hidden />
              Create link
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "rotate" ? "Replace the invite link?" : "Turn off the invite link?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "rotate"
                ? `The current link stops working at once. The new link expires after ${INVITE_EXPIRY_LABELS[days]}.`
                : "The current link stops working at once. Members stay in the room. You can create a new link at any time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant={confirm === "disable" ? "destructive" : "default"}
              loading={pending}
              onClick={confirm === "rotate" ? rotate : disable}
            >
              {confirm === "rotate" ? "Create new link" : "Turn off link"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
