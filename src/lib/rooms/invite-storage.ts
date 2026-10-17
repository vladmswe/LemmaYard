// Keeps an invite token across the login/sign-up redirect (spec §1.2 step 2,
// §8.1): the join page moves the token from the URL fragment into
// sessionStorage (this tab only) and removes it from the address bar; it never
// goes into a query string. Entries expire after an hour. Browser only.
import { isInviteTokenFormat, tokenFromHash } from "./invite";

export const INVITE_STORAGE_KEY = "lemmayard.room-invite";
export const INVITE_STORAGE_TTL_MS = 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function saveInviteToken(storage: StorageLike, token: string, now = Date.now()): void {
  try {
    storage.setItem(INVITE_STORAGE_KEY, JSON.stringify({ token, savedAt: now }));
  } catch {
    // Storage blocked (private mode): the flow still works in this page view.
  }
}

export function readInviteToken(storage: StorageLike, now = Date.now()): string | null {
  try {
    const raw = storage.getItem(INVITE_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
    if (
      !isInviteTokenFormat(value.token) ||
      typeof value.savedAt !== "number" ||
      now - value.savedAt > INVITE_STORAGE_TTL_MS ||
      value.savedAt > now + 60_000
    ) {
      storage.removeItem(INVITE_STORAGE_KEY);
      return null;
    }
    return value.token;
  } catch {
    return null;
  }
}

export function clearInviteToken(storage: StorageLike): void {
  try {
    storage.removeItem(INVITE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * The token for this visit: a fresh one from the fragment (saved, wins over
 * an older stored one), else the stored one. `hadFragment` tells the caller to
 * strip the fragment from the address bar.
 */
export function takeInviteToken(
  hash: string,
  storage: StorageLike,
  now = Date.now(),
): { token: string | null; hadFragment: boolean } {
  const hadFragment = hash.length > 1;
  const fromHash = tokenFromHash(hash);
  if (fromHash) {
    saveInviteToken(storage, fromHash, now);
    return { token: fromHash, hadFragment };
  }
  if (hadFragment) {
    // A malformed fragment replaces any older stored token: it is what the user clicked.
    clearInviteToken(storage);
    return { token: null, hadFragment };
  }
  return { token: readInviteToken(storage, now), hadFragment };
}
