"use client";

// Session screen, Lobby state (docs/specs/rooms.md §1.2 steps 4–7, §2, §7.4).
// Two columns from lg: slots, calibration and settings (host/owner) on the
// left; participants, Join/Leave and Start/Cancel on the right. Everyone else
// sees the slots without titles and a waiting state. Updates from others
// arrive through the session poller (lobby_updated → the view is re-read).
import {
  CircleAlertIcon,
  DicesIcon,
  InfoIcon,
  LoaderCircleIcon,
  PlayIcon,
  UserCheckIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JUDGE_DISABLED_CODE, JUDGE_DISABLED_LOBBY_NOTE, JUDGE_DISABLED_LOBBY_TITLE } from "@/lib/judge-availability";
import type { SessionSnapshot } from "@/lib/rooms/events";
import { availableLine, humanizeTag } from "@/lib/rooms/lobby-copy";
import { lobbyMode, memberRatingLabel, startBlockedReason } from "@/lib/rooms/lobby-rating";
import type { SessionSettingsBody } from "@/lib/rooms/session-schemas";
import type { DrawErrorView, DrawNoticeView, LobbyView } from "@/lib/rooms/session-view";
import type { SessionTag } from "@/server/rooms/session-page";

import { sessionApi, type SessionApiResult } from "../live/session-api";
import { CalibrationPanel } from "./calibration-panel";
import { ProblemSearchDialog } from "./problem-search-dialog";
import { SessionSettingsForm } from "./session-settings-form";
import { LobbyExpectationPanel, RatingExplainerCard } from "./rating-panels";
import { AddLeetCodeDialog } from "./add-leetcode-dialog";
import { SlotList } from "./slot-list";
import { useRoomInfo } from "./use-room-info";

type DrawProblem = Pick<DrawErrorView, "code" | "error" | "counts" | "requested">;

export type SessionLobbyProps = {
  roomId: string;
  sessionId: string;
  viewerId: string;
  lobby: LobbyView;
  onLobby: (lobby: LobbyView) => void;
  snapshot: SessionSnapshot | null;
  viewer: { isParticipant: boolean; canManage: boolean };
  tags: SessionTag[];
  /** Poll now (after an own change). */
  refresh: () => void;
  onJoinedChange: (joined: boolean) => void;
  /** False: this deployment runs no code (JUDGE_ENABLED), so the session cannot start. */
  judgeEnabled: boolean;
};

