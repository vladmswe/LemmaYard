// Browser storage for the problem workspace (AC-M5-2, AC-M5-6). Pure TS over
// a `Storage`-like object so it is testable without a DOM. Every access is
// wrapped: storage can be missing (SSR), disabled (privacy mode) or full, and
// none of that may break or block the editor.
import { LANGUAGES, type Language, type SubmissionKind } from "@/lib/submission-dto";

/** The subset of the Web Storage API we use. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DRAFT_PREFIX = "lemmayard.draft.v1";
const LANGUAGE_PREFIX = "lemmayard.language.v1";
const PENDING_PREFIX = "lemmayard.pending.v1";

/** `lemmayard.draft.v1:<slug>:<language>` (localStorage). */
export function draftKey(slug: string, language: Language): string {
  return `${DRAFT_PREFIX}:${slug}:${language}`;
}

/** Last selected language per problem (localStorage). */
export function languageKey(slug: string): string {
  return `${LANGUAGE_PREFIX}:${slug}`;
}

/** Submission still being judged, per problem (sessionStorage). */
export function pendingKey(slug: string): string {
  return `${PENDING_PREFIX}:${slug}`;
}

/** `window.localStorage` / `sessionStorage`, or null when unavailable. */
export function getBrowserStorage(kind: "local" | "session"): KeyValueStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // Accessing the property itself throws when storage is blocked.
    return null;
  }
}

function read(storage: KeyValueStorage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** True when the value was stored. */
function write(storage: KeyValueStorage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    // Quota exceeded or storage disabled: the draft simply is not saved.
    return false;
  }
}

function remove(storage: KeyValueStorage | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore.
  }
}

type StoredDraft = { code: string; savedAt: number };

export function loadDraft(storage: KeyValueStorage | null, slug: string, language: Language): string | null {
  const raw = read(storage, draftKey(slug, language));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    return typeof parsed?.code === "string" ? parsed.code : null;
  } catch {
    return null;
  }
}

export function saveDraft(
  storage: KeyValueStorage | null,
  slug: string,
  language: Language,
  code: string,
  now: number = Date.now(),
): boolean {
  const value: StoredDraft = { code, savedAt: now };
  return write(storage, draftKey(slug, language), JSON.stringify(value));
}

export function clearDraft(storage: KeyValueStorage | null, slug: string, language: Language): void {
  remove(storage, draftKey(slug, language));
}

export function loadLanguage(storage: KeyValueStorage | null, slug: string): Language | null {
  const raw = read(storage, languageKey(slug));
  return (LANGUAGES as readonly string[]).includes(raw ?? "") ? (raw as Language) : null;
}

export function saveLanguage(storage: KeyValueStorage | null, slug: string, language: Language): void {
  write(storage, languageKey(slug), language);
}

/** A started Run/Submit whose result has not been shown yet (resumed after reload). */
export type PendingSubmission = { id: string; kind: SubmissionKind; custom: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function loadPending(storage: KeyValueStorage | null, slug: string): PendingSubmission | null {
  const raw = read(storage, pendingKey(slug));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingSubmission>;
    if (typeof parsed?.id !== "string" || !UUID_RE.test(parsed.id)) return null;
    if (parsed.kind !== "run" && parsed.kind !== "submit") return null;
    return { id: parsed.id, kind: parsed.kind, custom: parsed.custom === true };
  } catch {
    return null;
  }
}

export function savePending(storage: KeyValueStorage | null, slug: string, pending: PendingSubmission): void {
  write(storage, pendingKey(slug), JSON.stringify(pending));
}

export function clearPending(storage: KeyValueStorage | null, slug: string): void {
  remove(storage, pendingKey(slug));
}
