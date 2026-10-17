"use client";

// "New session" (docs/specs/rooms.md §1.2 step 4): creates a lobby with the
// defaults (4 problems, 90 minutes, suggested mix, avoid solved; first draw
// at once) and opens it. If the room already has an open session, opens that.
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sessionHref } from "@/lib/rooms/live-view";

import { sessionApi } from "./session-api";

export function NewSessionButton({
  roomId,
  variant = "default",
  className,
}: {
  roomId: string;
  variant?: "default" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    const res = await sessionApi.create(roomId);
    if (res.ok) {
      router.push(sessionHref(roomId, res.data.id));
      return;
    }
    setPending(false);
    if (res.code === "session_open" && res.sessionId) {
      toast.info("This room already has an open session");
      router.push(sessionHref(roomId, res.sessionId));
      return;
    }
    toast.error(res.error);
  }

  return (
    <Button variant={variant} loading={pending} onClick={create} className={className} data-testid="new-session">
      <PlusIcon aria-hidden />
      New session
    </Button>
  );
}
