// Public profile data for `/u/[username]` (AC-M6-4). Counts and recently
// solved problems only; nothing here ever reads submission code.
import type { UserStats } from "@/lib/progress";
import { type Db, getDb } from "@/server/db";
import { type CatalogStats, getCatalogStats } from "@/server/landing";
import { getUserStats } from "@/server/progress";

export type ProfileData = { stats: UserStats; totals: CatalogStats };

/** The user's stats and the published totals per difficulty (two parallel queries). */
export async function getProfileData(userId: string, db: Db = getDb()): Promise<ProfileData> {
  const [stats, totals] = await Promise.all([getUserStats(userId, db), getCatalogStats(db)]);
  return { stats, totals };
}
