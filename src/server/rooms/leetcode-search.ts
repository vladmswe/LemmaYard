// GET …/sessions/:sid/leetcode-search (docs/specs/leetcode-integration.md
// §6.7): the host or owner searches the LeetCode catalog in the lobby to pick
// a problem by hand. Bounded output (≤ 20 entries), never premium or excluded
// problems, never slugs already in the session, rate-limited per session.
// Check order: 401 → query 400 → non-member / foreign session 404 → host 403
// → state 409 → catalog 409 → rate 429.
import type { NextResponse } from "next/server";
import { z } from "zod";

import { LEETCODE_TAG_SLUGS } from "@/lib/leetcode/catalog-schema";
import { provenanceOf } from "@/lib/leetcode/labels";
import { canManageSession } from "@/lib/rooms/session-state";
import { HOST_ONLY } from "@/lib/rooms/session-view";
import { DIFFICULTIES } from "@/lib/rooms/types";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http/request";
import { getLeetCodeCatalog } from "@/server/leetcode/catalog";

import { requireRoomMember, requireSessionInRoom } from "./access";
import { loadExternalSlots } from "./draw";
import { lobbyExternalLimiter } from "./external";
import { json, SIGN_IN_REQUIRED, tooMany } from "./http";
import { CATALOG_UNAVAILABLE } from "./leetcode";
import { codedError, notInLobby, sessionNotFound } from "./sessions";

export const LEETCODE_SEARCH_LIMIT = 20;
export const LEETCODE_SEARCH_MAX_Q = 60;

const rating = z
  .string()
  .regex(/^\d{1,4}$/, "Use a whole number 0–4000")
  .transform(Number)
  .refine((n) => n <= 4000, "Use a whole number 0–4000");

export const leetcodeSearchQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .max(LEETCODE_SEARCH_MAX_Q, `Use at most ${LEETCODE_SEARCH_MAX_Q} characters`)
    .refine((s) => !/\p{Cc}/u.test(s), "The search contains characters that are not allowed")
    .optional(),
  difficulty: z.enum(DIFFICULTIES, "Choose easy, medium or hard").optional(),
  min: rating.optional(),
  max: rating.optional(),
  tag: z.enum(LEETCODE_TAG_SLUGS, "Unknown topic").optional(),
});

export type LeetCodeSearchHit = {
  n: number;
  slug: string;
  title: string;
  difficulty: (typeof DIFFICULTIES)[number] | null;
  rating: number | null;
  tags: string[];
  provenance: ReturnType<typeof provenanceOf>;
};

export async function searchLeetCode(request: Request, roomId: string, sessionId: string): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const query = leetcodeSearchQuerySchema.safeParse(params);
  if (!query.success) {
    const issue = query.error.issues[0];
    return jsonError(400, issue.message, { [String(issue.path[0] ?? "q")]: issue.message });
  }
  const db = getDb();
  const access = await requireRoomMember(db, roomId, user.id);
  if (!access) return sessionNotFound();
  const session = await requireSessionInRoom(db, roomId, sessionId);
  if (!session) return sessionNotFound();
  if (!canManageSession({ userId: user.id, role: access.role }, session)) return jsonError(403, HOST_ONLY);
  if (session.status !== "lobby") return notInLobby(session);
  const catalog = getLeetCodeCatalog();
  if (!catalog) return codedError(409, "leetcode_catalog_unavailable", CATALOG_UNAVAILABLE);
  const limited = lobbyExternalLimiter.hit(session.id);
  if (!limited.ok) return tooMany("Too many searches in this lobby. Try again later.", limited.retryAfterSec);

  const inSession = new Set((await loadExternalSlots(db, session.id)).map((e) => e.slug));
  const { q, difficulty, min, max, tag } = query.data;
  const needle = q?.toLowerCase() ?? "";
  const byNumber = /^\d+$/.test(needle);
  const hits: LeetCodeSearchHit[] = [];
  for (const p of catalog.visible) {
    if (inSession.has(p.slug)) continue;
    if (needle && !(byNumber ? String(p.n).startsWith(needle) : p.title.toLowerCase().includes(needle))) continue;
    if (difficulty && p.difficulty !== difficulty) continue;
    if (min !== undefined && (p.rating === null || p.rating < min)) continue;
    if (max !== undefined && (p.rating === null || p.rating > max)) continue;
    if (tag && !p.tags.includes(tag)) continue;
    hits.push({
      n: p.n,
      slug: p.slug,
      title: p.title,
      difficulty: p.difficulty,
      rating: p.rating,
      tags: p.tags,
      provenance: provenanceOf(p),
    });
    if (hits.length >= LEETCODE_SEARCH_LIMIT) break;
  }
  return json({ problems: hits });
}
