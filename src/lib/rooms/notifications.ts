// What a room event means for the viewer (docs/specs/rooms.md §3.5): toast
// copy, Activity feed lines, batching after a background/reconnect burst,
// de-duplication, the browser-notification decision and the per-browser
// preferences. Pure module (storage is injected); the React side only renders.
import type { PendingCell, RoomEvent } from "./events";
import { formatScoreTime } from "./scoring";
import { problemLabel } from "./live-view";

export type NoticeKind = "solved" | "attempt" | "joined" | "started" | "ended" | "milestone" | "batch";

export type NoticeAction = { label: string; href: string };

/** One in-app announcement (toast, browser notification, live region). */
export type Notice = {
  /** Event id, or a synthetic id for milestones / batches (de-duplication). */
  id: string;
  kind: NoticeKind;
  title: string;
  description?: string;
  action?: NoticeAction;
};

export type NoticeContext = {
  viewerId: string | null;
  /** Titles by position (absent while hidden). */
  titles: ReadonlyMap<number, string>;
  problemCount: number;
  durationMin: number;
  showAttempts: boolean;
  links: { scoreboard: string; results: string; firstProblem: string | null };
};

function problemText(ctx: NoticeContext, position: number): string {
  const title = ctx.titles.get(position);
  return title ? `${problemLabel(position)} · ${title}` : problemLabel(position);
}

/** "at 23:41 · first to solve it" / "at 31:05 · after 2 wrong attempts" / "at 18:02". */
export function solvedDescription(payload: { solveSeconds: number; wrongBefore: number; firstSolver: boolean }) {
  const at = `at ${formatScoreTime(payload.solveSeconds)}`;
  if (payload.firstSolver) return `${at} · first to solve it`;
  if (payload.wrongBefore > 0) {
    return `${at} · after ${payload.wrongBefore} wrong attempt${payload.wrongBefore === 1 ? "" : "s"}`;
  }
  return at;
}

/**
 * The toast for one event, or null when this viewer is not told (own solve,
 * own join, failed attempts without the opt-in, lobby-only events).
 * `live` = the session is live (joins are announced only then).
 */
export function eventNotice(event: RoomEvent, ctx: NoticeContext, live: boolean): Notice | null {
  switch (event.type) {
    case "problem_solved":
      if (event.actor.userId === ctx.viewerId) return null;
      return {
        id: event.id,
        kind: "solved",
        title: event.payload.selfReported
          ? `${event.actor.username} marked ${problemText(ctx, event.payload.position)} solved (self-reported)`
          : `${event.actor.username} solved ${problemText(ctx, event.payload.position)}`,
        description: solvedDescription(event.payload),
        action: { label: "Scoreboard", href: ctx.links.scoreboard },
      };
    case "attempt_failed":
      if (!ctx.showAttempts || event.actor.userId === ctx.viewerId) return null;
      return { id: event.id, kind: "attempt", title: attemptFailedText(event.actor.username, event.payload.position) };
    case "participant_joined":
      if (!live || event.actor.userId === ctx.viewerId) return null;
      return { id: event.id, kind: "joined", title: `${event.actor.username} joined the session` };
    case "session_started":
      return {
        id: event.id,
        kind: "started",
        title: "The session has started",
        description: `${ctx.problemCount} problem${ctx.problemCount === 1 ? "" : "s"} · ${ctx.durationMin} minutes. Good luck.`,
        ...(ctx.links.firstProblem ? { action: { label: "Open Problem 1", href: ctx.links.firstProblem } } : {}),
      };
    case "session_ended":
      return {
        id: event.id,
        kind: "ended",
        title: "Time is up",
        description: "Final results are ready.",
        action: { label: "Results", href: ctx.links.results },
      };
    default:
      return null;
  }
}

/** A batch of at least this many announcements collapses into one (§3.5 last row). */
export const BATCH_THRESHOLD = 4;

/**
 * Collapses a burst: fewer than BATCH_THRESHOLD notices pass through; more
 * become one "N updates while you were away" notice with the scoreboard link.
 */
export function batchNotices(notices: readonly Notice[], scoreboardHref: string): Notice[] {
  if (notices.length < BATCH_THRESHOLD) return [...notices];
  return [
    {
      id: `batch-${notices[0].id}-${notices[notices.length - 1].id}`,
      kind: "batch",
      title: `${notices.length} updates while you were away`,
      action: { label: "Scoreboard", href: scoreboardHref },
    },
  ];
}

