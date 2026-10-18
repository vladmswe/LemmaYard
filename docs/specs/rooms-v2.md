# F6 v2. Rooms: per-problem scoreboard, room defaults and schedule, rating-based selection, live attempts

Date: 2026-10-18. Status: design for owner review. Builds on `docs/specs/rooms.md` (F6 v1, as built on `integration`).
Mockups: `/private/tmp/claude-501/-Users-vladm-development-pet-projects-lemmayard/027e3e34-4b87-4bbf-8325-4319a54e879f/scratchpad/rooms-v2/mockups/`
(contact sheet `contact-sheet.png`). Every name, time and rating in them is example data.

## 0. Owner summary

**What changes**
1. Scoreboard and results become a **person × problem matrix**. Each cell shows solved / judging now / tried / not started.
   A solved cell shows the time from the session start (`24:30`), the split since that person's previous solve
   (`+18:20`, which is roughly the time spent on this problem), wrong attempts and a ★ First mark. The matrix works for
   1–8 problems: wide cells with a time track for N = 1–2, standard cells for N = 3–5, compact cells for N = 6–8,
   and per-person cards on mobile.
2. The unclear bottom "dashboard" (Leaderboard tab → "Room difficulty profile") is **removed** from the room page. Its
   numbers move into the lobby, behind "How is the mix chosen?". The member timeline's one-bar "Progress over time"
   chart is removed too. The room tabs become **Sessions** (a mini-matrix per past session: who solved what, at which
   minute) · **Members** (rating, attendance, solved, first solves, wins, history link) · **Settings**.
3. **Room defaults and presets** ("Saturday · 90 min · 4 problems · by rating · balanced") are saved once per room. An
   optional **weekly schedule** ("every Saturday 18:00, Europe/Kyiv") shows a **Next session** card on the room page
   and on the rooms list. Nothing starts by itself.
4. **Rating-based selection** (new mode "By rating"). LemmaYard keeps its own rating for every person and every problem
   (Elo-style). It picks problems so the people in the lobby solve the share you choose (Relaxed 75 % / Balanced 55 % /
   Tough 35 %). "By difficulty" stays as the alternative mode. **Selection today does not use ratings.** It uses each
   difficulty's solve rate from the room's last 6 sessions. We cannot use LeetCode data: scraping breaks their terms,
   and our problems are original. A self-reported LeetCode contest rating can be entered once, and it is only the
   starting point.
5. **Live attempts.** "Judging…" appears in a cell while a submission is queued or running. Failed attempts are counted
   live, and the failed-attempt notification is now **on** by default (each person can still mute it). Polling speeds
   up to 1.5 s only while somebody's submission is being judged. Limit: live scoring needs a judge worker host. The
   judge still does not run on Vercel.
6. **Teams: no rewrite.** A room already *is* a private team, with its own members, invite link, sessions and history.
   Other teams create their own rooms. We only add: a description and a color, the schedule and Next-session card,
   attendance ("7 of last 8") and the copy "Create a team room".

**What does not change:** invite links, roles, the one-open-session rule, scoring (solved, then time + 5 min per wrong
attempt before the solve), the `finalize()` hook, the event types and cursor polling, solution sharing, privacy.

**Decisions needed** (§19): D1 default selection mode for new rooms (recommend *By rating*); D2 one global rating per
person vs. per room (recommend *global*); D3 who sees rating numbers (recommend *all room members*).

---

## 1. The six feedback items: today vs. v2

| # | Owner said | What exists today (verified in code/screenshots) | What changes in v2 |
|---|---|---|---|
| 1 | "Usually 4 problems, sometimes 5, 2 or 1" | Backend supports 1–8 (`problem_count` CHECK, stepper 1–8). The UI is laid out for 4: problem cards in a 3-wide grid above the table, fixed table columns; with 1 problem the table is mostly empty, with 8 cells overflow. | Matrix layout rules per N (§3.1); problem cards are folded into the matrix column headers (title, difficulty, Open); history cards and results adapt the same way; mockups for N = 1, 2, 4, 5. |
| 2 | "Which problem each person solved; time from start; the dashboard at the bottom is unclear" | The live table does have per-problem cells (`✓ 0:11 −1`), but the framing everywhere else is "solved N of total": the leaderboard "2/4", the sessions list "0/4, rank 2", the banner "You 1/4 · Leader 2/4", the mobile "2 solved ▪▪▫▫". There is no split, failed attempts look like untouched cells unless the opt-in is on, and nothing shows a submission being judged. The bottom "dashboard" = **Leaderboard tab → "Room difficulty profile, last 6 sessions"** (screenshot `f-1440-dark-24c`), i.e. the calibration numbers, which are useful to the selection algorithm but not to people. The member timeline also has a one-bar "Progress over time" chart (`24f`). | Matrix everywhere (§3), split and wrong-attempt counts, "Judging…" cells, First mark, a results **Timeline** lane chart with each solve at its minute. The difficulty profile is removed from the room page. "N of total" is replaced by per-problem chips (`1✓ 2✗ 3✓ 4·`). |
| 3 | "Set the concrete session: time, which problems, how many, difficulty" | Lobby settings exist: count stepper, duration select, topics, Suggested/Custom mix, challenge, avoid-solved, optional "Planned for". They reset to code defaults (4 / 90 / Any / Suggested / Balanced) for every new session. | Room **defaults** + up to 5 **presets** (§4), a **weekly schedule** (§5) with a Next-session card, a third pick mode "I'll pick them" (all slots pinned via search), "Rated session" switch, "Save as room default". |
| 4 | "Select by contest rating like the LeetCode extension; maybe you already do it" | **Not done.** Selection = per-difficulty solve rate of the room's last K = 6 sessions, smoothed with priors (rooms.md §2.2–2.3). There are no ratings anywhere. | Rating model (§6), "By rating" selection (§7), problem cards with "rating 1500 · solved by 58 % of 31 rated attempts · avg rating of solvers 1560", rating change on results. LeetCode data is not used (§6.7). |
| 5 | "Updates about solved / not solved should arrive automatically" | Adaptive polling (`event-source.ts`): lobby 5 s, live 3 s (hidden tab 10 s), backoff 3→6→12→30 s. There is an immediate refresh when your own submit finishes (`OWN_SUBMIT_FINAL_EVENT`), on visibility and on online. Events are `problem_solved` and `attempt_failed` (always stored). Toasting failed attempts is opt-in (`showAttempts: false`). | `pending` cells in every state response (§9.1), 1.5 s polling while anything is judging, failed attempts default **on** (prefs key v2), and Supabase "poke" kept as the v2 transport. |
| 6 | "A room per team; other friends meet on Saturdays in their own private room; rewrite?" | Already the model: `rooms` + `room_members` (owner/member), invite link per room, sessions, history and leaderboard per room. Different rooms share nothing. One user can be in up to 20 rooms. | **No rewrite.** Add description, color, schedule, next session, attendance/streak, and the copy "team room" (§10). |

---

## 2. Screens that change (UX)

