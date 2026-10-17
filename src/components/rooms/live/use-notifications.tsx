"use client";

// Notification preferences (shared by every settings popover on the page) and
// the announcer that turns notices into toasts, a sound and system
// notifications (docs/specs/rooms.md §3.5). Notifications exist only while a
// tab is open (v1); notices are de-duplicated by id across reconnects, and a
// burst (reconnect, long background) collapses into "N updates while you were
// away". Toasts are not shown into a hidden tab: they wait for it to return.
import { CircleCheckIcon, CircleDashedIcon, FlagIcon, InfoIcon, PlayIcon, TimerIcon, UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";

import { createDedupe } from "@/lib/rooms/event-source";
import {
  batchNotices,
  browserNotificationTag,
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  shouldPlaySound,
  shouldShowBrowserNotification,
  type Notice,
  type NotificationPrefs,
} from "@/lib/rooms/notifications";

import { browserPermission, getLocalStorage, playTick, showBrowserNotification } from "./alerts";

// --- Preferences store -----------------------------------------------------

let current: NotificationPrefs | null = null;
const listeners = new Set<() => void>();

function read(): NotificationPrefs {
  current ??= loadNotificationPrefs(getLocalStorage());
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("lemmayard:room-notifications")) {
      current = loadNotificationPrefs(getLocalStorage());
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
  current = { ...read(), ...patch };
  saveNotificationPrefs(getLocalStorage(), current);
  for (const l of listeners) l();
  return current;
}

/** The viewer's prefs; the server render and first client render use the defaults. */
export function useNotificationPrefs(): NotificationPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_NOTIFICATION_PREFS);
}

// --- Announcer --------------------------------------------------------------

const ICONS: Record<Notice["kind"], ReactNode> = {
  solved: <CircleCheckIcon aria-hidden className="size-4 text-success" />,
  attempt: <CircleDashedIcon aria-hidden className="size-4 text-muted-foreground" />,
  joined: <UserPlusIcon aria-hidden className="size-4 text-info" />,
  started: <PlayIcon aria-hidden className="size-4 text-info" />,
  ended: <FlagIcon aria-hidden className="size-4 text-info" />,
  milestone: <TimerIcon aria-hidden className="size-4 text-warning" />,
  batch: <InfoIcon aria-hidden className="size-4 text-info" />,
};

export type AnnounceOptions = {
  sessionId: string;
  /** Which notices may toast on this screen (the session screen shows its Activity feed instead). */
  toasts: (notice: Notice) => boolean;
  scoreboardHref: string;
};

function isHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * Returns `announce(notices)`. Each notice id is announced once per page
 * (the poller de-duplicates per subscription; this covers re-subscribes).
 */
export function useAnnouncer({ sessionId, toasts, scoreboardHref }: AnnounceOptions) {
  const router = useRouter();
  const prefs = useNotificationPrefs();
  const prefsRef = useRef(prefs);
  const seen = useRef(createDedupe(200));
  const waiting = useRef<Notice[]>([]);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const showToasts = useCallback(
    (list: Notice[]) => {
      for (const n of batchNotices(list, scoreboardHref)) {
        toast(n.title, {
          id: n.id,
          description: n.description,
          icon: ICONS[n.kind],
          ...(n.action ? { action: { label: n.action.label, onClick: () => router.push(n.action!.href) } } : {}),
        });
      }
    },
    [router, scoreboardHref],
  );

  useEffect(() => {
    const onVisible = () => {
      if (isHidden() || waiting.current.length === 0) return;
      const list = waiting.current;
      waiting.current = [];
      showToasts(list);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [showToasts]);

  return useCallback(
    (notices: Notice[]) => {
      const fresh = notices.filter((n) => seen.current.add(n.id));
      if (fresh.length === 0) return;
      const p = prefsRef.current;
      const hidden = isHidden();
      if (shouldShowBrowserNotification(p, { hidden, permission: browserPermission() })) {
        for (const n of batchNotices(fresh, scoreboardHref)) {
          showBrowserNotification(n.title, n.description, browserNotificationTag(sessionId, n.id), n.action?.href);
        }
      }
      if (fresh.some((n) => shouldPlaySound(p, n))) playTick();
      const toastable = p.toasts ? fresh.filter(toasts) : [];
      if (toastable.length === 0) return;
      if (hidden) waiting.current.push(...toastable);
      else showToasts(toastable);
    },
    [sessionId, toasts, scoreboardHref, showToasts],
  );
}
