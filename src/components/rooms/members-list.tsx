"use client";

import { ChevronDownIcon, CrownIcon, UserMinusIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RoomRole } from "@/lib/rooms/types";

import { LocalDate } from "./local-date";
import { useRoomAction } from "./use-room-action";

export type MemberRow = { userId: string; username: string; role: RoomRole; joinedAt: string };

type Pending = { kind: "remove" | "make-owner"; member: MemberRow } | null;

/** Members with role badges and join dates; the owner gets Make owner / Remove per member. */
export function MembersList({
  roomId,
  roomName,
  members,
  viewerId,
  viewerIsOwner,
}: {
  roomId: string;
  roomName: string;
  members: MemberRow[];
  viewerId: string;
  viewerIsOwner: boolean;
}) {
  // `confirm` stays set while the dialog animates out, so its text does not flash.
  const [confirm, setConfirmState] = useState<Pending>(null);
  const [open, setOpen] = useState(false);
  const setConfirm = (next: Pending) => {
    if (next) setConfirmState(next);
    setOpen(next !== null);
  };
  const { run, pending } = useRoomAction();

  async function onConfirm() {
    if (!confirm) return;
    const { kind, member } = confirm;
    const res = await run(`/api/rooms/${roomId}/members/${member.userId}/${kind}`, {}, {
      success: kind === "remove" ? `${member.username} was removed from the room` : `${member.username} is now the owner`,
    });
    if (res.ok) setConfirm(null);
  }

  return (
    <>
      <ul className="divide-y" aria-label="Members">
        {members.map((m) => {
          const you = m.userId === viewerId;
          return (
            <li key={m.userId} className="flex min-h-16 items-center gap-3 py-3">
              <Avatar name={m.username} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate font-semibold">{m.username}</span>
                  {you && <span className="text-sm text-muted-foreground">(you)</span>}
                  {m.role === "owner" ? (
                    <Badge variant="secondary">
                      <CrownIcon aria-hidden />
                      Owner
                    </Badge>
                  ) : (
                    <Badge variant="outline">Member</Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Joined <LocalDate iso={m.joinedAt} options={{ month: "short", day: "numeric", year: "numeric" }} />
                </p>
              </div>
              {viewerIsOwner && !you && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" className="shrink-0" aria-label={`Manage ${m.username}`} />}
                  >
                    Manage
                    <ChevronDownIcon aria-hidden className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setConfirm({ kind: "make-owner", member: m })}>
                      <CrownIcon aria-hidden className="text-muted-foreground" />
                      Make owner
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConfirm({ kind: "remove", member: m })}>
                      <UserMinusIcon aria-hidden className="text-muted-foreground" />
                      Remove from room
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={open} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <AlertDialogContent>
          {confirm?.kind === "remove" ? (
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {confirm.member.username} from {roomName}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.member.username} loses access right away. Their past results stay in the room&apos;s
                history. You can invite them again later.
              </AlertDialogDescription>
            </AlertDialogHeader>
          ) : confirm ? (
            <AlertDialogHeader>
              <AlertDialogTitle>Make {confirm.member.username} the owner?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.member.username} will manage the invite link, members and settings. You stay in the room
                as a member.
              </AlertDialogDescription>
            </AlertDialogHeader>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant={confirm?.kind === "remove" ? "destructive" : "default"}
              loading={pending}
              onClick={onConfirm}
            >
              {confirm?.kind === "remove" ? "Remove" : "Make owner"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
