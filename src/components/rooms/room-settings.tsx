"use client";

import { LogOutIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
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
import { Field, FieldError, FieldHelp } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { confirmsRoomName, ROOM_NAME_MAX, roomNameSchema } from "@/lib/rooms/schemas";

import { useRoomAction } from "./use-room-action";

/** A labelled switch row whose change is saved at once (optimistic, reverted on error). */
function SettingSwitch({
  label,
  help,
  checked: initial,
  path,
  successOn,
  successOff,
}: {
  label: string;
  help: string;
  checked: boolean;
  path: string;
  successOn: string;
  successOff: string;
}) {
  const id = useId();
  const [checked, setChecked] = useState(initial);
  const { run, pending } = useRoomAction();

  async function onChange(next: boolean) {
    setChecked(next);
    const res = await run(path, { shareSolutions: next }, { success: next ? successOn : successOff });
    if (!res.ok) setChecked(!next);
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} id={`${id}-label`} className="cursor-pointer">
          {label}
        </Label>
        <p id={`${id}-help`} className="mt-1 text-sm text-muted-foreground">
          {help}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={pending}
        onCheckedChange={onChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        className="mt-0.5"
      />
    </div>
  );
}

/** Every member: "Show my solutions to this room" (spec §4.5 per-member opt-out). */
export function MemberPreferencesCard({ roomId, shareSolutions }: { roomId: string; shareSolutions: boolean }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Your preferences</h2>
      </CardHeader>
      <CardContent>
        <SettingSwitch
          label="Show my solutions to this room"
          help="After a session ends, members can view your accepted code for that session's problems."
          checked={shareSolutions}
          path={`/api/rooms/${roomId}/members/me/settings`}
          successOn="Your solutions are visible to this room after sessions"
          successOff="Your solutions are hidden from this room"
        />
      </CardContent>
    </Card>
  );
}

/** Owner: rename and the room-wide sharing setting. */
export function RoomSettingsCard({
  roomId,
  name,
  shareSolutions,
}: {
  roomId: string;
  name: string;
  shareSolutions: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useRoomAction();

  async function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = roomNameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a room name");
      return;
    }
    setError(null);
    const res = await run(`/api/rooms/${roomId}/rename`, { name: parsed.data }, { success: "Room renamed", toastErrors: false });
    if (res.ok) setValue(parsed.data);
    else setError(res.fieldErrors?.name ?? res.error);
  }

  const unchanged = value.trim() === name;
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Room settings</h2>
        <CardDescription>Only you, the owner, can change these.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={onRename} noValidate>
          <Field>
            <Label htmlFor={`${id}-name`}>Room name</Label>
            <div className="flex gap-2">
              <Input
                id={`${id}-name`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={ROOM_NAME_MAX * 2}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary" loading={pending} disabled={unchanged}>
                Save
              </Button>
            </div>
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
        </form>
        <SettingSwitch
          label="Share accepted solutions with members after each session"
          help="Members who did not opt out can see each other's accepted code once a session has finished. Never during a session."
          checked={shareSolutions}
          path={`/api/rooms/${roomId}/settings`}
          successOn="Solution sharing turned on"
          successOff="Solution sharing turned off"
        />
      </CardContent>
    </Card>
  );
}

/**
 * Leave (everyone) and Delete (owner). The owner can leave only when alone,
 * which deletes the room after a confirm that names it.
 */
export function DangerZoneCard({
  roomId,
  roomName,
  isOwner,
  memberCount,
}: {
  roomId: string;
  roomName: string;
  isOwner: boolean;
  memberCount: number;
}) {
  const router = useRouter();
  const id = useId();
  const [dialog, setDialog] = useState<"leave" | "delete">("leave");
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useRoomAction();
  const alone = memberCount <= 1;
  const ownerBlocked = isOwner && !alone;
  const leaveDeletes = alone;

  function openDialog(kind: "leave" | "delete") {
    setDialog(kind);
    setConfirmName("");
    setError(null);
    setOpen(true);
  }

  async function onConfirm() {
    if (dialog === "delete" || leaveDeletes) {
      if (!confirmsRoomName(confirmName, roomName)) {
        setError("Type the room name exactly to confirm");
        return;
      }
    }
    const res =
      dialog === "delete"
        ? await run(`/api/rooms/${roomId}/delete`, { confirmName }, { refresh: false, toastErrors: false })
        : await run<{ deleted: boolean }>(`/api/rooms/${roomId}/leave`, {}, { refresh: false, toastErrors: false });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    toast.success(dialog === "delete" || leaveDeletes ? `Room "${roomName}" deleted` : `You left "${roomName}"`);
    router.replace("/rooms");
    router.refresh();
  }

  const needsName = dialog === "delete" || leaveDeletes;
  return (
    <Card className="border-danger/40">
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Danger zone</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Leave room</p>
            <p id={`${id}-leave-help`} className="text-sm text-muted-foreground">
              {ownerBlocked
                ? "Make another member the owner before you leave."
                : leaveDeletes
                  ? "You are the only member, so leaving deletes the room."
                  : "You lose access to the room. Your past results stay in its history."}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => openDialog("leave")}
            disabled={ownerBlocked}
            aria-describedby={`${id}-leave-help`}
          >
            <LogOutIcon aria-hidden />
            Leave room
          </Button>
        </div>
        {isOwner && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Delete room</p>
              <p className="text-sm text-muted-foreground">
                Deletes the room, its sessions and history for everyone. This can&apos;t be undone.
              </p>
            </div>
            <Button variant="destructive" onClick={() => openDialog("delete")}>
              <Trash2Icon aria-hidden />
              Delete room
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "delete" ? `Delete ${roomName}?` : leaveDeletes ? `Leave and delete ${roomName}?` : `Leave ${roomName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {needsName
                ? "The room, its sessions and history are deleted for everyone. This can't be undone."
                : "You lose access right away. To come back you need a new invite link from the owner."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsName ? (
            <Field>
              <Label htmlFor={`${id}-confirm`}>
                Type <span className="font-mono">{roomName}</span> to confirm
              </Label>
              <Input
                id={`${id}-confirm`}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-confirm-error` : `${id}-confirm-help`}
              />
              {error ? (
                <FieldError id={`${id}-confirm-error`}>{error}</FieldError>
              ) : (
                <FieldHelp id={`${id}-confirm-help`}>Case-sensitive.</FieldHelp>
              )}
            </Field>
          ) : (
            error && <FieldError>{error}</FieldError>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={pending}
              disabled={needsName && !confirmsRoomName(confirmName, roomName)}
              onClick={onConfirm}
            >
              {dialog === "delete" || leaveDeletes ? "Delete room" : "Leave room"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
