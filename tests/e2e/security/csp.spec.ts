// WP-3: security headers on real responses, and a walk through the app's
// main pages that fails on any Content-Security-Policy violation
// (`securitypolicyviolation` events in the page and CSP/Permissions-Policy
// errors in the console). Needs no judge: fixtures are created through the
// API. Users are *@example.test (delete them from a dev DB with
// `delete from users where email like '%@example.test'`).
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "correct-horse-battery";

const EXPECTED = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
};

test("responses carry the security headers", async ({ request }) => {
  for (const path of ["/", "/login", "/problems", "/learn", "/rooms/join", "/api/health", "/does-not-exist"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    expect(h, path).toMatchObject(EXPECTED);
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"], path).toContain("script-src 'self' 'unsafe-inline'");
    expect(h["permissions-policy"], path).toContain("camera=()");
    expect(h["referrer-policy"], path).toBe(path === "/rooms/join" ? "no-referrer" : "strict-origin-when-cross-origin");
  }
});

type Collected = { violations: string[] };

/** Records CSP violations from the page and CSP / Permissions-Policy console errors. */
async function watch(page: Page): Promise<Collected> {
  const collected: Collected = { violations: [] };
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const w = window as unknown as { __csp?: string[] };
      (w.__csp ??= []).push(`${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"} at ${e.sourceFile}:${e.lineNumber}`);
    });
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Content-Security-Policy|Permissions-Policy|Refused to/i.test(text)) {
      collected.violations.push(`console ${msg.type()}: ${text}`);
    }
  });
  return collected;
}

async function visit(page: Page, collected: Collected, path: string, ready?: (page: Page) => Promise<void>) {
  const res = await page.goto(path);
  expect(res, path).not.toBeNull();
  await page.waitForLoadState("networkidle");
  if (ready) await ready(page);
  const events = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  collected.violations.push(...events.map((e) => `${path}: ${e}`));
}

test("main pages raise no CSP violation", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const username = `csp_${Date.now().toString(36).slice(-6)}`;
  const context = await browser.newContext();
  await context.grantPermissions(["notifications"]);
  const page = await context.newPage();
  const collected = await watch(page);
  const api = context.request;
  const headers = { Origin: baseURL! };

  // Signed out.
  await visit(page, collected, "/");
  await visit(page, collected, "/login");
  await visit(page, collected, "/register");
  await visit(page, collected, "/does-not-exist");

  const reg = await api.post("/api/auth/register", {
    data: { email: `${username}@example.test`, username, password: PASSWORD },
    headers,
  });
  expect(reg.status()).toBe(201);

  await visit(page, collected, "/problems");
  // Monaco: editor, its worker and typing.
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  await visit(page, collected, "/problems/two-sum", async (p) => {
    const lines = p.locator('[data-testid="code-editor"] .monaco-editor .view-lines');
    await expect(lines).toBeVisible({ timeout: 60_000 });
    await lines.click();
    await p.keyboard.type("x = 1  # csp check");
    await expect(lines).toContainText("csp check");
    // Word-based suggestions run in the editor worker.
    await expect.poll(() => workers.length, { timeout: 15_000 }).toBeGreaterThan(0);
  });
  await visit(page, collected, "/submissions");
  await visit(page, collected, `/u/${username}`);
  await visit(page, collected, "/learn");
  await visit(page, collected, "/learn/arrays", async (p) => {
    await expect(p.locator("[data-player]").first()).toHaveAttribute("data-hydrated", "true");
  });

  // Rooms: list, room, lobby, live.
  await visit(page, collected, "/rooms");
  const room = await api.post("/api/rooms", { data: { name: "CSP Club" }, headers });
  expect(room.status()).toBe(201);
  const { id: roomId } = (await room.json()) as { id: string };
  await visit(page, collected, `/rooms/${roomId}`);
  await visit(page, collected, `/rooms/${roomId}?tab=members`);
  await visit(page, collected, `/rooms/${roomId}?tab=settings`);
  const session = await api.post(`/api/rooms/${roomId}/sessions`, { data: { problemCount: 2, durationMin: 30 }, headers });
  expect(session.status()).toBe(201);
  const { id: sessionId } = (await session.json()) as { id: string };
  const sessionPath = `/rooms/${roomId}/sessions/${sessionId}`;
  await visit(page, collected, sessionPath);
  const start = await api.post(`/api/rooms/${roomId}/sessions/${sessionId}/start`, { data: {}, headers });
  expect(start.status()).toBe(200);
  await visit(page, collected, sessionPath, async (p) => {
    await expect(p.getByTestId("scoreboard")).toBeVisible({ timeout: 10_000 });
    // The Web Notification API stays usable under Permissions-Policy (headless
    // Chromium reports Notification.permission "denied" even when granted, so
    // ask the Permissions API).
    expect(await p.evaluate(() => typeof Notification)).toBe("function");
    expect(
      await p.evaluate(async () => (await navigator.permissions.query({ name: "notifications" })).state),
    ).toBe("granted");
    await p.waitForTimeout(2500); // a few state polls
  });
  const end = await api.post(`/api/rooms/${roomId}/sessions/${sessionId}/end`, { data: {}, headers });
  expect(end.status()).toBe(200);
  await visit(page, collected, `${sessionPath}/results`);

  expect(collected.violations).toEqual([]);

  await api.post(`/api/rooms/${roomId}/delete`, { data: { confirmName: "CSP Club" }, headers });
  await context.close();
});