export function SessionLobby({
  roomId,
  sessionId,
  viewerId,
  lobby,
  onLobby,
  snapshot,
  viewer,
  tags,
  refresh,
  onJoinedChange,
  judgeEnabled,
}: SessionLobbyProps) {
  // Also set when Start answers 503 `judge_disabled` to a page that thought otherwise.
  const [judgeOff, setJudgeOff] = useState(!judgeEnabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<DrawNoticeView[]>(lobby.notices);
  const [drawProblem, setDrawProblem] = useState<DrawProblem | null>(lobby.drawError ?? null);
  const [pinFor, setPinFor] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ position: number; message: string; nonce: number } | null>(null);
  const [confirm, setConfirm] = useState<"start" | "cancel" | null>(null);
  const [addingExternal, setAddingExternal] = useState(false);
  const externalCount = lobby.settings.external ?? 0;
  const canManage = lobby.canManage;
  const tagNames = new Map(tags.map((t) => [t.slug, t.name]));
  const tagName = (slug: string) => tagNames.get(slug) ?? humanizeTag(slug);
  const participants = snapshot?.participants ?? [];
  const mode = lobbyMode(lobby);
  const blocked = startBlockedReason(lobby);
  const filled = blocked === null;
  // Room ratings (D3) and presets; re-read when someone joins (their rating is seeded at join).
  const { info: room, reload: reloadRoom } = useRoomInfo(roomId, participants.map((p) => p.userId).join(","));
  const expectedBy = new Map((lobby.expected?.perUser ?? []).map((u) => [u.userId, u]));

  async function act<T extends object>(
    key: string,
    call: () => Promise<SessionApiResult<T>>,
    options: { success?: string; focusPosition?: number; focusMessage?: string } = {},
  ): Promise<boolean> {
    setBusy(key);
    const res = await call();
    setBusy(null);
    if (!res.ok) {
      if (res.code === JUDGE_DISABLED_CODE) {
        setJudgeOff(true);
      } else if ((res.code === "pool_too_small" || res.code === "mix_infeasible") && res.counts) {
        setDrawProblem({ code: res.code, error: res.error, counts: res.counts, requested: res.requested });
      } else {
        toast.error(res.error);
      }
      return false;
    }
    const next = "lobby" in res.data ? (res.data.lobby as LobbyView) : null;
    if (next) {
      onLobby(next);
      setNotices(next.notices);
      setDrawProblem(next.drawError ?? null);
    }
    if (options.success) toast.success(options.success);
    if (options.focusPosition) {
      setFocus({ position: options.focusPosition, message: options.focusMessage ?? "", nonce: Date.now() });
    }
    refresh();
    return true;
  }

  const clearDrawProblem = useCallback(() => setDrawProblem(lobby.drawError ?? null), [lobby.drawError]);
  const apply = (body: SessionSettingsBody) => act("draw", () => sessionApi.draw(roomId, sessionId, body));

  async function join() {
    const ok = await act("join", () => sessionApi.join(roomId, sessionId));
    if (ok) onJoinedChange(true);
  }
  async function leave() {
    const ok = await act("leave", () => sessionApi.leave(roomId, sessionId));
    if (ok) onJoinedChange(false);
  }
  async function start() {
    const ok = await act("start", () => sessionApi.start(roomId, sessionId));
    setConfirm(null);
    if (!ok) refresh();
  }
  async function cancel() {
    await act("cancel", () => sessionApi.cancel(roomId, sessionId));
    setConfirm(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
        {canManage && (
          <Card>
            <CardContent>
              <SessionSettingsForm
                roomId={roomId}
                lobby={lobby}
                tags={tags}
                pending={busy === "draw"}
                onApply={apply}
                // A failed Apply leaves its error up while the form still holds
                // the rejected settings; once they are undone the saved draw
                // stands again, so its own state (usually no error) is back.
                onClean={clearDrawProblem}
                presets={room?.presets ?? null}
                defaultPresetId={room?.defaultPresetId ?? null}
                canSavePresets={room?.role === "owner"}
                onPresetsChanged={reloadRoom}
              />
            </CardContent>
          </Card>
        )}
        <section aria-labelledby="lobby-problems" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="lobby-problems" className="text-xl/7 font-semibold">
                Problems
              </h2>
              <p className="text-sm text-muted-foreground">
                {lobby.problemCount} problem{lobby.problemCount === 1 ? "" : "s"}
                {externalCount > 0 ? ` (${externalCount} from LeetCode)` : ""} · {lobby.durationMin} minutes
                {mode === "rating" && externalCount < lobby.problemCount ? " · warm-up first, stretch last" : ""}
                {lobby.rated === false || externalCount >= lobby.problemCount ? " · unrated" : ""}
              </p>
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground tabular-nums" data-testid="rerolls-left">
                  {lobby.rerollsLeft} re-roll{lobby.rerollsLeft === 1 ? "" : "s"} left
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === "reroll-all"}
                  disabled={busy !== null || lobby.rerollsLeft === 0 || lobby.slots.length === 0 || mode === "manual"}
                  aria-describedby={mode === "manual" ? "reroll-manual-hint" : undefined}
                  onClick={() =>
                    act("reroll-all", () => sessionApi.rerollAll(roomId, sessionId), {
                      success: "Re-rolled the unpinned problems",
                    })
                  }
                >
                  <DicesIcon aria-hidden />
                  Re-roll all
                </Button>
                {mode === "manual" && (
                  <span id="reroll-manual-hint" className="w-full text-sm text-muted-foreground">
                    You pick every problem in this mode, so there is nothing to re-roll. Switch to By rating or By difficulty to draw.
                  </span>
                )}
              </div>
            )}
          </div>

          {drawProblem && (
            <Alert variant="warning" data-testid="draw-error">
              <CircleAlertIcon aria-hidden />
              <AlertTitle>
                {drawProblem.code === "pool_too_small" ? "Not enough problems" : "This mix is not possible"}
              </AlertTitle>
              <AlertDescription>
                <p>{drawProblem.error}</p>
                {drawProblem.code === "pool_too_small" && <p>{availableLine(drawProblem.counts)}</p>}
                <p>The session cannot start until this is fixed.</p>
                {drawProblem.code === "mix_infeasible" && canManage && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    loading={busy === "draw"}
                    onClick={() => apply({ mixMode: "suggested" })}
                  >
                    Use suggested mix
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {canManage && notices.length > 0 && (
            <Alert variant="info" data-testid="draw-notices">
              <InfoIcon aria-hidden />
              <AlertDescription>
                {notices.map((n) => (
                  <p key={`${n.code}-${"difficulty" in n ? n.difficulty : ""}-${"position" in n ? n.position : ""}`}>{n.message}</p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <SlotList
            mode={mode}
            slots={lobby.slots}
            problemCount={lobby.problemCount}
            canManage={canManage}
            tagName={tagName}
            busy={busy}
            focus={focus}
            onReroll={(pos) =>
              act(`reroll-${pos}`, () => sessionApi.reroll(roomId, sessionId, pos), {
                focusPosition: pos,
                focusMessage: `Problem ${pos} re-rolled`,
              })
            }
            onPin={(pos) => setPinFor(pos)}
            onUnpin={(pos) =>
              act(`unpin-${pos}`, () => sessionApi.unpin(roomId, sessionId, pos), {
                focusPosition: pos,
                focusMessage: `Problem ${pos} unpinned`,
              })
            }
            external={externalCount}
            rerollsLeft={lobby.rerollsLeft}
            leetcodeAuto={lobby.settings.leetcodeAuto === true && lobby.leetcodeCatalog !== undefined}
            onRerollExternal={(pos) =>
              act(`reroll-external-${pos}`, () => sessionApi.external(roomId, sessionId, { action: "reroll", position: pos }), {
                focusPosition: pos,
                focusMessage: `Problem ${pos} (LeetCode) re-rolled`,
              })
            }
            onAddExternal={() => setAddingExternal(true)}
            onRemoveExternal={(pos) =>
              act(`remove-external-${pos}`, () => sessionApi.external(roomId, sessionId, { action: "remove", position: pos }), {
                success: `Problem ${pos} (LeetCode) removed`,
              })
            }
          />
        </section>
      </div>

      <aside
        aria-labelledby="lobby-people"
        className="flex min-w-0 flex-col gap-4 self-start lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        {judgeOff && (
          <Alert variant="info" id="judge-disabled-lobby" data-testid="judge-disabled-lobby">
            <InfoIcon aria-hidden />
            <AlertTitle>{JUDGE_DISABLED_LOBBY_TITLE}</AlertTitle>
            <AlertDescription>
              <p>{JUDGE_DISABLED_LOBBY_NOTE}</p>
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 id="lobby-people" className="text-xl/7 font-semibold">
                In the lobby
              </h2>
              <p className="text-sm text-muted-foreground" data-testid="joined-count">
                {participants.length} joined
                {expectedBy.size > 0 ? " · rating · expected solves" : ""}
              </p>
            </div>
            <ul className="flex flex-col divide-y" aria-label="Joined" data-testid="lobby-participants">
              {participants.map((p) => {
                const r = room?.ratings.get(p.userId);
                const rating = memberRatingLabel(r);
                const exp = expectedBy.get(p.userId);
                return (
                  <li key={p.userId} className="flex flex-wrap items-center gap-2 py-2" data-testid={`lobby-person-${p.username}`}>
                    <span className="font-medium">{p.username}</span>
                    {p.userId === viewerId && <span className="text-sm text-muted-foreground">(you)</span>}
                    {p.isHost && <Badge variant="outline">Host</Badge>}
                    {rating && (
                      <span
                        className="inline-flex h-6 items-center rounded-sm border bg-surface-sunken px-1.5 font-mono text-xs tabular-nums text-foreground-secondary"
                        title={r?.provisional ? "Provisional: moves faster for the first two sessions." : "Rating in this room"}
                        data-testid={`lobby-rating-${p.username}`}
                      >
                        <span className="sr-only">rating </span>
                        {rating}
                        {r?.provisional && <span className="sr-only"> (provisional)</span>}
                      </span>
                    )}
                    {exp && (
                      <span className="ml-auto font-mono text-[0.8125rem] text-foreground-secondary tabular-nums">
                        {exp.expected.toFixed(1)} of {lobby.problemCount}
                        <span className="sr-only"> expected solves</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {canManage && mode === "rating" && lobby.expected && (
              <LobbyExpectationPanel expected={lobby.expected} problemCount={lobby.problemCount} challenge={lobby.settings.challenge} />
            )}

            {viewer.isParticipant ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-success">
                  <UserCheckIcon aria-hidden className="size-4" />
                  You&apos;re in
                </p>
                {lobby.hostId !== viewerId && (
                  <Button variant="ghost" size="sm" loading={busy === "leave"} disabled={busy !== null} onClick={leave}>
                    Leave session
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button loading={busy === "join"} disabled={busy !== null} onClick={join} data-testid="join-session">
                  <UserPlusIcon aria-hidden />
                  Join session
                </Button>
                <p className="text-sm text-muted-foreground">Only participants&apos; submissions count.</p>
              </div>
            )}

            {canManage ? (
              <div className="flex flex-col gap-2 border-t pt-4">
                <Button
                  size="lg"
                  disabled={busy !== null || !filled || participants.length === 0 || drawProblem !== null || judgeOff}
                  aria-describedby={judgeOff ? "judge-disabled-lobby" : undefined}
                  onClick={() => setConfirm("start")}
                  data-testid="start-session"
                >
                  <PlayIcon aria-hidden />
                  Start session
                </Button>
                {blocked && (
                  <p className="text-sm text-muted-foreground" data-testid="start-blocked">
                    {blocked}
                  </p>
                )}
                <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirm("cancel")}>
                  <XIcon aria-hidden />
                  Cancel session
                </Button>
              </div>
            ) : judgeOff ? null : (
              <p
                className="flex items-center gap-2 border-t pt-4 text-sm text-foreground-secondary"
                data-testid="waiting-host"
              >
                <LoaderCircleIcon aria-hidden className="size-4 shrink-0 motion-safe:animate-spin-slow" />
                Waiting for the host to start the session.
              </p>
            )}
          </CardContent>
        </Card>
        {mode === "rating" && <RatingExplainerCard lobby={lobby} />}
        <p className="text-sm text-muted-foreground">
          Room members who have not joined can open this session from the room page and press Join.
        </p>
      </aside>

      {/* DOM order = mobile order (setup, problems, people + Start, then the v1 calibration); lg places the aside right. */}
      {canManage && mode === "difficulty" && (
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1">
          <CalibrationPanel lobby={lobby} />
        </div>
      )}

      {canManage && pinFor !== null && (
        <ProblemSearchDialog
          open
          onOpenChange={(open) => {
            if (open) return;
            // The dialog unmounts at once and does not return focus itself
            // (finalFocus off): put it back on the slot, as after the other actions.
            setFocus({ position: pinFor, message: "", nonce: Date.now() });
            setPinFor(null);
          }}
          roomId={roomId}
          sessionId={sessionId}
          position={pinFor}
          pending={busy !== null}
          inSession={new Set(lobby.slots.flatMap((s) => (s.problem ? [s.problem.slug] : [])))}
          onPick={async (slug) => {
            const pos = pinFor;
            const ok = await act(`pin-${pos}`, () => sessionApi.pin(roomId, sessionId, pos, slug), {
              focusPosition: pos,
              focusMessage: `Problem ${pos} pinned`,
            });
            if (ok) setPinFor(null);
          }}
        />
      )}

      {canManage && addingExternal && (
        <AddLeetCodeDialog
          roomId={roomId}
          sessionId={sessionId}
          catalogSize={lobby.leetcodeCatalog?.problems ?? null}
          tagName={tagName}
          pending={busy !== null}
          canSaveToBank={room?.role === "owner"}
          inSession={new Set(lobby.slots.flatMap((s) => (s.external?.slug ? [s.external.slug] : [])))}
          onClose={() => setAddingExternal(false)}
          onAdd={async (body) => {
            setBusy("add-external");
            const res = await sessionApi.external(roomId, sessionId, body);
            setBusy(null);
            if (!res.ok) return { ok: false, error: res.error };
            const next = res.data.lobby;
            onLobby(next);
            setNotices(next.notices);
            setAddingExternal(false);
            const added = next.slots.find(
              (s) => s.external && !lobby.slots.some((o) => o.position === s.position && o.external?.slug === s.external?.slug),
            );
            toast.success("LeetCode problem added");
            if (added) setFocus({ position: added.position, message: `Problem ${added.position}: LeetCode problem added`, nonce: Date.now() });
            refresh();
            return { ok: true };
          }}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "start" ? "Start now?" : "Cancel this session?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "start"
                ? `The ${lobby.durationMin}-minute timer starts for everyone.`
                : "The lobby closes for everyone. Nothing is scored."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{confirm === "start" ? "Not yet" : "Keep the lobby"}</AlertDialogCancel>
            {confirm === "start" ? (
              <AlertDialogAction loading={busy === "start"} onClick={start} data-testid="confirm-start">
                Start session
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                variant="destructive"
                loading={busy === "cancel"}
                onClick={cancel}
                data-testid="confirm-cancel"
              >
                Cancel session
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