/** v2 §9.2 toast and feed copy: "bob's attempt on Problem 2 was not accepted". */
export function attemptFailedText(username: string, position: number): string {
  return `${username}'s attempt on ${problemLabel(position)} was not accepted`;
}

export type FeedLine = {
  id: string;
  /** Event time (ISO), shown as the session clock or local time. */
  at: string;
  kind: "solved" | "attempt" | "joined" | "started" | "ended" | "cancelled" | "judging";
  text: string;
  /** Session clock ("23:41") for events during the live window. */
  clock: string | null;
};

function sessionClock(at: string, startedAt: string | null): string | null {
  if (!startedAt) return null;
  const ms = Date.parse(at) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? formatScoreTime(Math.floor(ms / 1000)) : null;
}

/** Activity feed line (past tense, §3.5 "Activity feed lines"); null for internal events. */
export function feedLine(event: RoomEvent, ctx: Pick<NoticeContext, "titles">, startedAt: string | null): FeedLine | null {
  const base = { id: event.id, at: event.at, clock: sessionClock(event.at, startedAt) };
  const name = (pos: number) => {
    const title = ctx.titles.get(pos);
    return title ? `${problemLabel(pos)} · ${title}` : problemLabel(pos);
  };
  switch (event.type) {
    case "problem_solved": {
      const p = event.payload;
      const extra = p.firstSolver ? " (first)" : p.wrongBefore > 0 ? ` after ${p.wrongBefore} wrong` : "";
      return {
        ...base,
        kind: "solved",
        clock: formatScoreTime(p.solveSeconds),
        text: p.selfReported
          ? `${event.actor.username} marked ${name(p.position)} solved (self-reported)${p.firstSolver ? " (first)" : ""}`
          : `${event.actor.username} solved ${name(p.position)}${extra}`,
      };
    }
    case "solve_undone":
      return {
        ...base,
        kind: "attempt",
        text: `${event.actor.username} undid their self-reported solve of ${name(event.payload.position)}`,
      };
    case "attempt_failed":
      return { ...base, kind: "attempt", text: attemptFailedText(event.actor.username, event.payload.position) };
    case "participant_joined":
      return { ...base, kind: "joined", text: `${event.actor.username} joined the session` };
    case "session_started":
      return { ...base, kind: "started", clock: "0:00", text: "The session started" };
    case "session_ended":
      return {
        ...base,
        kind: "ended",
        text: event.payload.reason === "host" ? "The host ended the session" : "Time is up",
      };
    case "session_cancelled":
      return { ...base, kind: "cancelled", text: "The session was cancelled" };
    default:
      return null;
  }
}

// --- "Judging…" lines (v2 §9.2: client-only, never stored, never toasted) ---

export type JudgingEntry = PendingCell & { username: string; since: string };

/** Stable key of a (participant, problem) pair. */
export function pendingKey(p: Pick<PendingCell, "userId" | "position">): string {
  return `${p.userId}:${p.position}`;
}

/**
 * Next list of in-flight judging entries: pairs still pending keep the time
 * they were first seen (`since`), new pairs start at `now`, finished ones drop
 * out (their verdict arrives as a stored event). Pairs whose participant is
 * unknown (not in the snapshot yet) are skipped until they are.
 */
export function nextJudgingEntries(
  prev: readonly JudgingEntry[],
  pending: readonly PendingCell[],
  usernames: ReadonlyMap<string, string>,
  now: string,
): JudgingEntry[] {
  const before = new Map(prev.map((e) => [pendingKey(e), e]));
  const next: JudgingEntry[] = [];
  for (const p of pending) {
    const username = usernames.get(p.userId);
    if (!username) continue;
    const old = before.get(pendingKey(p));
    next.push({ ...p, username, since: old?.since ?? now });
  }
  return next.sort((a, b) => (a.since < b.since ? 1 : a.since > b.since ? -1 : a.position - b.position));
}

/** "carol submitted Problem 4 · judging…" with the session clock of when it was first seen. */
export function judgingFeedLine(entry: JudgingEntry, startedAt: string | null): FeedLine {
  return {
    id: `judging-${pendingKey(entry)}`,
    at: entry.since,
    kind: "judging",
    clock: sessionClock(entry.since, startedAt),
    text: `${entry.username} submitted ${problemLabel(entry.position)} · judging…`,
  };
}

