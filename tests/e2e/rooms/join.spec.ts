// Rooms R2 e2e (docs/specs/rooms.md AC-S-INV-4): the owner creates a room and
// an invite; a signed-in friend joins via the link; a guest opens the link,
// signs up and lands on the join confirmation with the token kept in
// sessionStorage; no request URL or Referer ever carries the token.
// Users are created with @example.test emails (delete them from a dev DB with
// `delete from users where email like '%@example.test'`).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "correct-horse-battery";

async function register(context: BrowserContext, baseURL: string, username: string) {
  const res = await context.request.post("/api/auth/register", {
    data: { email: `${username}@example.test`, username, password: PASSWORD },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(201);
}

function recordRequests(page: Page, into: string[]) {
  page.on("request", (r) => into.push(`${r.url()} ${r.headers()["referer"] ?? ""}`));
}

/** axe on the page content (the shared header has its own, pre-existing findings). */
async function expectNoSeriousAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).include("main").analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

test("owner invites; a member and a guest join through the link", async ({ browser, baseURL }) => {
  const suffix = Date.now().toString(36).slice(-6);
  const owner = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const friend = await browser.newContext();
  const guest = await browser.newContext();
  const seen: string[] = [];
  await register(owner, baseURL!, `own_${suffix}`);
  await register(friend, baseURL!, `fri_${suffix}`);

  // Owner: empty state → New room → room page (Settings tab: invite link, members).
  const po = await owner.newPage();
  recordRequests(po, seen);
  await po.goto("/rooms");
  await expect(po.getByRole("heading", { name: "No rooms yet" })).toBeVisible();
  await expectNoSeriousAxe(po);
  await po.getByRole("button", { name: "Create a team room" }).first().click();
  await po.getByLabel("Room name").fill("E2E Club");
  await po.getByRole("button", { name: "Create room" }).click();
  await expect(po).toHaveURL(/\/rooms\/[0-9a-f-]{36}\?tab=settings$/);
  const roomPath = new URL(po.url()).pathname;

  await po.getByRole("button", { name: "Create link" }).click();
  const link = await po.getByLabel("Link", { exact: true }).inputValue();
  const token = new URL(link).hash.slice(1);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await po.getByRole("button", { name: "Copy link" }).click();
  await expect(po.getByRole("button", { name: "Copied" })).toBeVisible();
  await expectNoSeriousAxe(po);

  // Signed-in friend.
  const pf = await friend.newPage();
  recordRequests(pf, seen);
  await pf.goto(link);
  await expect(pf.getByRole("heading", { name: "Join E2E Club?" })).toBeVisible();
  expect(pf.url()).not.toContain(token); // fragment removed from the address bar
  await expectNoSeriousAxe(pf);
  await pf.getByRole("button", { name: "Join room" }).click();
  await expect(pf).toHaveURL(new RegExp(`${roomPath}$`));

  // Guest → Sign up → back on the confirmation.
  const pg = await guest.newPage();
  recordRequests(pg, seen);
  await pg.goto(link);
  await expect(pg.getByRole("heading", { name: "You're invited to a room" })).toBeVisible();
  await pg.locator("main").getByRole("link", { name: "Sign up" }).click();
  await expect(pg).toHaveURL(/\/register\?next=%2Frooms%2Fjoin$/);
  await pg.getByLabel("Email").fill(`gst_${suffix}@example.test`);
  await pg.getByLabel("Username").fill(`gst_${suffix}`);
  await pg.getByLabel("Password").fill(PASSWORD);
  await pg.getByRole("button", { name: "Create account" }).click();
  await expect(pg).toHaveURL(/\/rooms\/join$/);
  await expect(pg.getByRole("heading", { name: "Join E2E Club?" })).toBeVisible();
  await pg.getByRole("button", { name: "Join room" }).click();
  await expect(pg).toHaveURL(new RegExp(`${roomPath}$`));

  // Everyone sees everyone.
  await po.goto(`${roomPath}?tab=settings`);
  const members = po.getByRole("list", { name: "Members" });
  for (const name of [`own_${suffix}`, `fri_${suffix}`, `gst_${suffix}`]) {
    await expect(members.getByText(name, { exact: true })).toBeVisible();
  }
  await po.emulateMedia({ colorScheme: "dark" });
  await expect(po.locator("html")).toHaveClass(/\bdark\b/);
  await expectNoSeriousAxe(po);
  await pf.goto(`${roomPath}?tab=settings`);
  await expect(pf.getByRole("list", { name: "Members" }).getByText(`own_${suffix}`, { exact: true })).toBeVisible();

  // The token never travelled in a URL or Referer, and is not in server HTML.
  expect(seen.filter((line) => line.includes(token))).toEqual([]);
  expect(await (await owner.request.get(`${roomPath}?tab=settings`)).text()).not.toContain(token);

  // Clean up.
  await po.getByRole("button", { name: "Delete room" }).click();
  await po.getByLabel(/to confirm/).fill("E2E Club");
  await po.getByRole("button", { name: "Delete room" }).last().click();
  await expect(po).toHaveURL(/\/rooms$/);

  await Promise.all([owner.close(), friend.close(), guest.close()]);
});
