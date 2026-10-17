// Browser side effects of room notifications (docs/specs/rooms.md §3.5):
// the WebAudio tick (no asset) and system notifications. Every call degrades
// silently when the API is missing or throws (iOS Safari tabs, private
// windows, blocked permissions). Permission is requested only from a click.
import type { BrowserPermission } from "@/lib/rooms/notifications";

type AudioCtor = typeof AudioContext;

let audio: AudioContext | null = null;

function audioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Creates/resumes the audio context. Call it from the click that turns the
 * sound on: browsers only start audio after a user gesture.
 */
export function primeSound(): boolean {
  try {
    const Ctor = audioCtor();
    if (!Ctor) return false;
    audio ??= new Ctor();
    void audio.resume();
    return true;
  } catch {
    return false;
  }
}

/** 150 ms 880 Hz sine "tick" with a short fade, quiet. */
export function playTick(): void {
  try {
    if (!audio) primeSound();
    if (!audio || audio.state !== "running") return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  } catch {
    // No sound is fine.
  }
}

export function browserPermission(): BrowserPermission {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission as BrowserPermission;
  } catch {
    return "unsupported";
  }
}

/** Only ever called from a click handler (never on page load, AC-S-UI-3). */
export async function requestBrowserPermission(): Promise<BrowserPermission> {
  try {
    if (browserPermission() === "unsupported") return "unsupported";
    const result = await Notification.requestPermission();
    return result as BrowserPermission;
  } catch {
    return browserPermission();
  }
}

export function showBrowserNotification(title: string, body: string | undefined, tag: string, href?: string): void {
  try {
    if (browserPermission() !== "granted") return;
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      try {
        window.focus();
        if (href) window.location.assign(href);
        n.close();
      } catch {
        // ignore
      }
    };
  } catch {
    // Mobile Chrome throws for `new Notification` without a service worker: in-app only.
  }
}

export function getLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Fired by the problem page after the user's own submit gets its verdict (the banner polls at once). */
export { OWN_SUBMIT_FINAL_EVENT } from "@/components/problem/submit-context";
