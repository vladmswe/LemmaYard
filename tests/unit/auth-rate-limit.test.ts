import { describe, expect, it } from "vitest";

import { authLimitKeys, UNKNOWN_ADDRESS } from "@/server/auth/rate-limit";
import { createSemaphore } from "@/server/http/semaphore";

const req = (headers: Record<string, string>) => new Request("http://localhost/api/auth/login", { headers });

describe("authLimitKeys", () => {
  it("uses the first x-forwarded-for hop (Vercel's client address)", () => {
    expect(authLimitKeys(req({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1, 10.0.0.2" }), "a@b.c")).toEqual({
      address: "a:203.0.113.7",
      addressEmail: "ae:203.0.113.7|a@b.c",
    });
  });

  it("falls back to x-real-ip, then to one shared bucket", () => {
    expect(authLimitKeys(req({ "x-real-ip": "198.51.100.4" }), "a@b.c").address).toBe("a:198.51.100.4");
    expect(authLimitKeys(req({ "x-forwarded-for": " , " }), "a@b.c").address).toBe(`a:${UNKNOWN_ADDRESS}`);
    expect(authLimitKeys(req({}), "a@b.c")).toEqual({
      address: `a:${UNKNOWN_ADDRESS}`,
      addressEmail: `ae:${UNKNOWN_ADDRESS}|a@b.c`,
    });
  });

  it("keeps different emails and different addresses apart, and caps the address length", () => {
    const one = authLimitKeys(req({ "x-forwarded-for": "203.0.113.7" }), "a@b.c");
    const otherEmail = authLimitKeys(req({ "x-forwarded-for": "203.0.113.7" }), "z@b.c");
    const otherAddress = authLimitKeys(req({ "x-forwarded-for": "203.0.113.8" }), "a@b.c");
    expect(otherEmail.address).toBe(one.address);
    expect(otherEmail.addressEmail).not.toBe(one.addressEmail);
    expect(otherAddress.addressEmail).not.toBe(one.addressEmail);
    const long = authLimitKeys(req({ "x-forwarded-for": "x".repeat(500) }), "a@b.c");
    expect(long.address).toBe(`a:${"x".repeat(64)}`);
  });
});

describe("createSemaphore", () => {
  it("runs at most `max` tasks at once and all of them eventually", async () => {
    const sem = createSemaphore(2);
    let running = 0;
    let peak = 0;
    const task = async (i: number) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return i;
    };
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => sem.run(() => task(i))));
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBe(2);
    expect(sem.active()).toBe(0);
    expect(sem.waiting()).toBe(0);
  });

  it("releases the slot when a task throws", async () => {
    const sem = createSemaphore(1);
    await expect(sem.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await sem.run(async () => "next")).toBe("next");
    expect(sem.active()).toBe(0);
  });
});
