// /u/[username]: unknown, malformed and wrong-case names are a 404 whose tab
// title matches the not-found page (QA-1 D-03); existing users get their name.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => ({ db: undefined as Db | undefined }));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

// Guest: no session cookie.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import ProfilePage, { generateMetadata } from "@/app/(site)/u/[username]/page";
import { NOT_FOUND_TITLE } from "@/components/not-found-content";

import { closeTestDb, createUser, getTestDb, resetTestDb } from "../helpers/db";

function props(username: string) {
  return { params: Promise.resolve({ username }), searchParams: Promise.resolve({}) };
}

async function httpFallback(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return digest;
    throw error;
  }
}

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(resetTestDb);
afterAll(closeTestDb);

describe("/u/[username]", () => {
  it("titles an existing profile with the username and renders it", async () => {
    await createUser({ username: "qa_name" });
    expect(await generateMetadata(props("qa_name"))).toEqual({ title: "qa_name · LemmaYard" });
    expect(await httpFallback(ProfilePage(props("qa_name")))).toBeNull();
  });

  it.each([
    ["unknown", "nobody_here"],
    ["wrong case of an existing user", "QA_NAME"],
    ["malformed", "a b"],
    ["NUL", "\u0000"],
  ])("gives a %s name the not-found title and a 404", async (_case, username) => {
    await createUser({ username: "qa_name" });
    expect(await generateMetadata(props(username))).toEqual({ title: NOT_FOUND_TITLE });
    expect(await httpFallback(ProfilePage(props(username)))).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
