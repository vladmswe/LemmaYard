"use client";

import { ListPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { sendJson } from "./plans-api";

/**
 * Room results: "Save as study plan" (docs/specs/community.md §B.8, AC-C-SP-6).
 * Creates a private plan with the session's problems in order and opens it;
 * pressing it again opens the plan made before.
 */
export function SaveSessionPlanButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function save() {
    setPending(true);
    const res = await sendJson<{ id: string; existing?: boolean }>("POST", "/api/plans/import", {
      source: "room_session",
      sessionId,
    });
    if (!res.ok) {
      setPending(false);
      toast.error("Could not save the study plan", { description: res.error });
      return;
    }
    toast.success(res.data.existing ? "You saved this session before" : "Saved as a study plan", {
      description: "Private to you. Your progress follows your own submissions.",
    });
    router.push(`/plans/${res.data.id}`);
  }
  return (
    <Button variant="secondary" onClick={save} loading={pending} data-testid="save-session-plan">
      <ListPlusIcon aria-hidden />
      Save as study plan
    </Button>
  );
}
