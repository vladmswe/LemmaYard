// Roles CLI core, counter recount and the moderation queue reads
// (docs/specs/community.md §B.10, §C.1, AC-C-RP-4).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  listAuditLog,
  listHiddenPending,
  listOpenReports,
  moderationQueueCount,
} from "@/server/community/moderation";
import { counterDrift, recountCommunity } from "@/server/community/recount";
import { roleArgsSchema, setUserRole } from "@/server/community/roles";
import { commentVotes, comments, discussionThreads, moderationActions, problems, problemVotes, reports, users } from "@/server/db/schema";

import { insertComment, trustedUser } from "../helpers/community";
import { closeTestDb, createProblem, createUser, getTestDb, resetTestDb } from "../helpers/db";

beforeEach(resetTestDb);
afterAll(closeTestDb);

describe("pnpm user:role (setUserRole)", () => {
  it("sets the role by email and returns the previous one; unknown email → null", async () => {
    const user = await createUser({ email: "owner@example.com", username: "owner" });
    expect(await setUserRole(getTestDb(), "owner@example.com", "admin")).toEqual({ username: "owner", previous: "user" });
    const [row] = await getTestDb().select({ role: users.role }).from(users).where(eq(users.id, user.id));
    expect(row.role).toBe("admin");
    expect(await setUserRole(getTestDb(), "nobody@example.com", "moderator")).toBeNull();
  });

  it("validates the arguments (email normalized, role enum)", () => {
    expect(roleArgsSchema.parse({ email: " Owner@Example.com ", role: "moderator" })).toEqual({
      email: "owner@example.com",
      role: "moderator",
    });
    expect(roleArgsSchema.safeParse({ email: "owner@example.com", role: "superuser" }).success).toBe(false);
    expect(roleArgsSchema.safeParse({ email: "not-an-email", role: "admin" }).success).toBe(false);
  });
});

describe("community:recount", () => {
  it("fixes deliberately broken counters", async () => {
    const problem = await createProblem();
    const a = await trustedUser(problem.id);
    const b = await trustedUser(problem.id);
    const top = await insertComment({ problemId: problem.id, authorId: a.id });
    await insertComment({ problemId: problem.id, authorId: b.id, parentId: top.id });
    await getTestDb().insert(commentVotes).values({ commentId: top.id, userId: b.id, value: 1 });
    await getTestDb().insert(problemVotes).values({ problemId: problem.id, userId: b.id, value: -1 });
    await getTestDb().update(comments).set({ upCount: 1 }).where(eq(comments.id, top.id));
    await getTestDb().update(problems).set({ dislikeCount: 1 }).where(eq(problems.id, problem.id));
    expect(await counterDrift(getTestDb())).toEqual([]);

    await getTestDb().update(comments).set({ upCount: 7, downCount: 3, replyCount: 9 }).where(eq(comments.id, top.id));
    await getTestDb().update(discussionThreads).set({ commentCount: 42 });
    await getTestDb().update(problems).set({ likeCount: 5, dislikeCount: 0 });
    const drift = await counterDrift(getTestDb());
    expect(drift.map((d) => `${d.table}.${d.column}`).sort()).toEqual([
      "comments.down_count",
      "comments.reply_count",
      "comments.up_count",
      "discussion_threads.comment_count",
      "problems.dislike_count",
      "problems.like_count",
    ]);
    expect(await recountCommunity(getTestDb())).toEqual({ comments: 1, discussion_threads: 1, problems: 1 });
    expect(await counterDrift(getTestDb())).toEqual([]);
    const [p] = await getTestDb().select({ like: problems.likeCount, dislike: problems.dislikeCount }).from(problems);
    expect(p).toEqual({ like: 0, dislike: 1 });
  });
});

describe("AC-C-RP-4 moderation queue reads", () => {
  it("open reports grouped per target, oldest first, with reasons, counts and author facts", async () => {
    const problem = await createProblem({ title: "Coin Change", number: 322 });
    const author = await trustedUser(problem.id, { username: "spammer" });
    const other = await trustedUser(problem.id, { username: "other" });
    const older = await insertComment({ problemId: problem.id, authorId: author.id, body: "Buy cheap answers at example dot com" });
    const newer = await insertComment({ problemId: problem.id, authorId: other.id, body: "you clearly have no idea" });
    // Another removed comment by the author: counted as an earlier removal.
    await insertComment({ problemId: problem.id, authorId: author.id, status: "removed" });
    const reporters = await Promise.all([1, 2, 3].map(() => trustedUser(problem.id)));
    const t0 = Date.now() - 60 * 60 * 1000;
    await getTestDb().insert(reports).values([
      { reporterId: reporters[0].id, targetType: "comment", targetId: older.id, reason: "spam", createdAt: new Date(t0) },
      { reporterId: reporters[1].id, targetType: "comment", targetId: older.id, reason: "spam", details: "ads", createdAt: new Date(t0 + 1000) },
      { reporterId: reporters[2].id, targetType: "comment", targetId: older.id, reason: "malware", createdAt: new Date(t0 + 2000) },
      { reporterId: reporters[0].id, targetType: "comment", targetId: newer.id, reason: "harassment", createdAt: new Date(t0 + 5000) },
    ]);
    const queue = await listOpenReports(getTestDb());
    expect(queue.map((q) => q.commentId)).toEqual([older.id, newer.id]);
    expect(queue[0]).toMatchObject({
      reportCount: 3,
      reasons: [
        { reason: "spam", count: 2 },
        { reason: "malware", count: 1 },
      ],
      details: ["ads"],
      problem: { title: "Coin Change", number: 322 },
      author: { username: "spammer", removals: 1 },
    });
    expect(queue[0].excerpt).toContain("Buy cheap answers");
    expect(queue[1]).toMatchObject({ reportCount: 1, reasons: [{ reason: "harassment", count: 1 }], author: { username: "other", removals: 0 } });

    // A held comment without reports also counts for the badge.
    const held = await insertComment({ problemId: problem.id, authorId: other.id, status: "hidden_pending" });
    expect((await listHiddenPending(getTestDb())).map((h) => h.commentId)).toEqual([held.id]);
    expect(await moderationQueueCount(getTestDb())).toBe(3);

    await getTestDb()
      .insert(moderationActions)
      .values({ actorId: other.id, action: "hide", targetType: "comment", targetId: older.id, reason: "spam" });
    expect(await listAuditLog(getTestDb())).toMatchObject([{ actor: "other", action: "hide", reason: "spam" }]);
    const { rows } = await getTestDb().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM reports WHERE status = 'open'`);
    expect(rows[0].n).toBe(4);
  });
});