Mockups (1440 and 390 each): `live.html?n=1|2|4|5`, `results.html?n=1|2|4|5`, `lobby.html`, `room.html`
(`?tab=members`), `rooms-list.html`. PNGs are named `<page>-<1440|390>.png`.

### 2.1 Live session (`/rooms/[roomId]/sessions/[sessionId]`, live)
- The night hero stays (room name, timer, track, End session). Under the timer: "left · 52:10 elapsed of 1:30:00".
- **The matrix spans the full width** and replaces the problem cards grid. Column header = `[n] [Difficulty]` + title
  (ellipsis + `title` tooltip) + "3 solved · 1 judging" + **Open →** (`/problems/<slug>?session=<id>`).
- Rows: rank, avatar, name, "you", rating chip (if ratings are shown, D3), "2 wrong attempts". Last column: solved
  count (big) + total time.
- Below the matrix: legend (one line) + **Activity** (failed attempts visible, "judging…" lines are client-only and
  never stored) + **Notifications** card (switches, help text).
- "You: 1✓ 2✗ 3✓ 4·" replaces "You 1/4 · Leader 2/4" (sticky bar on mobile and the problem-page banner).
- Mobile: sticky bar `37:50 left · You 1✓ 2✗ 3✓ 4·`; the problem legend (P1…Pn, difficulty, title, Open) on top;
  then one card per person with a grid of cells (min 72 px, so N = 4 fits one row and N = 5–8 wrap). Tabs
  Problems | Scoreboard | Activity remain as today for < lg; the problem legend replaces the Problems tab content.

### 2.2 Results (`/rooms/[roomId]/sessions/[sessionId]/results`)
- Head "Results · Sat, Oct 24", sub "18:00–19:30 · 4 problems · 90 min · 4 participants · rated session".
- Four fact tiles: Winner, First solves, Fastest solve, Your session (solved, rank, rating Δ).
- The final matrix with ★ First, "seen" (= solved before the session), median per problem (N ≤ 4), **code** link per
  solved cell (when sharing allows, unchanged rules).
- **Timeline**: one lane per person, from 0 to the duration, with a numbered square at each solve. It shows the rhythm
  of the evening ("carol solved 3 at 1:29:50"). It replaces the old "Progress over time" chart, with an sr-only table
  equivalent.
- **Problems** card: rating before → after (e.g. `1620 → 1625`), solved by k of n, first, median.
- **Rating change** table: Solved chips, Expected, Got, Before, Change (+ green / − red, always with a sign and the
  new value, never color alone). With N < 4 the help says "the change is scaled down (N of 4)".
- "Session details" and "Your preferences" (share-solutions switch) cards from v1 stay below (not in the mockup).

### 2.3 Lobby (session settings)
- **Setup** card, top to bottom: Preset tiles (room default first, "+ Save current as preset") → Problems stepper with
  "about 22 min per problem" (= duration / N, rounded) → Duration segmented 45/60/90/120/Other… (Other = existing
  15–240 step 5) → **Pick problems**: `By rating | By difficulty | I'll pick them` → **Challenge** with the target
  in the button (Relaxed 75 % · Balanced 55 % · Tough 35 % for rating; for difficulty mode the existing 65/50/35 %) →
  Topics chips → Avoid solved → **Rated session** → Apply and draw. "Save as room default" (owner) at the top right.
- **Problems** list: one card per slot, ordered warm-up → stretch, with rating, target and deviation
  ("target 1407 (+13)"), **room solve chance** bar, "Solved by 58 % of 31 rated attempts · Avg rating of solvers 1560"
  or "Not enough rated attempts yet (6 of 10): rating is the author's estimate", plus Re-roll / Pin.
- Right rail: participants with rating and *their* expected solves ("2.4 of 4"), the room expectation ("about 2.2 of 4
  solved per person (54 %; target 55 %)"), Start, Cancel, and the "How are problems picked by rating?" disclosure
  with the formula and the computed targets.
- "By difficulty" mode shows the v1 calibration panel in place of the rating stats: suggested mix, the table, and
  "How is this calculated?". This is now the *only* place the difficulty profile appears.
- Non-hosts see the same cards without titles, ratings stay hidden too (a rating narrows the problem down a lot).
  They see difficulty, tags and "room solve chance".

### 2.4 Room page
- Head: color tile with the initial, name, description, "4 members · team room".
- **Next session** card (night block) when a schedule exists: "Sat, Oct 24 · 18:00", "in 2 days · Europe/Kyiv · preset
  Saturday: 90 min · 4 problems · by rating · balanced", buttons **Open lobby** (creates the lobby with the preset and
  `planned_for` = that occurrence), **Edit schedule**, **Add to calendar** (`.ics` download, weekly RRULE). Without a
  schedule: today's "No session open" card + "Set a weekly schedule". Lobby/live open → the existing open-session card
  takes this place.
- **Attendance** card: last 8 finished sessions as squares per member (filled = played, hollow = missed, a dash before
  they joined), "7 of last 8 · streak 5" / "2 of 2 since joining", rating with the last change.
- Tabs **Sessions · Members · Settings** (`?tab=`; old `?tab=leaderboard` redirects to `members`).
  - Sessions: one card per finished session with the mini-matrix (person × problem, `✓ 24:30 ★`, `✗ 2`, `—`; on
    mobile minutes `25′`), solved count and rank, "Results →". Pagination as today (20 per page).
  - Members: Member, Rating (+Δ), Attended (last 8), Solved (period select as before: 4 weeks / 3 months / all),
    First solves, Wins, **History →** (member timeline, without its progress chart). Invite link, leave, owner
    actions move to Settings.
  - Settings: name, description, color, defaults & presets, schedule, sharing, invite link, danger zone.

### 2.5 Rooms list
- Copy: H1 "Rooms", sub "A room is your team: its own members, invite link, weekly sessions and history. Other teams
  never see it.", button **Create a team room**.
