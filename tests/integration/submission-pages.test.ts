// Page-level access control for history (AC-M6-1..3): `/submissions/[id]`
// is owner-only with one uniform 404 (other user, run, unknown, malformed),
// guests are sent to log in, and the problem tab never shows another user's
// rows. Pages are called directly with a mocked cookie jar.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
}));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
  }),
}));

import SubmissionPage, { generateMetadata } from "@/app/(site)/submissions/[id]/page";
import SubmissionsPage from "@/app/(site)/submissions/page";
import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { ProblemSubmissions } from "@/components/submissions/problem-submissions";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";

import { closeTestDb, createProblem, createSubmission, createUser, getTestDb, resetTestDb } from "../helpers/db";

let alice: { id: string };
let bob: { id: string };
let aliceSubmit: string;
let aliceRun: string;
let bobSubmit: string;

async function signIn(user: { id: string } | null) {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
}

const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

/** "404", "redirect:<target>" or "ok". */
async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest === "NEXT_HTTP_ERROR_FALLBACK;404") return "404";
    if (digest.startsWith("NEXT_REDIRECT")) return `redirect:${digest.split(";")[2]}`;
    throw error;
  }
}

beforeAll(async () => {
  state.db = getTestDb();
  await resetTestDb();
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  const problem = await createProblem({ slug: "two-sum", title: "Two Sum" });
  const done = { finishedAt: new Date() };
  aliceSubmit = (await createSubmission({ userId: alice.id, problemId: problem.id, status: "accepted", ...done })).id;
  aliceRun = (await createSubmission({ userId: alice.id, problemId: problem.id, kind: "run", status: "accepted", ...done })).id;
  bobSubmit = (await createSubmission({ userId: bob.id, problemId: problem.id, status: "wrong_answer", ...done })).id;
});

afterAll(async () => {
  await resetTestDb();
  await closeTestDb();
});

describe("/submissions/[id] (AC-M6-2)", () => {
  it("renders the owner's submit with a verdict title", async () => {
    await signIn(alice);
    expect(await outcome(SubmissionPage(props(aliceSubmit)))).toBe("ok");
    expect(await generateMetadata(props(aliceSubmit))).toEqual({ title: "Accepted · Two Sum · LemmaYard" });
  });

  it("answers the same 404 for another user's submit, a run, an unknown and a malformed id", async () => {
    await signIn(alice);
    for (const id of [bobSubmit, aliceRun, "00000000-0000-4000-8000-000000000000", "nope", "1;drop", `${aliceSubmit}0`]) {
      expect(await outcome(SubmissionPage(props(id)))).toBe("404");
      expect(await generateMetadata(props(id))).toEqual({ title: NOT_FOUND_TITLE });
    }
    // And Bob cannot open Alice's.
    await signIn(bob);
    expect(await outcome(SubmissionPage(props(aliceSubmit)))).toBe("404");
  });

  it("sends a guest with a well-formed id to log in; a malformed id is a 404 for guests too", async () => {
    await signIn(null);
    expect(await outcome(SubmissionPage(props(aliceSubmit)))).toBe(
      `redirect:/login?next=${encodeURIComponent(`/submissions/${aliceSubmit}`)}`,
    );
    expect(await generateMetadata(props(aliceSubmit))).toEqual({ title: "Submission · LemmaYard" });
    expect(await outcome(SubmissionPage(props("not-a-uuid")))).toBe("404");
  });
});

describe("/submissions (AC-M6-1)", () => {
  it("redirects guests and renders for a signed-in user with any params", async () => {
    await signIn(null);
    expect(await outcome(SubmissionsPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }))).toBe(
      "redirect:/login?next=%2Fsubmissions",
    );
    await signIn(alice);
    for (const searchParams of [{}, { page: "2" }, { page: "x" }, { problem: "no-such" }, { problem: "Bad Slug" }]) {
      expect(await outcome(SubmissionsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))).toBe("ok");
    }
  });
});

describe("problem page Submissions tab (AC-M6-3)", () => {
  type El = { props: Record<string, unknown> };
  const findRows = (node: unknown): { id: string }[] | null => {
    if (!node || typeof node !== "object") return null;
    const el = node as El;
    if (Array.isArray(el.props?.rows)) return el.props.rows as { id: string }[];
    const children = el.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findRows(child);
      if (found) return found;
    }
    return null;
  };

  it("lists only the signed-in user's submits (no runs, no other users)", async () => {
    const aliceTab = await ProblemSubmissions({ slug: "two-sum", userId: alice.id });
    expect(findRows(aliceTab)?.map((r) => r.id)).toEqual([aliceSubmit]);
    const bobTab = await ProblemSubmissions({ slug: "two-sum", userId: bob.id });
    expect(findRows(bobTab)?.map((r) => r.id)).toEqual([bobSubmit]);
  });

  it("shows a log-in prompt to guests without querying submissions", async () => {
    const guestTab = (await ProblemSubmissions({ slug: "two-sum", userId: null })) as El;
    expect(guestTab.props.title).toBe("Log in to see your submissions");
    expect(findRows(guestTab)).toBeNull();
  });
});
