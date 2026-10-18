// Trust levels (docs/specs/community.md §B.10): computed per request, never
// stored. TL0 "new" = account younger than 72 h OR no accepted submission
// yet; TL1 "established" = everything else. They gate ▼, links and rates.
import { COMMUNITY_LIMITS } from "./types";

export type TrustLevel = 0 | 1;

export function trustLevel(input: { createdAt: Date; hasAccepted: boolean }, now: Date): TrustLevel {
  const age = now.getTime() - input.createdAt.getTime();
  return age >= COMMUNITY_LIMITS.newAccountMs && input.hasAccepted ? 1 : 0;
}

/** Whether the account is still inside its first 72 hours. */
export function isNewAccount(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < COMMUNITY_LIMITS.newAccountMs;
}
