// Invite links (docs/specs/rooms.md §8.1): 32 random bytes as base64url
// (43 chars, 256 bits). Only sha256(token) as 64 lowercase hex chars is
// stored in `rooms.invite_token_hash`; the plaintext is shown to the owner
// once. Web Crypto only, so this module also runs in the browser (format
// check on the join page).

export const INVITE_TOKEN_BYTES = 32;
export const INVITE_TOKEN_LENGTH = 43;
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const INVITE_HASH_PATTERN = /^[0-9a-f]{64}$/;
export const INVITE_EXPIRY_DAYS = [1, 7, 30] as const;
export type InviteExpiryDays = (typeof INVITE_EXPIRY_DAYS)[number];
export const DEFAULT_INVITE_EXPIRY_DAYS: InviteExpiryDays = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh 43-char base64url token from 32 CSPRNG bytes. */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Format check only (length and alphabet); existence is checked by hash lookup. */
export function isInviteTokenFormat(token: unknown): token is string {
  return typeof token === "string" && INVITE_TOKEN_PATTERN.test(token);
}

/** sha256(token) as 64 lowercase hex chars: the value stored and looked up (Q12). */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function inviteExpiresAt(now: Date, days: InviteExpiryDays = DEFAULT_INVITE_EXPIRY_DAYS): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** A link is usable while a hash is set and `now < expiresAt`. */
export function isInviteActive(
  room: { inviteTokenHash: string | null; inviteExpiresAt: Date | null },
  now: Date,
): boolean {
  return room.inviteTokenHash !== null && room.inviteExpiresAt !== null && now < room.inviteExpiresAt;
}

/** `https://<host>/rooms/join#<token>`: the token lives in the fragment, never in a query string. */
export function inviteUrl(origin: string, token: string): string {
  return `${new URL(origin).origin}/rooms/join#${token}`;
}

/** Reads the token from `location.hash` (`#<token>`), or null. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.startsWith("#") ? hash.slice(1) : hash;
  return isInviteTokenFormat(token) ? token : null;
}
