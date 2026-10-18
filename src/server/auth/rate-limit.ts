// Brute-force and argon2-cost protection for /api/auth/login and
// /api/auth/register (README "Security"). Checked after the cheap body
// validation and before any DB lookup or argon2 work.
//
// Limitation: the limiters are in-memory (createRateLimiter), so each server
// instance counts on its own and a cold start forgets the counts. On Vercel
// with several instances the effective limit is a multiple of these numbers.
// A DB-backed limiter needs a migration and is a follow-up.
import type { NextResponse } from "next/server";

import { getEnv } from "@/server/env";
import { clientAddress, createRateLimiter, type RateLimiter } from "@/server/http/rate-limit";
import { jsonError } from "@/server/http/request";

const MINUTE_MS = 60_000;

export const AUTH_LIMITS = {
  /** Failed logins per (address, email): slows guessing one account's password. */
  loginPerAddressEmail: { limit: 10, windowMs: 15 * MINUTE_MS },
  /** Failed logins per address: slows credential stuffing across many emails. */
  loginPerAddress: { limit: 30, windowMs: 15 * MINUTE_MS },
  /** Registration attempts per address (each one hashes a password). */
  registerPerAddress: { limit: 5, windowMs: 60 * MINUTE_MS },
  /** Registration attempts per (address, email). */
  registerPerAddressEmail: { limit: 3, windowMs: 60 * MINUTE_MS },
} as const;

export const loginAddressEmailLimiter = createRateLimiter(AUTH_LIMITS.loginPerAddressEmail);
export const loginAddressLimiter = createRateLimiter(AUTH_LIMITS.loginPerAddress);
export const registerAddressLimiter = createRateLimiter(AUTH_LIMITS.registerPerAddress);
export const registerAddressEmailLimiter = createRateLimiter(AUTH_LIMITS.registerPerAddressEmail);

export const LOGIN_RATE_LIMITED = "Too many login attempts.";
export const REGISTER_RATE_LIMITED = "Too many sign-up attempts.";

/** Shared bucket for requests without a client address (never on Vercel). */
export const UNKNOWN_ADDRESS = "unknown";

export type AuthLimitKeys = { address: string; addressEmail: string };

/**
 * Limiter keys for one request. The address is the first `x-forwarded-for`
 * hop (set by Vercel's edge, which overwrites what the client sends), else
 * `x-real-ip`, else one shared "unknown" bucket so a missing header never
 * means "unlimited". `email` is the already normalised (trimmed, lowercased)
 * value from the request schema.
 */
export function authLimitKeys(request: Request, email: string): AuthLimitKeys {
  const address = clientAddress(request) ?? UNKNOWN_ADDRESS;
  return { address: `a:${address}`, addressEmail: `ae:${address}|${email}` };
}

/** AUTH_RATE_LIMITS=0 (local Playwright only, rejected on Vercel) turns the limits off. */
function limitsEnabled(): boolean {
  return getEnv().AUTH_RATE_LIMITS !== "0";
}

function tooMany(message: string, retryAfterSec: number): NextResponse {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  const response = jsonError(429, `${message} Try again in ${minutes} min.`);
  response.headers.set("Retry-After", String(retryAfterSec));
  return response;
}

function firstBlocked(pairs: [RateLimiter, string][], message: string): NextResponse | null {
  for (const [limiter, key] of pairs) {
    const result = limiter.check(key);
    if (!result.ok) return tooMany(message, result.retryAfterSec);
  }
  return null;
}

/** 429 when this client already used up its failed-login budget. Records nothing. */
export function checkLoginLimit(keys: AuthLimitKeys): NextResponse | null {
  if (!limitsEnabled()) return null;
  return firstBlocked(
    [
      [loginAddressEmailLimiter, keys.addressEmail],
      [loginAddressLimiter, keys.address],
    ],
    LOGIN_RATE_LIMITED,
  );
}

/** Counts one failed login (unknown email and wrong password alike). */
export function recordLoginFailure(keys: AuthLimitKeys): void {
  loginAddressEmailLimiter.record(keys.addressEmail);
  loginAddressLimiter.record(keys.address);
}

/** 429 when over the registration budget; otherwise counts this attempt. */
export function hitRegisterLimit(keys: AuthLimitKeys): NextResponse | null {
  if (!limitsEnabled()) return null;
  const blocked = firstBlocked(
    [
      [registerAddressEmailLimiter, keys.addressEmail],
      [registerAddressLimiter, keys.address],
    ],
    REGISTER_RATE_LIMITED,
  );
  if (blocked) return blocked;
  registerAddressEmailLimiter.record(keys.addressEmail);
  registerAddressLimiter.record(keys.address);
  return null;
}

/** Drops all auth limiter state (tests). */
export function resetAuthLimits(): void {
  for (const limiter of [
    loginAddressEmailLimiter,
    loginAddressLimiter,
    registerAddressLimiter,
    registerAddressEmailLimiter,
  ]) {
    limiter.reset();
  }
}
