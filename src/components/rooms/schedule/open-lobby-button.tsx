"use client";

// Creates a lobby from a preset (Rooms v2 §4, §5: `{presetId, plannedFor}`)
// and opens it; an already open session is opened instead. Only on click:
// nothing in the codebase creates a session by itself (AC-V2-DEF-3).
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sessionHref } from "@/lib/rooms/live-view";

import { sessionApi } from "../live/session-api";

export function OpenLobbyButton({
  roomId,
  presetId,
  plannedFor,
  variant = "default",
  children,
  testId,
  icon = true,
}: {
  roomId: string;
  /** Undefined → the room's default preset (server side). */
  presetId?: string;
  plannedFor?: string | null;
  variant?: "default" | "secondary" | "invert";
  children: ReactNode;
  testId?: string;
  icon?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    const body: Record<string, unknown> = {};
    if (presetId && presetId !== "default") body.presetId = presetId;
    if (plannedFor) body.plannedFor = plannedFor;
    const res = await sessionApi.create(roomId, body);
    if (res.ok) {
      router.push(sessionHref(roomId, res.data.id));
      return; // stay busy while navigating
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
    <Button variant={variant} loading={pending} onClick={create} data-testid={testId}>
      {icon && <PlusIcon aria-hidden />}
      {children}
    </Button>
  );
}