/** True when an event belongs to history that existed before the page loaded (no announcements). */
export function isHistoryEvent(eventId: string, initialCursor: string | null): boolean {
  if (initialCursor === null) return false;
  try {
    return BigInt(eventId) <= BigInt(initialCursor);
  } catch {
    return false;
  }
}

// --- Preferences (per browser, localStorage, versioned) ---------------------

/** v2 §9.2: failed attempts are announced by default from this key on. */
export const NOTIFICATION_PREFS_KEY = "lemmayard:room-notifications:v2";
/** The v1 key, read once to carry the person's explicit choices over. */
export const NOTIFICATION_PREFS_KEY_V1 = "lemmayard:room-notifications:v1";

export type NotificationPrefs = {
  /** In-app toasts on the problem page (the mute switch). */
  toasts: boolean;
  /** 150 ms 880 Hz tick on someone else's solve. */
  sound: boolean;
  /** System notifications while this tab is in the background. */
  browser: boolean;
  /** Announce other people's failed attempts (v2 default: on). */
  showAttempts: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  toasts: true,
  sound: false,
  browser: false,
  showAttempts: true,
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * v1 → v2 (§9.2 item 3): the v1 value is migrated field by field, except
 * `showAttempts`, which takes the new default (on). Malformed or missing v1
 * data gives the v2 defaults.
 */
export function migrateNotificationPrefsV1(raw: string | null): NotificationPrefs {
  return { ...parseNotificationPrefs(raw), showAttempts: DEFAULT_NOTIFICATION_PREFS.showAttempts };
}

/** Parses stored prefs; anything malformed falls back to the defaults field by field. */
export function parseNotificationPrefs(raw: string | null): NotificationPrefs {
  if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const pick = (k: keyof NotificationPrefs) =>
    typeof obj[k] === "boolean" ? (obj[k] as boolean) : DEFAULT_NOTIFICATION_PREFS[k];
  return { toasts: pick("toasts"), sound: pick("sound"), browser: pick("browser"), showAttempts: pick("showAttempts") };
}

/**
 * Reads the v2 key; without it, migrates the v1 key (and stores the result
 * under v2, so a later mute of failed attempts sticks).
 */
export function loadNotificationPrefs(storage: StorageLike | null): NotificationPrefs {
  try {
    const raw = storage?.getItem(NOTIFICATION_PREFS_KEY) ?? null;
    if (raw !== null) return parseNotificationPrefs(raw);
    const v1 = storage?.getItem(NOTIFICATION_PREFS_KEY_V1) ?? null;
    if (v1 === null) return { ...DEFAULT_NOTIFICATION_PREFS };
    const migrated = migrateNotificationPrefsV1(v1);
    saveNotificationPrefs(storage, migrated);
    return migrated;
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

/** Returns false when the browser refuses (private mode, quota, disabled storage). */
export function saveNotificationPrefs(storage: StorageLike | null, prefs: NotificationPrefs): boolean {
  try {
    if (!storage) return false;
    storage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

export type BrowserPermission = "unsupported" | "default" | "granted" | "denied";

/** A system notification only for a hidden tab, with the switch on and permission granted. */
export function shouldShowBrowserNotification(
  prefs: NotificationPrefs,
  env: { hidden: boolean; permission: BrowserPermission },
): boolean {
  return prefs.browser && env.hidden && env.permission === "granted";
}

/** Sound only for other people's solves (§3.5 "Sound"). */
export function shouldPlaySound(prefs: NotificationPrefs, notice: Notice): boolean {
  return prefs.sound && (notice.kind === "solved" || notice.kind === "batch");
}

/** `tag` de-duplicates the same event across tabs. */
export function browserNotificationTag(sessionId: string, noticeId: string): string {
  return `rs-${sessionId}-${noticeId}`;
}

/** Help text under the browser switch for each permission state. */
export function browserPermissionHelp(permission: BrowserPermission): string {
  switch (permission) {
    case "unsupported":
      return "This browser can't show notifications for this page. On iPhone and iPad they work only for web apps added to the Home Screen.";
    case "denied":
      return "Blocked in your browser settings.";
    default:
      return "Notifications in background tabs may be delayed by up to a minute.";
  }
}
