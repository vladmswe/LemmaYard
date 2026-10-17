// Per-browser guide preferences in localStorage. Created verbatim by M-G0 and M-G1.
import { useSyncExternalStore } from "react";

import type { CodeLanguage } from "./contracts";

export type MotionPref = "system" | "on" | "off";
export interface GuidePrefs {
  readonly codeLanguage: CodeLanguage;
  readonly motion: MotionPref;
  readonly skipPrompts: boolean;
  readonly speed: 0.5 | 1 | 2;
}

export const PREFS_KEY = "lemmayard.learn.prefs.v1";
export const DEFAULT_PREFS: GuidePrefs = {
  codeLanguage: "python",
  motion: "system",
  skipPrompts: false,
  speed: 1,
};
const EVENT = "lemmayard-learn-prefs";

let cachedRaw: string | null | undefined;
let cachedPrefs: GuidePrefs = DEFAULT_PREFS;

function parse(raw: string | null): GuidePrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<GuidePrefs>;
    return {
      codeLanguage: v.codeLanguage === "javascript" ? "javascript" : "python",
      motion: v.motion === "on" || v.motion === "off" ? v.motion : "system",
      skipPrompts: v.skipPrompts === true,
      speed: v.speed === 0.5 || v.speed === 2 ? v.speed : 1,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function readPrefs(): GuidePrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREFS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = parse(raw);
  }
  return cachedPrefs;
}

export function writePrefs(patch: Partial<GuidePrefs>): void {
  const next = { ...readPrefs(), ...patch };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode): keep working with defaults
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useGuidePrefs(): GuidePrefs {
  return useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS);
}
