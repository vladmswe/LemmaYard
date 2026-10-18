// Public profile data for `/u/[username]` (AC-M6-4). Counts and recently
// solved problems only; nothing here ever reads submission code.
import { summarizeProfileExtras, summarizeUserStats, type ProfileExtras, type UserStats } from "@/lib/progress";
import { type Db, getDb } from "@/server/db";
import { type CatalogStats, getCatalogStats } from "@/server/landing";
import { getSubmissionGroups } from "@/server/progress";

export type ProfileData = { stats: UserStats; extras: ProfileExtras; totals: CatalogStats };

/**
 * The user's stats (the same numbers as the landing card), the profile
 * extras from the same rows and the published totals per difficulty (two
 * parallel queries).
 */
export async function getProfileData(userId: string, db: Db = getDb()): Promise<ProfileData> {
  const [groups, totals] = await Promise.all([getSubmissionGroups(userId, db), getCatalogStats(db)]);
  return { stats: summarizeUserStats(groups), extras: summarizeProfileExtras(groups), totals };
}