- Card: color tile, name, description, avatars, role; footer rows **Next** ("Sat, Oct 24 · 18:00 · in 2 days" / "No
  schedule · set one"), **Last** ("Oct 17 · winner alice · you #2"), **You** ("played 7 of last 8 · rating 1540"). A
  live room's card turns night with "Live now 23:20 left" and **Open session**. Sort: live → next session soonest →
  last activity.

---

## 3. Matrix rules

### 3.1 Layout by N (desktop ≥ 761 px, container 1216 px)

| N | Name col | Cell | Cell content | Header |
|---|---|---|---|---|
| 1 | 300 px | rest (≈ 760 px) | time, ★ First, wrong, and a full-width **time track** with a tick at the solve minute; axis 0 · ¼ · ½ · ¾ · end under the header | title + Open, axis |
| 2 | 260 px | ≈ 420 px | same as N = 1 | same |
| 3–4 | 230 px | 200–280 px | `✓ 24:30 ★ First` / `+18:20 1 wrong code` / thin track | title, "3 solved · 1 judging", Open |
| 5 | 210 px | ≈ 165 px | ★ without the word, "first solve" hidden | rating moves into the meta line, no median |
| 6–8 | 200 px | 105–130 px (`.compact`) | `✓ 24:30` / `+18:20 1w`, no track | number + difficulty + truncated title; full title in the tooltip and in the Problems card |

Below 761 px: per-person cards with `grid-template-columns: repeat(auto-fill, minmax(72px, 1fr))` (N = 1 → one wide cell,
N = 2 → two), each cell `P3 / ✓ 40:00 ★ / +36:00 1w`. The table stays a real `<table>` on desktop. Mobile cards use
`<ul>` with sr-only sentences.

### 3.2 Cell states and data

| State | Condition (from snapshot + `pending`) | Visual | sr-only text |
|---|---|---|---|
| Solved | `solveSeconds != null` | success tint, `✓ mm:ss` (h:mm:ss ≥ 1 h), `+split`, `n wrong`, `★ First`, `seen` (finished) | "Problem 2: solved 24 minutes 30 seconds after the start, 18 minutes 20 seconds after their previous solve, after 1 wrong attempt, first to solve it" |
| Judging | a queued/running session submit exists for (user, position) | info tint + ring, spinner (static under reduced motion), "Judging… attempt k" (k = attempts + 1) | "Problem 3: a submission is being judged" |
| Tried | `attempts > 0`, not solved, nothing pending | dashed border, `✗ 2 tries` in danger | "Problem 2: 2 attempts, not solved yet" |
| Not started | otherwise | `—` faint | "Problem 4: not attempted" |

**Split** = `solveSeconds − previous solveSeconds` of the same person, sorted by solve time. For the person's first
solve the split equals the time, so it is hidden ("first solve" in wide cells). The split is a proxy: people may work
on two problems in parallel. Copy: tooltip "Time since this person's previous solve". Legend "≈ time spent on this
one". It is computed client-side in `live-view.ts` from existing fields, so no API change is needed.

**Totals column**: solved count + total time (unchanged scoring). Row meta: "2 wrong attempts" (counted wrong attempts
on all problems, solved or not) and on results "last solve 51:00".

**Problem header**: "k solved" (k persons), "· j judging" (N < 5), on results "· median 35:00" (N ≤ 4).

---

## 4. Room defaults and presets

- `rooms.defaults` (jsonb): the settings a new session starts with. `rooms.presets` (jsonb array, ≤ 5): named
  settings. The first preset is the default unless `defaults.presetId` points elsewhere.
- Shape (Zod `roomSessionTemplateSchema`, strict):

```ts
type SessionTemplate = {
  id: string;                 // nanoid(8), stable for schedule references
  name: string;               // 1–30 chars, e.g. "Saturday"
  problemCount: number;       // 1..8
  durationMin: number;        // 15..240, step 5
  mode: "rating" | "difficulty" | "manual";
  challenge: "relaxed" | "balanced" | "tough";
  tags: string[];             // 0..5 known tag slugs
  mix?: { easy: number; medium: number; hard: number }; // difficulty mode with custom mix only
  avoidSolved: boolean;
  rated: boolean;
};
```

- Seeding: existing rooms get `presets = [{id, name: "Default", 4, 90, mode: D1 answer, "balanced", [], avoidSolved:
  true, rated: true}]` lazily on first read (no data migration needed; `NULL` = code defaults).
- UX: preset tiles in the lobby. Changing any field shows "Custom" (tiles unselected). The owner's "Save as room
  default" and anyone's "+ Save current as preset" open a small dialog (name). Only the owner can edit or delete presets
  (Settings tab). Members can save a new one only if fewer than 5 exist. **Recommendation:** presets are owner-only too,
  to keep the list clean. This is not a blocker.
- `POST /api/rooms/:roomId/sessions` body may carry `presetId` instead of fields. Explicit fields override the preset.

## 5. Weekly schedule and the Next-session card

- `rooms.schedule` (jsonb, nullable): `{ weekday: 0..6 (0 = Sunday), time: "HH:MM", timeZone: IANA (validated by
  Intl.supportedValuesOf('timeZone')), presetId: string | null }`. One weekly slot (v2.1 may allow 2).
- **Next occurrence** is computed on read (pure `nextOccurrence(schedule, now)` in `src/lib/rooms/schedule.ts`,
  DST-safe through `Intl.DateTimeFormat` wall-clock math; tests around the March/October changes in Europe/Kyiv).
  No cron, no rows, no auto-start. If a lobby/live session is open, the card shows that session instead.
- A session counts as "this week's" when its `planned_for` equals the occurrence. **Open lobby** sends
  `{ presetId, plannedFor: occurrence }`. After that session finishes, the card moves on to the next week.
- **Add to calendar**: `GET /api/rooms/:roomId/schedule.ics` (member only): `VEVENT` with `RRULE:FREQ=WEEKLY;BYDAY=SA`,
  `DTSTART;TZID=…`, duration of the preset, `URL` to the room page. There is no invite token and no member list in
  the file.
- Owner sets it in Settings → "Weekly schedule": Switch, Weekday select, time input (24 h), timezone (default = the
  owner's browser zone), preset select. Copy: "Shows the next session on the room page. It never starts by itself."
- Reminders (email/push) are explicitly out of scope.

---

## 6. Rating model

### 6.1 Core idea in one paragraph
Every person and every problem has a number on the same scale. Each (participant, problem) pair in a rated session
is a match: solved = the person wins, not solved = the problem wins. That is the Elo logistic model that LeetCode-style
problem ratings are also based on: *a problem's rating is the rating at which a person solves it with probability ½
within contest-like time* (≈ 20–25 min per problem; our default 90 min / 4 problems equals a LeetCode weekly contest).

### 6.2 Formulas

```
P(solve | person R_u, problem R_p) = 1 / (1 + 10^((R_p − R_u) / 400))

After a rated session with N problems, for each active participant u:
  E_u   = Σ_j P(R_u, R_pj)                          expected solves
  S_u   = Σ_j s_uj   (s = 1 if solved in the session, else 0)
  k_u   = K_u / max(N, 4)        K_u = 160 while provisional (< 8 rated pairs), else 96
  ΔR_u  = round(k_u · (S_u − E_u))                  so |ΔR_u| ≤ 96 per session (≤ 160 provisional)

For each problem p in the session (slow drift, anchored to the author's value):
  ΔA_p  = −4 · Σ_u (s_up − P(R_u, R_p))             per session, all active participants
  adjust_p = clamp(adjust_p + ΔA_p, −200, +200)      R_p = author_rating + adjust_p
```

- **Active participant** = same definition as v1 calibration: at least one judged session submit (not
  `internal_error`). People who joined and never submitted are not rated, so lurking does not cost points.
- `compile_error` is not a "pair outcome" (as in scoring). A pair counts if the problem was in the session and the
  person was active. Not touching a problem is a loss, as in a contest.
- All P and Δ use **ratings at session start** (snapshot columns), not values that change while the update runs.
- Practice submissions (no session) **do not change ratings**: there is no time box and no failure signal, so they
  would only push ratings up. They are used once, for the starting rating (§6.4).
- Rated sessions only: `room_sessions.rated` (default from the preset, default true). The switch is off by default when
  `durationMin / N < 10` (help: "Very short sessions are unrated by default"). Hosts can turn it off for warm-ups.

### 6.3 Selection by rating (target success probability)
- Inputs: expected participants E (same rule as v1: lobby joiners if ≥ 2, else all members), their ratings R_u, N,
  τ (Relaxed 0.75, Balanced 0.55, Tough 0.35), pool after topic filter, tiers A/B/C (v1 §2.4), pinned slots.
- **Ladder**: a session should go warm-up → stretch, so slot targets are spread around a center c:
  `offset_i = w · ((i − 1)/(N − 1) − ½)` with `w = min(400, 100·(N − 1))` (N = 1 → 0; N = 2 → ±50; N = 4 → ±150;
  N ≥ 5 → ±200), widened to `w = min(800, max(w, R_max − R_min))` when the room's ratings are spread out (§6.6).
- **Center**: closed form for intuition `c₀ = R̄ + 400·log10(1/τ − 1)` (τ 0.75 → −191, 0.55 → −35, 0.35 → +108).
  The algorithm then refines c by bisection (60 steps, [800, 3000]) so that
  `mean over u ∈ E, i ∈ slots of P(R_u, c + offset_i) = τ`. Averaging over people (not over R̄) is correct for mixed
  rooms. Pinned slots enter the mean with their real rating, and only the free slots get targets.
- **Pick per slot** (in target order, lowest first, so Problem 1 is the warm-up):
  for tier T in A, B, C: for band b in 100, 200, 300: candidates = pool ∩ tier T ∩ |R_p − target| ≤ b, minus used,
  pinned and re-rolled problems → if non-empty, pick uniformly at random (B ordered by solver count first, C by oldest
  use, as in v1). If nothing within 300 → take the closest rating in any tier and show "Closest available: 1680
  (target 1850)". Re-roll = same procedure, excluding re-rolled problems.
- **Shown**: per slot "rating, target (±Δ), room solve chance = mean_u P(R_u, R_p)". Per person "expected x.x of N".
  Room "about X of N per person (Y %; target Z %)". The realized Y can differ from τ because a 20-problem catalog is
  coarse; the UI says so in the disclosure when |Y − τ| > 8 points: "The catalog has few problems near these targets."

### 6.4 Starting ratings (cold start)
Order of precedence for a person's **first** rating (provisional until 8 rated pairs):
1. Self-reported LeetCode contest rating (profile field, optional): `start = clamp(lc, 1000, 2600)`. Our scale is
   built to read like LeetCode's (new LC accounts start at 1500, a typical medium is ~1500–1900), so no conversion.
   It is honest about being a guess: label "self-reported, used once as your starting point".
2. Else, if the person has ≥ 3 accepted practice submits: `start = clamp(mean of the 3 highest-rated solved
   problems − 100, 1000, 1800)`.
3. Else **1500**.
A provisional rating is shown with a "?" and the copy "Provisional: moves faster for the first two sessions".
Problems without a `rating` in `meta.json` use the band default: easy 1200, medium 1600, hard 2000.
Nothing breaks with zero history: on day 1 the room has 1500s and author ratings, and selection works.

### 6.5 Worked examples (numbers from `kit.js`, reproducible)

**A. Selection, N = 4, Balanced (τ = 0.55).** Lobby: alice 1620, bob 1540, carol 1450, dan 1380 (provisional).
R̄ = 1497.5 → c₀ = 1497.5 − 34.9 = 1462.6. Bisection → c = 1457 → targets **1307 · 1407 · 1507 · 1607**.
Picks (all tier A, within ±100): Best Time to Buy and Sell Stock 1330 (+23), Maximum Subarray 1420 (+13), House Robber 1500
(−7), Longest Substring Without Repeating Characters 1620 (+13).

| | 1330 | 1420 | 1500 | 1620 | Expected |
|---|---|---|---|---|---|
| alice 1620 | 0.841 | 0.760 | 0.666 | 0.500 | **2.77** |
| bob 1540 | 0.770 | 0.666 | 0.557 | 0.387 | **2.38** |
| carol 1450 | 0.666 | 0.543 | 0.429 | 0.273 | **1.91** |
| dan 1380 | 0.571 | 0.443 | 0.334 | 0.201 | **1.55** |

Room: 2.15 of 4 = **54 %** (target 55 %). The lobby shows "Expected: about 2.2 of 4 solved per person".

**B. Rating update after that session.** Solved: alice, bob, carol → problems 1–3; dan → problem 1 only.
k = 96/4 = 24 (dan provisional: 160/4 = 40).
alice: 24 · (3 − 2.77) = **+6**; bob: 24 · (3 − 2.38) = **+15**; carol: 24 · (3 − 1.91) = **+26**;
dan: 40 · (1 − 1.55) = **−22**.
Problems: Σ(s − P) = 1.151, 0.588, 1.014, −1.361 → adjust −4.6, −2.4, −4.1, +5.4 →
1330 → **1325**, 1420 → **1418**, 1500 → **1496**, 1620 → **1625**. Problems drift slowly, people quickly.
These are the numbers in `mockups/results-n4-*.png`.

**C. One-problem session (N = 1, Coin Change 1680).** k = 96/4 = 24, so a single problem moves a person at most 24 points
(40 provisional). alice solves: 24 · (1 − 0.415) = **+14**; bob +17; carol +19; dan (provisional) misses:
40 · (0 − 0.151) = **−6**. Coin Change: Σ(s − P) = 1.916 → −7.7 → **1672**.
Selection for N = 1, Balanced, same lobby: target = c = **1500** (offset 0) → House Robber (1500).

**D. Huge spread.** Ratings 1250 / 1500 / 1900, N = 4, Balanced. Default w = 300 gives targets 1334–1634: the 1900 player
expects ~3.6 of 4, the 1250 player ~0.9. Widened w = min(800, 650) = 650 gives targets **1159 · 1376 · 1592 · 1809**
(c = 1484): everyone has a problem near their level, the mean stays at 55 %. The lobby says "Ratings here span
1250–1900, so the problems span wider."

### 6.6 Edge cases

| Case | Rule |
|---|---|
| New member / no history | Starts provisional (§6.4), K = 160 until 8 rated pairs (= two 4-problem sessions). |
| Unrated user joins live | Their start rating is snapshotted at join time (participant row). |
| Huge spread | Ladder widening (§6.5 D). Expected solves are shown per person so the host sees the spread. |
| 1–3 problem sessions | k = K / 4 caps the swing (§6.5 C). The ladder collapses (N = 1: single target). |
| 1 active participant | Still rated (the match is person vs. problem). |
| Session with pending judging at the end | Ratings are applied once the session is finished **and** nothing is pending (or 30 min after the end, whichever first); idempotent via `rated_at`. |
| Problem unpublished later | Keeps its rating. Historic snapshots stay. |
| Author changes `rating` in meta.json | The import updates `author_rating`. `adjust` stays, so R_p moves by the same amount. |
| Pin in rating mode | Allowed. The pinned rating enters the mean. If a pin makes τ unreachable, the panel shows the realized %. |
| "Solved before" (seen) | Still a normal pair. v2 does not discount it; friends trust each other. Recheck after 10 sessions. |
| Rating inflation | Mild: problems absorb only 4/24 of each surprise, so a group that improves rises (intended). If the author ratings are systematically high, everyone rises; the slow `adjust` corrects this (±200 cap). |

### 6.7 What we cannot do (honest)
- No LeetCode contest ratings of anyone: there is no public API and scraping breaks LeetCode's terms. The only bridge
  is the optional self-reported number. Update (owner decision, 2026-10-18, `leetcode-integration.md`): LeetCode
  *problems* in rooms may carry the community contest ratings of the MIT zerotrac dataset, committed offline; they
  are used to pick LeetCode problems and are shown, never to change anyone's Elo.
- With 20 problems (3 hard), "By rating" cannot always hit targets above ~1700 or below ~1100. The UI shows the
  closest problem and says so.

### 6.8 Anti-gaming, privacy
- Anti-gaming: none (trust). Not submitting keeps you unrated for that session. This is visible in results ("not
  rated: no submissions").
- Privacy: an internal rating is shown only to members of a room you share (lobby, results, Members tab). The public
  profile `/u/[username]` shows it only if the person turns on "Show my rating on my public profile" (default **off**).
  The self-reported LeetCode rating is **never** shown to others (only "starting point: self-reported"). Problem stats
  ("solved by 58 % of 31 rated attempts · avg rating of solvers 1560") are aggregates over all rated sessions on
  LemmaYard, shown only when n ≥ 10 pairs from ≥ 3 distinct people, rounded to whole % and to 10 rating points.

---

## 7. Selection: how the modes compose
- `settings.mode`: `"difficulty"` (v1 algorithm, unchanged: calibration K = 6, priors, λ, tiers), `"rating"` (§6.3),
  `"manual"` (no draw. Every slot starts empty "Pick a problem", the pin dialog fills it; Start requires N filled).
- Shared parts: pool and topic filter, tiers A/B/C, re-roll cap 30, re-rolled exclusions, pins, E1 `pool_too_small`.
  E2 `mix_infeasible` exists only in difficulty mode. The rating mode has E3 `targets_far` as a **warning** (not an
  error) when any pick is > 300 off.
- `drawSlots` gets a strategy parameter: `drawSlots({ ..., strategy: { kind: "difficulty", mix } | { kind: "rating",
  targets } })`. The candidate filter differs (difficulty match vs. band around target), and tier ranking is shared.
  Pure, seeded RNG, in `src/lib/rooms/selection.ts` + new `src/lib/rooms/rating.ts`.
- Lobby slot notes ("2 of 3 people have solved this before", "Used in this room on Oct 3") stay in both modes.

## 8. Data model (one additive migration `drizzle/0004_rooms_v2.sql`)

```ts
// problems: two new columns
authorRating: smallint("author_rating"),                         // from meta.json "rating"; null → band default
ratingAdjust: smallint("rating_adjust").notNull().default(0),    // observed drift, never written by the importer
// + check("problems_author_rating", sql`${t.authorRating} IS NULL OR ${t.authorRating} BETWEEN 800 AND 3000`)
// + check("problems_rating_adjust", sql`${t.ratingAdjust} BETWEEN -200 AND 200`)

// rooms: new nullable columns
description: text("description"),                // ≤ 200 chars, CHECK, no control chars
color: smallint("color").notNull().default(0),   // palette index 0..7 (tokens, AA on white text checked)
presets: jsonb("presets").$type<SessionTemplate[]>(),           // ≤ 5, Zod on write, CHECK octet_length ≤ 4096
defaultPresetId: text("default_preset_id"),
schedule: jsonb("schedule").$type<RoomSchedule | null>(),       // CHECK octet_length ≤ 512

// room_sessions
rated: boolean("rated").notNull().default(true),
ratedAt: timestamp("rated_at", { withTimezone: true }),         // set once when ratings were applied
// settings jsonb gains: mode ("difficulty" default when absent, so old rows read correctly), presetId?, targets?

// room_session_participants
ratingAtStart: smallint("rating_at_start"),      // snapshot at start (or at late join)
ratingDelta: smallint("rating_delta"),           // null until applied; 0 if not active

// room_session_problems
ratingAtStart: smallint("rating_at_start"),      // effective problem rating at start

export const ratingSourceEnum = pgEnum("rating_source", ["default", "self_reported", "practice"]);
export const userRatings = pgTable("user_ratings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  rating: smallint("rating").notNull(),
  ratedPairs: integer("rated_pairs").notNull().default(0),
  ratedSessions: integer("rated_sessions").notNull().default(0),
  source: ratingSourceEnum("source").notNull(),
  selfReportedLc: smallint("self_reported_lc"),            // private; CHECK 0..4000
  showOnProfile: boolean("show_on_profile").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("user_ratings_range", sql`${t.rating} BETWEEN 400 AND 3500`)]).enableRLS();
```

- No `rating_events` table: the ledger is `room_session_participants.(rating_at_start, rating_delta)` (who gained/lost
  per session) and `room_session_problems.rating_at_start`. Problem stats query = rated, finished sessions joined with
  participants (active) and results. Index: existing PKs + `room_session_problems_problem_idx`.
- `meta.json` gains optional `"rating": 1500` (integer). `verify-problems.ts`: 800–3000, warn when outside the band
  (easy 1000–1450, medium 1450–1850, hard 1850–2400). `import-problems.ts` upserts `author_rating` only.
- Migration: `ALTER TABLE … ADD COLUMN` (nullable or constant default, no rewrite), `CREATE TYPE rating_source`,
  `CREATE TABLE user_ratings … ENABLE ROW LEVEL SECURITY`. The same migration marks history as unrated:
  `UPDATE room_sessions SET rated = false WHERE status IN ('finished','cancelled')` (a few rows), so old sessions never
  move ratings. Optional script `pnpm rooms:replay-ratings` replays past finished sessions in order (owner decides;
  default: no).
- Apply with `DATABASE_URL_DIRECT` as in DEPLOY.md, only after the owner's go-ahead.

### 8.1 Seed ratings for the 20 problems (`meta.json` `rating`)

| Problem | Diff | Rating | Why |
|---|---|---|---|
| fizz-buzz | easy | 1050 | loop + modulo, no algorithm |
| reverse-string | easy | 1080 | in-place two pointers, one idea |
| contains-duplicate | easy | 1120 | set membership |
| palindrome-number | easy | 1150 | digit arithmetic, no string conversion trick needed |
| valid-anagram | easy | 1150 | counting |
| two-sum | easy | 1180 | hash map complement: first "data structure" insight |
| binary-search | easy | 1250 | off-by-one invariants trip people under time |
| valid-parentheses | easy | 1270 | stack + edge cases |
| climbing-stairs | easy | 1300 | recognizing a recurrence (first DP) |
| best-time-to-buy-and-sell-stock | easy | 1330 | running minimum, one pass |
| maximum-subarray | easy | 1420 | Kadane: the labelled-easy problem with a real insight |
| house-robber | medium | 1500 | 1-D DP with a choice |
| product-of-array-except-self | medium | 1560 | prefix/suffix products without division |
| merge-intervals | medium | 1580 | sort + sweep, merge edge cases |
| longest-substring-without-repeating-characters | medium | 1620 | sliding window with a last-seen map |
| coin-change | medium | 1680 | unbounded knapsack, the −1 case |
| longest-common-subsequence | medium | 1720 | 2-D DP table |
| edit-distance | hard | 1900 | 2-D DP with three transitions; textbook, so the easiest hard |
| trapping-rain-water | hard | 1950 | two-pointer/stack insight |
| longest-valid-parentheses | hard | 2150 | subtle stack/DP; hardest in the catalog |

These are the author's judgement (relative order matters more than absolute values). The `adjust` drift corrects
them from real outcomes, and the cards say "author's estimate" until 10 rated attempts.

## 9. Live updates and events

### 9.1 What exists (kept)
- `GET …/state?after=<cursor>` returns `{serverNow, status, endsAt, cursor, events[], hasMore, snapshot?, pendingJudging,
  viewer}`. Snapshot on first poll, on any event, every 10th poll.
- Schedule (`event-source.ts`): lobby 5 s / 15 s hidden, live 3 s / 10 s, finished-pending 3 s / 10 s, backoff
  3 → 6 → 12 → 30 s, immediate refresh on visibility, online and your own final verdict (`OWN_SUBMIT_FINAL_EVENT`).
- Events: `problem_solved` (payload position, solveSeconds, wrongBefore, firstSolver, solvedCount), `attempt_failed`
  (position, attempts), always stored and inserted by `applySessionOutcome` inside `finalize()`.

### 9.2 Changes (backward compatible)
1. **`pending` on every state response** (additive field): `pending: { userId: string; position: number }[]`, only for
   live, or finished with pending judging. It replaces the gate's `count(*)` with
   `SELECT x.user_id, sp.position FROM submissions x JOIN room_session_problems sp ON sp.session_id = x.room_session_id
   AND sp.problem_id = x.problem_id WHERE x.room_session_id = $s AND x.status IN ('queued','running') AND x.kind =
   'submit' GROUP BY 1, 2` (index `submissions_room_session_idx`). `pendingJudging` stays (= length).
   Leak check: it reveals only "someone submitted for problem k now". No verdict, no code, no timing beyond what the
   next event reveals. Lobby: empty array.
2. **Faster while judging**: phase `liveJudging` = live and `pending.length > 0` → poll 1.5 s (visible) / 10 s
   (hidden). When a cell leaves "pending" the following batch carries the `problem_solved` / `attempt_failed` event,
   so friends see the result about 0–1.5 s after the verdict. The rest of the time polling stays at 3 s. Cost: ≈ +30 %
   requests during busy minutes. Estimate for 6 people × 90 min: ~11 000 → ~14 000 tiny requests.
3. **Failed attempts default on**: `DEFAULT_NOTIFICATION_PREFS.showAttempts = true`. The key moves to
   `lemmayard:room-notifications:v2`. On first read the v1 value is migrated field by field, except `showAttempts`,
   which takes the new default. The per-browser mute stays (switch "Failed attempts"). Toast copy: "bob's attempt on
   Problem 2 was not accepted" (`CircleX`, muted, no action). The feed line is the same.
4. **No new event types** in the DB. "Judging…" feed lines are generated client-side from `pending` diffs and never
   stored or toasted.
5. **v2 transport (unchanged plan)**: the `afterCommit` hook POSTs a Supabase Broadcast `{cursor}` to `rs:<sessionId>`.
   The client pokes the same `state` endpoint, which gives sub-second updates. Do it only if 1.5 s / 3 s polling feels
   slow in real use. It needs the Realtime auth spike (rooms.md §3.1).

### 9.3 Limits (honest)
- **The judge does not run on Vercel** (DEPLOY.md §7). In production nobody can get a verdict, so there are no solves,
  attempts, "judging" cells or ratings until a worker host exists (a small VPS with Docker running `pnpm worker`
  against Supabase, or the planned Vercel Sandbox executor, both through `finalize()`). Locally `pnpm dev:all`
  works end to end.
- Hidden tabs are throttled by browsers (up to ~1 min). Unchanged, and documented in the settings popover.

## 10. Teams (item 6): explanation and minimal additions
- Explanation for the owner (copy for the help/FAQ): "A room is a team. It has its own members (owner + invited
  friends), one invite link, its own sessions, history and ratings view. Your Saturday group is one room; another group
  of friends creates their own room. They never see yours. You can be in several rooms."
- Add: description, color (§8), schedule + Next session (§5), attendance and streak (§2.4), copy "Create a team room",
  "team room" in the room sub-line, Members tab rating/attendance.
- **Not needed**: organisations/workspaces, sub-teams, team-vs-team contests, a cross-room leaderboard, a separate
  "team" entity, renaming tables, per-team billing. One rating per person works across rooms (D2).

## 11. API changes (all additive; check order of rooms.md §7.1)

| Method | Path | Body / response | Notes |
|---|---|---|---|
| POST | `/api/rooms` | `{name, description?, color?}` | unchanged limits |
| POST | `/api/rooms/:roomId/profile` | `{name?, description?, color?}` | owner. `rename` stays as an alias |
| POST | `/api/rooms/:roomId/presets` | `{action:"save", preset}` / `{action:"delete", id}` / `{action:"default", id}` | owner; ≤ 5; 4 KB body |
| POST | `/api/rooms/:roomId/schedule` | `{schedule: RoomSchedule \| null}` | owner |
| GET | `/api/rooms/:roomId/schedule.ics` | text/calendar | member; `Content-Disposition: attachment` |
| POST | `/api/rooms/:roomId/sessions` | + `presetId?`, `mode?`, `rated?` | `mode` default = preset's |
| POST | `…/sessions/:sid/draw` | + `mode`, `rated` | rating mode returns `lobby.slots[].{rating,target,chance,stats?}` and `lobby.expected:{room, perUser[]}` (host only; non-host gets `chance` only) |
| GET | `…/sessions/:sid/state` | + `pending[]` | §9.2 |
| GET | `/api/rooms/:roomId/sessions/:sid/results` (page data) | + `ratings: {userId, before, delta, expected}[]`, problem `before/after` | after `rated_at` |
| POST | `/api/me/rating` | `{selfReportedLc?: number \| null, showOnProfile?: boolean}` | user; self-report changes the start only while `ratedPairs = 0` (409 otherwise: "Your rating already comes from sessions") |
| GET | `/api/rooms` | + per room `{nextSession?: {at, presetName}, last?: {date, winner, myRank}, myAttendance:{played, of}}` | Q1 extended |

Rating application: `applySessionRatings(tx, sessionId)` in `src/server/rooms/ratings.ts`, called (a) at the end of
`applySessionOutcome` when the session is finished and pending = 0, (b) from lazy close, (c) from the state/results
read when `ended_at + 30 min < now()` and still unrated. It runs under the session advisory lock and
`UPDATE room_sessions SET rated_at = now() WHERE id = $1 AND rated_at IS NULL RETURNING`, so it applies exactly once.
User and problem rows are updated in a fixed order (ids ascending) to avoid deadlocks.

## 12. Copy (exact, English)
- Rooms list sub: "A room is your team: its own members, invite link, weekly sessions and history. Other teams never see it." Button: "Create a team room".
- Next session: "Next session" · "Sat, Oct 24 · 18:00" · "in 2 days · Europe/Kyiv · preset “Saturday”: 90 min · 4 problems · by rating · balanced" · "It never starts by itself. Anyone in the room can open the lobby; the host presses Start."
- No schedule: "No weekly schedule yet." Link "Set a weekly schedule" (owner) / "Ask the owner to set one" (member).
- Lobby: "Pick problems" · "By rating" · "By difficulty" · "I'll pick them". Help (rating): "Problems are chosen so the people in this lobby solve about the share you pick." Challenge: "Relaxed 75%", "Balanced 55%", "Tough 35%". "about 22 min per problem". "Rated session" / "Results update ratings. Turn off for warm-ups or very short sessions." "Save as room default". "+ Save current as preset".
- Slot: "rating 1500 · target 1507 (−7)" · "Room solve chance 50%" · "Solved by 58% of 31 rated attempts" · "Avg rating of solvers 1560" · "Not enough rated attempts yet (6 of 10): rating is the author's estimate" · "Closest available: 1680 (target 1850)".
- Expected: "Expected: about 2.2 of 4 solved per person (54%; target Balanced 55%)."
- Matrix legend: "Solved: time from session start; +split = time since that person's previous solve (≈ time spent on this one)" · "Judging a submission now" · "Tried, not solved yet" · "★ First = first to solve it" · "Ranking: solved, then time + 5 min per wrong attempt before a solve".
- Cells: "Judging… attempt 2" · "✗ 2 tries / not solved" · "first solve" · "1 wrong" · "seen" (tooltip "Solved this problem before the session").
- Results: "Who solved what, and when" · "Timeline" / "Each square is a solve at its time from the start; the number is the problem." · "Rating change" / "Expected = the sum of each problem's solve chance from your rating vs. the problem's rating. Solving more than expected raises your rating." · "not rated: no submissions".
- Profile: "LeetCode contest rating (optional)" / "Used once as your starting rating. Never shown to others. We don't read anything from LeetCode." · "Show my rating on my public profile".
- Provisional: "Provisional: moves faster for the first two sessions."
- Attendance: "7 of last 8 · streak 5" · "2 of 2 since joining".

## 13. Accessibility
- Matrix: `<table>` with an sr-only caption "Scoreboard: who solved which problem and when", `scope="col"` problem
  headers (full title in text, ellipsis only visual), `scope="row"` person headers, one sr-only sentence per cell
  (§3.2). Icons are `aria-hidden`. States never rely on color: ✓ / ✗ / spinner + words, dashed vs. solid borders.
- "Judging" changes do **not** go to the live region (too chatty). The Activity feed (`role="log"`, polite) announces
  solves and failed attempts, the latter only when the switch is on.
- The spinner and the cell flash are `motion-safe`, static otherwise.
- Timeline lanes: `role="img"` with `aria-label` summary + an sr-only table (person, problem, time).
- Rating Δ always has a sign and a number. Attendance squares have `aria-label="7 of last 8 sessions"`.
- Segmented controls = `radiogroup` with arrow keys. Preset tiles = radios. Tap targets ≥ 40 px on mobile (the cells
  are display-only, so their links ("code") get their own 40 px hit area via padding).
- Contrast: every token pair is from DESIGN-V2 (all ≥ 4.5:1). The new difficulty-colored mini-squares in
  history headers are decorative (difficulty is also in the title tooltip and the results page).

## 14. Security and privacy
- All new routes: same membership gate (404 for non-members), owner-only for presets/schedule/profile (403 for
  members), Zod strict bodies, size CHECKs on jsonb.
- Ratings: visible only to co-members and to the person. The public profile shows them only with opt-in. The
  self-reported LC rating is never returned by any endpoint except to its owner.
- `pending` reveals only "submission in flight for (person, problem)" to co-members of a live session. No verdict
  types, code or test data, as before.
- Problem aggregate stats: n ≥ 10 pairs, ≥ 3 people, rounding (§6.8). They are never per-person outside a shared room.
- `.ics`: no token, no member names. Description only "LemmaYard room session".
- Lobby hides titles and ratings of drawn problems from non-hosts (a rating plus difficulty could identify the problem).

## 15. Acceptance criteria

**Matrix / results**
- AC-V2-MX-1 For N ∈ {1, 2, 3, 4, 5, 8} the live and results pages render without horizontal page scroll at 1440 and
  390 (Playwright `scrollWidth ≤ innerWidth`); for N ≥ 6 cells use the compact variant; for N ≤ 2 an axis is shown.
- AC-V2-MX-2 `liveView` unit test: split = time − previous solve of the same person in solve order; first solve split
  hidden; wrong-attempt count = Σ wrongBefore (solved) + attempts (unsolved); First marks ties.
- AC-V2-MX-3 A cell shows "Judging…" while the state response's `pending` lists (user, position) and switches to solved
  or tried on the next batch (component test with a fake source).
- AC-V2-MX-4 sr-only cell sentences match §3.2 for each state (snapshot test); axe 0 serious/critical on live (N = 1,
  4, 8) and results.
- AC-V2-MX-5 The room page no longer renders "Room difficulty profile"; the member timeline no longer renders
  "Progress over time"; `?tab=leaderboard` redirects to `?tab=members`.
- AC-V2-MX-6 Results show the Timeline lanes with one marker per solve at `left = solveSeconds / duration`, plus an
  sr-only table.

**Defaults / presets / schedule**
- AC-V2-DEF-1 Saving a preset (owner) persists it; the 6th → 409; a member → 403; a new session without fields uses
  the default preset (API test).
- AC-V2-DEF-2 `nextOccurrence` unit tests: weekly Saturday 18:00 Europe/Kyiv across both DST changes; "now" equal to
  the occurrence minute → that occurrence; after a finished session with `planned_for = occurrence` → next week.
- AC-V2-DEF-3 Open lobby from the Next card creates a lobby with the preset and `planned_for`; nothing is created
  without a click (no cron in the codebase).
- AC-V2-DEF-4 `/rooms` cards show Next / Last / You lines; `schedule.ics` validates (RFC 5545 parser in test) and
  contains no token.

**Rating core**
- AC-V2-RAT-1 `rating.ts` unit tests reproduce §6.5 A–D to the shown precision (P table, targets 1307/1407/1507/1607,
  deltas +6/+15/+26/−22, problem drift, N = 1 values, spread targets).
- AC-V2-RAT-2 `applySessionRatings` runs once per session (5 concurrent calls → one update; `rated_at` set), skips
  inactive participants (delta 0, shown "not rated"), waits for pending judging (or 30 min).
- AC-V2-RAT-3 Unrated sessions (`rated = false`) change nothing; sessions finished before the migration are unrated.
- AC-V2-RAT-4 Start rating precedence: self-reported → practice top-3 − 100 → 1500; self-report after rated pairs →
  409.
- AC-V2-RAT-5 Problem adjust is clamped to ±200; the importer never overwrites `rating_adjust`.
- AC-V2-RAT-6 Privacy: `/u/[username]` shows no rating unless opted in; non-members get 404 on all rating data; the LC
  self-report appears only in the owner's own `/api/me` response.

**Rating selection**
- AC-V2-SEL-1 Seeded draw in rating mode picks within ±100 when available, prefers tier A over B over C inside the
  band, orders slots by target, reports `targets_far` when > 300.
- AC-V2-SEL-2 Bisection: mean P equals τ within 0.001 for the free slots; pinned slots are included with their rating.
- AC-V2-SEL-3 Difficulty mode output is byte-identical to v1 for the same seed (regression).
- AC-V2-SEL-4 Non-host lobby JSON contains no title, slug or rating for drawn slots.

**Live**
- AC-V2-LIVE-1 State poll includes `pending` (live only); query count unchanged (≤ 3 without events).
- AC-V2-LIVE-2 Scheduler uses 1.5 s while `pending` is non-empty and visible, 3 s otherwise (fake timers).
- AC-V2-LIVE-3 Fresh browser: failed-attempt toasts on; a v1 stored prefs object keeps sound/browser/toasts and gets
  `showAttempts = true`; muting persists.
- AC-V2-LIVE-4 E2E (local worker): bob submits a wrong answer → alice sees "Judging…" within 2 s of the submit, then
  "✗ 1 try" and a toast within 2 s of the verdict.

## 16. Test plan
- **Unit (Vitest)**: `rating.ts` (P, ladder, bisection, update, provisional, clamp), `schedule.ts` (DST, weekday wrap),
  `live-view.ts` (split, states, wrong counts, N layouts), `selection.ts` rating strategy (seeded), prefs migration.
- **Integration (real Postgres)**: migration (columns, CHECKs, RLS on `user_ratings`), presets/schedule APIs incl.
  membership matrix, `applySessionRatings` idempotency + concurrency + pending wait, `pending` query, problem stats
  thresholds, ics route.
- **E2E (Playwright)**: N = 1 and N = 5 sessions end to end with the local worker (AC-V2-LIVE-4), results ratings,
  rooms list next session, mobile 390 no horizontal scroll for N ∈ {1, 2, 4, 5, 8}.
- **A11y**: axe on live/results (N = 1, 4, 8), lobby both modes, room tabs, rooms list.
- **Visual**: the mockup PNGs as reference for review (not golden tests).

## 17. Modules (branches `feature/f6v2-<name>` from `integration`, PR back, owner merges)

| # | Branch | Content | Depends | Size |
|---|---|---|---|---|
| V2-1 | `feature/f6v2-rating-core` | Migration 0004 (all columns + `user_ratings`), meta.json `rating` for 20 problems + verify/import, pure `rating.ts`, `applySessionRatings` + hooks, snapshots at start/join, `/api/me/rating` + profile fields (LC self-report, public toggle) | — | M (≈ 2–3 days) |
| V2-2 | `feature/f6v2-room-defaults` | description/color, presets, schedule + `nextOccurrence`, Next-session card, `.ics`, rooms list Next/Last/You, attendance query, Settings tab, copy "team room" | V2-1 (migration) | M |
| V2-3 | `feature/f6v2-scoreboard` | Matrix component (N rules, mobile cards, sr text), live layout, results (facts, timeline, problems, rating change), Sessions mini-matrix, Members tab, remove difficulty profile/progress chart, banner chips | V2-1 (deltas on results) | L (≈ 4–5 days) |
| V2-4 | `feature/f6v2-rating-selection` | `drawSlots` strategy, rating mode in draw API, lobby mode switch, slot cards with stats, expected panel, "I'll pick them" mode | V2-1 | M |
| V2-5 | `feature/f6v2-live-attempts` | `pending` in state, 1.5 s judging phase, prefs v2 (failed attempts on), toast copy, judging cells wiring | V2-3 | S (≈ 1 day) |

Order: V2-1 → (V2-2 ∥ V2-3 ∥ V2-4) → V2-5. If only one thing ships first, ship **V2-3 + V2-5** without ratings
(the rating column is hidden when no ratings exist). That alone answers items 1, 2 and 5. Implementers read
`CLAUDE.md`, `PLAN.md`, `docs/specs/rooms.md` and this file first.

## 18. Risks

| Risk | Mitigation |
|---|---|
| Small catalog (20, 3 hard) makes rating targets coarse | Show realized expectation and "closest available"; add problems over time; ratings work better as the catalog grows. |
| Ratings feel judgmental among friends | Members-only, opt-in public, D3 option "own number only"; "Rated session" off switch. |
| Author seed ratings wrong | `adjust` drift (±200), "author's estimate" label until 10 attempts. |
| Elo with few games is noisy | Provisional K, k = K / max(N, 4), ratings shown as integers without decimals; revisit K after 10 sessions. |
| Split misread as "time spent" when people switch problems | Legend + tooltip wording "since previous solve". |
| Live features useless in prod without a judge host | State plainly (§9.3); keep developing locally; worker-host decision is outside this spec (PLAN §13). |
| DST/timezone bugs in schedule | Pure function + DST tests; store IANA zone, never offsets. |
| Polling cost grows with 1.5 s phase | Only while judging; ~+30 %; Broadcast poke remains the escape hatch. |

## 19. Decisions for the owner (max 3)
- **D1. Default pick mode for new rooms/presets.** *By rating* (recommended: works from day 1 with author ratings,
  adapts per person, and is closest to what you asked for) / *By difficulty* (v1 behavior, rating is opt-in).
- **D2. Rating scope.** *One rating per person across all rooms* (recommended: more games → more accurate; a friend
  in two groups has one level) / *a separate rating per room* (isolated, but slow to converge with 4 problems a week).
- **D3. Who sees rating numbers.** *All members of a shared room* see everyone's rating and change (recommended;
  friends, trust; it explains the selection) / *each person sees only their own number*, others see only the room
  average and "expected solves".

---

## Owner decisions (2026-10-18) — these override the recommendations above

- **D1 — selection mode default: "By rating".** "By difficulty" stays as an alternative; "I'll pick them" stays.
- **D2 — rating scope: PER ROOM.** Every member has exactly ONE rating inside a room (stored on the room membership, not on the user); the same person has independent ratings in different rooms. All members of a room get the SAME problems, chosen from the ratings of that room's participants. The optional self-reported LeetCode contest rating (profile field) only seeds a member's initial rating when they join a room (otherwise the cold-start rules apply). Wherever this spec says "global rating", read "per-room rating"; the data model must put `rating`, `rated_games` (and provisional flag) on `room_members`, and `profiles`/`users` only holds the optional self-reported seed.
- **D3 — visibility:** every member of a room sees every other member's rating in that room (lobby, scoreboard, results, members tab). Ratings are not shown outside the room; the self-reported LeetCode rating is visible only to its owner.
