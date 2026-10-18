// The community switches (docs/specs/community.md §C.13, AC-C-GEN-1/2).
// Every community page, route, nav item, footer column and button asks here.
// C2/C3 reuse it (plans may get their own PLANS_ENABLED next to it).
import { notFound } from "next/navigation";

import { getEnv } from "@/server/env";

export type CommunityFlags = {
  /** COMMUNITY_ENABLED=1: anything community-related exists at all. */
  enabled: boolean;
  /** COMMUNITY_READ_ONLY=1: reads work, every write answers 503. */
  readOnly: boolean;
  /** CONTACT_EMAIL (legal and report pages), or null when unset. */
  contactEmail: string | null;
};

export function communityFlags(): CommunityFlags {
  const env = getEnv();
  return {
    enabled: env.COMMUNITY_ENABLED === "1",
    readOnly: env.COMMUNITY_READ_ONLY === "1",
    contactEmail: env.CONTACT_EMAIL ?? null,
  };
}

export function isCommunityEnabled(): boolean {
  return communityFlags().enabled;
}

/** For community pages: 404 (Next `notFound()`) while the flag is off. */
export function requireCommunityPage(): CommunityFlags {
  const flags = communityFlags();
  if (!flags.enabled) notFound();
  return flags;
}
