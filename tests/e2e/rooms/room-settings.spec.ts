// Rooms v2 modules V2-2 + V2-4 (docs/specs/rooms-v2.md §2.3–§2.5, §4, §5,
// §6.3, §12; AC-V2-DEF-1/3/4, AC-V2-SEL-4): two browser contexts. The owner
// creates a team room with a description and a color, saves two presets and
// a weekly schedule in the Settings tab, sees the Next-session card and
// downloads the .ics; opens the lobby from it (preset + planned date, By
// rating). A friend joins: ratings visible, titles and problem ratings not.
// The host sees ratings, targets and chances, switches to By difficulty and
// back, then starts. Axe (whole page, 0 serious/critical), no horizontal
// scroll at 320–1440, reduced motion and a keyboard walk on the new
// controls. Users are *@example.test in the throwaway e2e database.
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "correct-horse-battery";
const WIDTHS = [320, 360, 390, 768, 1024, 1440];

async function register(context: BrowserContext, baseURL: string, username: string) {
  const res = await context.request.post("/api/auth/register", {
    data: { email: `${username}@example.test`, username, password: PASSWORD },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(201);
}

async function expectNoSeriousAxe(page: Page, label: string) {
  await page.waitForTimeout(400); // enter animations settle
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function expectNoOverflow(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw, `${label} at ${width}px`).toBeLessThanOrEqual(iw);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test("team room: presets, weekly schedule, Next session + .ics, rating lobby for host and member", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const suffix = Date.now().toString(36).slice(-6);
  const ownerName = `rso_${suffix}`;
  const friendName = `rsf_${suffix}`;
  const owner = await browser.newContext({ timezoneId: "Europe/Kyiv" });
  const friend = await browser.newContext({ timezoneId: "Europe/Kyiv" });
  await register(owner, baseURL!, ownerName);
  await register(friend, baseURL!, friendName);

  // --- Create a team room (description + color), keyboard on the swatches.
  const po = await owner.newPage();
  await po.goto("/rooms");
  await expect(po.getByRole("heading", { level: 1 })).toHaveText("Rooms");
  await expect(po.getByText("A room is your team: its own members, invite link, weekly sessions and history.")).toBeVisible();
  await po.getByRole("button", { name: "Create a team room" }).first().click();
  await po.getByLabel("Room name").fill("E2E Team Room");
  await po.getByLabel("Description (optional)").fill("Weekly practice with friends");
  await po.getByRole("radio", { name: "Cobalt" }).focus();
  await po.keyboard.press("ArrowRight");
  await expect(po.getByRole("radio", { name: "Green" })).toBeChecked();
  await expectNoSeriousAxe(po, "create dialog");
  await po.getByRole("button", { name: "Create room" }).click();
  await expect(po).toHaveURL(/\/rooms\/[0-9a-f-]{36}\?tab=members$/);
  const roomPath = new URL(po.url()).pathname;
  await expect(po.getByText("Weekly practice with friends · 1 member · team room")).toBeVisible();
  await po.getByRole("button", { name: "Create link" }).click();
  const link = await po.getByLabel("Link", { exact: true }).inputValue();

  const pf = await friend.newPage();
  await pf.goto(link);
  await pf.getByRole("button", { name: "Join room" }).click();
  await expect(pf).toHaveURL(new RegExp(`${roomPath}$`));

  // --- Settings: two presets and a weekly schedule.
  await po.goto(`${roomPath}?tab=settings`);
  const presets = po.getByTestId("presets-card");
  await expect(presets.getByTestId("preset-list").getByRole("listitem")).toHaveCount(1); // code default
  await presets.getByTestId("add-preset").click();
  let editor = po.getByTestId("preset-editor");
  await editor.getByLabel("Name").fill("Saturday");
  await editor.getByTestId("save-preset").click();
  await expect(presets.getByTestId("preset-Saturday")).toBeVisible();
  await presets.getByTestId("add-preset").click();
  editor = po.getByTestId("preset-editor");
  await editor.getByLabel("Name").fill("Short");
  await editor.getByRole("button", { name: "Fewer: Problems" }).click();
  await editor.getByRole("button", { name: "Fewer: Problems" }).click();
  await editor.getByRole("group", { name: "Duration" }).getByRole("button", { name: "45" }).click();
  await editor.getByRole("group", { name: "Challenge" }).getByRole("button", { name: /Relaxed/ }).click();
  await editor.getByRole("switch", { name: "Make it the room default" }).click();
  await editor.getByTestId("save-preset").click();
  await expect(presets.getByTestId("preset-Short")).toContainText("45 min · 2 problems · by rating · relaxed");
  await expect(presets.getByTestId("preset-Short")).toContainText("Default");
  // Validation message from the shared schema.
  await presets.getByTestId("add-preset").click();
  await po.getByTestId("preset-editor").getByTestId("save-preset").click();
  await expect(po.getByTestId("preset-editor").getByText("Name the preset")).toBeVisible();
  await po.keyboard.press("Escape");

  const schedule = po.getByTestId("schedule-card");
  await schedule.getByTestId("schedule-enabled").click();
  await schedule.getByTestId("schedule-weekday").selectOption("6");
  await schedule.getByTestId("schedule-time").fill("18:00");
  await schedule.getByTestId("schedule-zone").selectOption("Europe/Kyiv");
  const saturdayId = await schedule.getByTestId("schedule-preset").locator("option", { hasText: "Saturday ·" }).getAttribute("value");
  await schedule.getByTestId("schedule-preset").selectOption(saturdayId!);
  await schedule.getByTestId("save-schedule").click();
  await expect(schedule.getByText("No unsaved changes")).toBeVisible();
  await expectNoSeriousAxe(po, "settings (owner)");
  await expectNoOverflow(po, "settings (owner)");

  // --- Room page: Next session card + .ics.
  await po.goto(roomPath);
  const next = po.getByTestId("next-session-card");
  await expect(next).toContainText("every Saturday");
  await expect(next.getByTestId("next-session-when")).toContainText(/^Sat, [A-Z][a-z]{2} \d{1,2} · 18:00$/);
  await expect(next).toContainText("Europe/Kyiv · preset “Saturday”: 90 min · 4 problems · by rating · balanced");
  await expect(next).toContainText("It never starts by itself.");
  await expect(po.getByTestId("attendance-card")).toBeVisible();
  const [download] = await Promise.all([po.waitForEvent("download"), next.getByTestId("add-to-calendar").click()]);
  expect(download.suggestedFilename()).toBe("e2e-team-room.ics");
  const ics = await readFile((await download.path())!, "utf8");
  expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=SA");
  expect(ics).toMatch(/DTSTART;TZID=Europe\/Kyiv:\d{8}T180000/);
  expect(ics).toContain("SUMMARY:E2E Team Room");
  expect(ics).not.toContain(friendName);
  expect(ics).not.toContain(ownerName);
  await expectNoSeriousAxe(po, "room page");
  await expectNoOverflow(po, "room page");

  // The member sees the settings read-only and the card without Edit schedule.
  await pf.goto(`${roomPath}?tab=settings`);
  await expect(pf.getByTestId("schedule-card")).toContainText("Saturdays at 18:00 (Europe/Kyiv) · preset “Saturday”");
  await expect(pf.getByTestId("add-preset")).toHaveCount(0);
  await expectNoSeriousAxe(pf, "settings (member)");
  await pf.goto(roomPath);
  await expect(pf.getByRole("link", { name: "Edit schedule" })).toHaveCount(0);
  const memberIcs = await friend.request.get(`/api${roomPath}/schedule.ics`);
  expect(memberIcs.status()).toBe(200);
  expect(memberIcs.headers()["content-type"]).toBe("text/calendar; charset=utf-8");

  // Rooms list: Next row and the live-first order are covered in integration; here the card shows Next.
  await po.goto("/rooms");
  await expect(po.getByTestId("room-card-next")).toContainText("18:00");
  await expectNoSeriousAxe(po, "rooms list");
  await expectNoOverflow(po, "rooms list");

  // --- Open the lobby from the Next card: preset "Saturday" (4, rating) and the planned date.
  await po.goto(roomPath);
  await po.getByTestId("open-scheduled-lobby").click();
  await expect(po).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  const sessionPath = new URL(po.url()).pathname;
  await expect(po.getByTestId("slot-4")).toBeVisible();
  await expect(po.getByTestId("preset-tile-Saturday")).toHaveAttribute("aria-checked", "true");
  await expect(po.getByRole("group", { name: "Pick problems" }).getByRole("button", { name: "By rating" })).toHaveAttribute("aria-pressed", "true");

  // Friend joins; sees chances and ratings of people, no titles or problem ratings.
  await pf.goto(sessionPath);
  await pf.getByTestId("join-session").click();
  await expect(pf.getByText("You're in")).toBeVisible();
  await expect(pf.getByText("Titles are revealed when the session starts.")).toBeVisible();
  await expect(pf.getByTestId("slot-chance-1")).toContainText(/~\d+% of this room should solve it/);
  await expect(pf.getByTestId("slot-rating-1")).toHaveCount(0);
  await expect(pf.getByTestId("slot-1")).not.toContainText("target");
  await expect(pf.getByTestId(`lobby-rating-${ownerName}`)).toHaveText(/rating \d{3,4}\?/);
  await expect(pf.getByTestId(`lobby-rating-${friendName}`)).toBeVisible();
  await expectNoSeriousAxe(pf, "lobby (member)");

  // Host: ratings, targets, chances and the expectation panel (after the join poll).
  await expect(po.getByTestId("lobby-participants").getByText(friendName)).toBeVisible({ timeout: 10_000 });
  await po.reload();
  await expect(po.getByTestId("slot-rating-1")).toHaveText(/^rating \d{3,4}$/);
  await expect(po.getByTestId("slot-1")).toContainText(/target \d{3,4} \([+−±]\d+\)/);
  await expect(po.getByTestId("slot-chance-1")).toContainText("of this room should solve it");
  await expect(po.getByTestId("lobby-expected")).toContainText(/Expected: about \d\.\d of 4 solved per person/);
  await expect(po.getByTestId(`lobby-rating-${friendName}`)).toBeVisible();
  await po.getByText("How are problems picked by rating?").click();
  await expect(po.getByTestId("rating-explainer")).toContainText(/Targets here: \d+ · \d+ · \d+ · \d+\./);
  await expectNoSeriousAxe(po, "lobby (host, by rating)");
  await expectNoOverflow(po, "lobby (host, by rating)");

  // Keyboard: arrow keys move the mode switch; By difficulty brings the v1 calibration panel.
  await po.getByRole("group", { name: "Pick problems" }).getByRole("button", { name: "By rating" }).focus();
  await po.keyboard.press("ArrowRight");
  await expect(po.getByRole("group", { name: "Pick problems" }).getByRole("button", { name: "By difficulty" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await po.getByTestId("apply-settings").click();
  await expect(po.getByTestId("calibration-panel")).toBeVisible();
  await expect(po.getByTestId("slot-rating-1")).toHaveCount(0);
  await expect(po.getByTestId("preset-tile-Saturday")).toHaveAttribute("aria-checked", "false");
  await expectNoSeriousAxe(po, "lobby (host, by difficulty)");

  // I'll pick them: no draw, Start waits for pins, Re-roll all is disabled with a hint.
  await po.getByRole("group", { name: "Pick problems" }).getByRole("button", { name: "I'll pick them" }).click();
  await po.getByTestId("apply-settings").click();
  await expect(po.getByTestId("start-blocked")).toHaveText("Pick 4 more problems with Pin to start.");
  await expect(po.getByRole("button", { name: "Re-roll all" })).toBeDisabled();
  await expect(po.getByTestId("start-session")).toBeDisabled();

  // Back to a preset tile and Start.
  await po.getByTestId("preset-tile-Short").click();
  await po.getByTestId("apply-settings").click();
  await expect(po.getByTestId("slot-2")).toBeVisible();
  await expect(po.getByTestId("slot-3")).toHaveCount(0);
  await po.getByTestId("start-session").click();
  await po.getByTestId("confirm-start").click();
  await expect(po.getByTestId("problem-list")).toBeVisible({ timeout: 10_000 });
  await expect(pf.getByTestId("problem-list")).toBeVisible({ timeout: 10_000 });

  await owner.close();
  await friend.close();
});

test("reduced motion: room page, settings and lobby render without running animations", async ({ browser, baseURL }) => {
  const name = `rsm_${Date.now().toString(36).slice(-6)}`;
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await register(context, baseURL!, name);
  const headers = { Origin: baseURL! };
  const room = await context.request.post("/api/rooms", { data: { name: "Calm Room", description: "Quiet", color: 4 }, headers });
  const { id } = (await room.json()) as { id: string };
  await context.request.post(`/api/rooms/${id}/schedule`, {
    data: { schedule: { weekday: 3, time: "12:30", timeZone: "UTC", presetId: null } },
    headers,
  });
  const page = await context.newPage();
  for (const path of [`/rooms/${id}`, `/rooms/${id}?tab=settings`, "/rooms"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const running = await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming().iterations ?? 1) !== Infinity).length,
    );
    expect(running, path).toBe(0);
  }
  await page.getByTestId("room-card").first().waitFor();
  await page.goto(`/rooms/${id}`);
  await page.getByTestId("open-scheduled-lobby").click();
  await expect(page.getByTestId("slot-list")).toBeVisible();
  await expect(page.getByTestId("lobby-expected")).toBeVisible();
  await context.request.post(`/api/rooms/${id}/delete`, { data: { confirmName: "Calm Room" }, headers });
  await context.close();
});
