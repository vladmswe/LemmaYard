# F6. Rooms: private friend rooms with timed sessions, live notifications and history

Date: 2026-10-17. Status: design for owner review, then implementation.
Repo facts read on branch `integration`: `PLAN.md` (§4–6, §13), `DESIGN.md`, `CLAUDE.md`, `docs/DEPLOY.md`,
`src/server/db/schema.ts`, `src/server/submissions/*`, `src/app/api/problems/[slug]/{run,submit}`,
`src/app/api/submissions/[id]`, `src/lib/submission-client.ts`, `worker/queue.ts`, `worker/loop.ts`,
`src/server/auth/*`, `src/server/http/request.ts`, `src/server/db/index.ts`, scratchpad `FEATURES.md` (F1–F5).
Catalog today: 20 published problems (11 easy, 6 medium, 3 hard), 11 tags; the most common are
`array` (9), `dynamic-programming` (9), `string` (8) and `hash-table` (4). The rest appear on 1–3 problems each.

Owner request (condensed): weekly meetup with friends. Pick about 4 problems for about 1.5 h by topic and
difficulty. The difficulty should follow "the average among those who submitted in our past contests".
Each person solves alone, a real-time notification arrives when someone solves a problem, and the
history shows who solved what on which date. Clarification from the owner: these are **separate private
rooms of friends, with history**.

Conventions inherited from FEATURES.md §3: PLAN §6 check order, Zod at every boundary, DESIGN.md
components and tokens only, English UI, `timestamptz`, server is the time authority, one additive
migration per feature. Feature id **F6**. Branches `feature/f6-<module>` (repo convention
`feature/<id-name>`, from `integration`/the repo's working branch, never committed directly to `main`).

---

## 1. Product concept

### 1.1 Vocabulary (UI words in bold; code names in `code`)

| Term | Meaning |
|---|---|
| **Room** (`room`) | A private group of friends. Only members can see anything about it: name, members, sessions, history. |
| **Owner** (`owner`) | The member who created the room (exactly one). Manages the invite link, removes members, renames or deletes the room, can transfer ownership. |
| **Member** (`member`) | Anyone who joined via the invite link. Can start sessions, join sessions, see history. |
| **Session** (`room_session`) | One timed meetup: N problems (default 4), a duration (default 90 min), a scoreboard. States: **Lobby → Live → Finished**, or **Lobby → Cancelled**. |
| **Host** | The member who created the session. Picks or re-rolls problems in the lobby, starts it, may end it early. The room owner has the same powers over any session (in case the host is gone). |
| **Participant** | A member who pressed **Join** for a session (in the lobby or while live). Only participants' submissions count. |
| **Slot** / **Problem 1..N** | A position in the session's problem list. In the lobby it holds a drawn or pinned problem. |
| **Invite link** | `https://<host>/rooms/join#<token>`: one active link per room, expires, can be rotated. |
| **Scoreboard** | Live table: rank, participant, solved count, time, one cell per problem. |
| **History** | Every finished session of the room: date, problems, who solved what, when, after how many attempts. |

"Crew" is not used anywhere in the UI or code.

### 1.2 End-to-end journey (weekly meetup)

1. **Create a room.** `/rooms` → **New room** → name ("Saturday Algo Club") → room page. The creator is the owner.
2. **Invite friends.** Room → **Members** tab → **Invite link** card: **Copy link**, expiry shown ("Expires Oct 24"),
   **New link** (old link stops working at once), **Turn off**. The owner sends the link through any messenger.
   - *Existing user, signed in*: opens the link → `/rooms/join` shows "Join **Saturday Algo Club**? 3 members:
     alice, bob, carol" plus the sharing notice (§4.5) → **Join room** → room page.
   - *Signed out or new user*: the join page saves the token in `sessionStorage`, then shows **Log in** / **Sign up**
     buttons. Their `next` points to `/rooms/join`. After auth the page reads the token back and shows the same
     confirmation. The token is never placed in a query string (§8.1).
   - Invalid, expired or rotated link: "This invite link is invalid or has expired. Ask the room owner for a new one."
3. **Roles and leaving.** Members: **Leave room** (AlertDialog). The owner can **Remove** a member or
   **Make owner** (transfer). The owner cannot leave without transferring ownership first, except when they are the
   last member: leaving then deletes the room after a confirm that names it.
4. **Create a session.** Room page → **New session**. This creates a **Lobby** with defaults: 4 problems,
   90 minutes, topics "Any", difficulty mix "Suggested" (§2) and "Avoid problems someone has already solved"
   switched on. The first draw happens immediately. Optional "Planned for" date/time (shown on the room page, no
   auto-start in v1). Only one open (lobby or live) session per room.
5. **Pick problems (host).** The lobby shows the calibration panel ("Your room solved 92% of easy, 46% of medium,
   6% of hard problems in the last 6 sessions → suggested 1 Easy · 3 Medium · 0 Hard"), the slots, and per slot
   **Re-roll**, **Pin a problem** (search by title) and **Unpin**. **Re-roll all** keeps pinned slots.
   Other members see the slots as difficulty + tags only ("Problem 2 · Medium · Dynamic programming"). Titles
   are revealed at start.
6. **Join.** Members open the lobby (link on the room page, or the "Session open" card) → **Join session**.
   The host is joined automatically.
7. **Start (host).** **Start session** (AlertDialog "Start now? The 90-minute timer starts for everyone.").
   The server sets `started_at = now()` and `ends_at = started_at + 90 min`. All open lobby screens switch to
   Live within one polling interval.
8. **Solve (live).** The session screen shows the countdown, problem list and scoreboard. **Open** on a problem goes to
   `/problems/<slug>?session=<id>`, a normal problem page with a **session banner** ("Saturday Algo Club ·
   Problem 2 of 4 · 47:12 left"). Its Submit carries the session id. Accepted submits update the scoreboard,
   and the other participants get a toast/notification ("alice solved Problem 2 · Coin Change").
9. **Finish.** At `ends_at` (or **End session** by the host) the session becomes Finished. Submits already sent
   before the end are still judged and count ("Judging 1 submission…" shown until done).
10. **Results.** The same URL shows the final scoreboard, first solver per problem, each participant's
    attempts and times, and, if sharing is on, **View solution** links to accepted code (§4.5).
11. **History and stats.** Room page tabs **Sessions** (history list), **Leaderboard** (over time), **Members**.
    Clicking a member gives their timeline: per date, which problems they solved.

### 1.3 v1 (smallest valuable version) vs v2

**v1 (this spec):** rooms, invite link, membership, roles (owner/member); sessions with lobby/live/finished;
selection with topic filter, suggested difficulty mix from the room's history, manual mix override,
repeat avoidance, re-roll and pin; submit with session context; scoring; live updates by polling, with in-app toasts,
an activity feed, optional sound and optional browser notifications for background tabs; results; history list,
per-room leaderboard, per-member timeline; solution sharing after finish.

**v1.5 (small, after v1 ships):** CSV/Markdown export of room history; "Add unsolved problems to my review
queue" on results (needs F1); duplicate a session's settings ("Same as last week").

**v2 (listed only, not designed):** push transport (Supabase Realtime broadcast "poke" or SSE) behind the same
interface; Web Push with closed tab (service worker, VAPID keys, push subscription table); scheduled auto-start and
reminders; per-participant clocks (virtual replay of a past session for someone who missed it); extend a live
session; per-topic adaptive selection; multiple invite links with use counts; room avatars; chat or reactions;
spectators; hint policy per session (allowing F2 hints with a marker).

---

## 2. Problem selection (the core)

All selection logic is pure and deterministic given an injected RNG, in `src/lib/rooms/selection.ts`
(`computeCalibration`, `suggestMix`, `drawSlots`). The server only gathers inputs (§6.6, queries Q4, Q7, Q8)
and persists the result.

### 2.1 Inputs

- **Pool**: published problems; if topics are chosen, problems having **any** of the chosen tags
  (at most 5 tags; "Any" = no filter).
- **N** = problem count (1..8, default 4). **Mix** = `{easy, medium, hard}` summing to N: either
  **Suggested** (computed below) or **Manual** (host enters three numbers; shown as a stepper per difficulty).
- **Challenge** (host Select, default **Balanced**): target share of problems solved per person,
  `T`: Relaxed = 0.65, Balanced = 0.50, Tough = 0.35.
- **Avoid already solved** (default on): prefer problems none of the *expected participants* has solved.
  The expected participants are those who have joined the lobby at draw time, if there are at least 2 of them;
  otherwise all current room members. "Solved" = has an `accepted` `submit` anywhere, inside or outside sessions.
- **Room usage**: every problem used in this room's earlier live/finished sessions and when it was last used.
- **Pinned slots**: kept as they are; their problems are excluded from the draw for other slots.

### 2.2 Calibration: the room's solve rate per difficulty

"The average among those who submitted in our past contests" is defined exactly as follows.

- Window: the room's last **K = 6** finished sessions (by `started_at`).
- **Active participant** of a session: a participant with at least one judged session submit (any verdict except
  `internal_error`). People who joined and never submitted are excluded, which is what "those who submitted" means.
- **Pair**: (active participant, session problem). For difficulty d, `N_d` = number of pairs whose problem had
  difficulty d *at pick time* (snapshot column `room_session_problems.difficulty`), and `S_d` = how many of those pairs
  were solved in the window (first accepted submit created before `ends_at`).
- Smoothed rate (Bayesian average with a prior, so a single bad evening does not swing the mix):

  `r_d = (S_d + m · p_d) / (N_d + m)`, with prior weight **m = 4** pairs and priors
  **p_easy = 0.80, p_medium = 0.50, p_hard = 0.25**.

  These priors are guesses for a group of motivated friends and are tuned so that a room with no history
  gets the default mix 1/2/1 (Example A). They are constants in one file. They are not "facts".

### 2.3 Suggested mix

For each mix `(e, m, h)` with `e + m + h = N` (15 mixes for N = 4, 45 for N = 8):

- expected share solved per person: `E = (e·r_easy + m·r_medium + h·r_hard) / N`
- cost: `C = |E − T| + λ · (|e − e0| + |m − m0| + |h − h0|)`, with **λ = 0.02**, where `(e0, m0, h0)` is the
  default shape: `e0 = round(N/4)`, `h0 = round(N/4)`, `m0 = N − e0 − h0` (N = 4 → 1/2/1; N = 3 → 1/1/1;
  N = 6 → 2/2/2; N = 1 → 0/1/0, N = 2 → 1/1/0 with `round` half-up; this is a fixed table in code).
  The λ term keeps the suggestion near a familiar shape unless the data clearly argues otherwise.
- **Feasibility**: drop mixes that need more problems of a difficulty than the pool has after filters (all
  tiers, §2.4). If no mix is feasible, the pool has fewer than N problems: error E1 (§2.6).
- Choose the minimum C. Ties: smaller `|E − T|`, then more medium, then fewer hard (deterministic).

The host sees (calibration panel, copy):

> **Suggested: 1 Easy · 3 Medium · 0 Hard**
> Based on your last 3 sessions (people who submitted): Easy 11 of 12 solved, Medium 9 of 24, Hard 0 of 12.
> Expected: about 2.1 of 4 solved per person (target: Balanced, about half).
> [Use a custom mix]

With no history: "No finished sessions yet, so we start with a standard mix. It adapts after your first session."

### 2.4 Drawing problems for slots (repeat avoidance, small catalog)

Slots are filled in order Easy slots, then Medium, then Hard, for the chosen mix (pinned slots fixed first,
and each pinned problem consumes one unit of its difficulty from the mix). Within the candidates of the slot's
difficulty (pool minus problems already in the session minus problems shown and re-rolled away in this lobby),
candidates are ranked into **tiers**:

| Tier | Rule |
|---|---|
| A | never used in this room, solved by none of the expected participants |
| B | never used in this room, solved by some: ordered by number of expected participants who solved it (fewer first) |
| C | used in this room before: ordered by last use (oldest first) |

Pick uniformly at random among the candidates with the best (tier, sub-order) key. With "Avoid already solved"
off, tiers A and B merge (only room usage matters). A slot filled from tier B or C shows a muted note in the lobby:
"2 of 3 people have solved this before" or "Used in this room on Oct 3". The trade-off is visible, never silent.

**Small-catalog reality.** With 20 problems and 4 per week, a room runs out of tier-A problems in about 3–5 weeks
(fewer for hard: 3 problems). After that the draw falls into B/C automatically and says so. The lobby shows the
remaining count: "Unused in this room: 7 easy, 2 medium, 0 hard". When the catalog grows nothing changes in the
algorithm.

### 2.5 Re-roll, pin, re-draw

- **Re-roll slot k** (host): adds the current problem to `rerolled_problem_ids`, draws again for that slot with the
  same difficulty. Cap: 30 re-rolls per session (`reroll_count`); then 409 "Re-roll limit reached for this session".
  If the slot's difficulty has no candidates left except re-rolled ones, the re-rolled list is cleared once for
  that difficulty and the user sees "No other unused options; showing earlier ones again".
- **Pin**: the host searches published problems by title (any difficulty, filters ignored: a pin is an explicit
  choice) and pins it into slot k. A duplicate → 409 "This problem is already in the session". A pinned slot is
  not changed by re-roll-all. The slot's difficulty becomes the problem's difficulty, so the mix line shows the
  actual mix ("Actual: 1 Easy · 2 Medium · 1 Hard").
- **Re-draw** (changing count, mix, topics, challenge or avoid-solved): keeps pinned slots, redraws the rest. Changing N
  below the number of pinned slots → 400 "Unpin a problem first".

### 2.6 When filters leave too few problems

Errors are shown inline in the lobby as an Alert (warning) and are also returned by the API as 409 with
`code` and `counts`:

- **E1 `pool_too_small`**: pool size < N. "Only 3 problems match Stack + Sliding window. Choose fewer problems,
  add topics, or pick Any topic." The session cannot start until fixed.
- **E2 `mix_infeasible`** (manual mix only; the suggested mix only considers feasible mixes): "There is only
  1 Hard problem for these topics; your mix asks for 2. Available: 6 Easy, 4 Medium, 1 Hard." Button
  **Use suggested mix**.
- Never silently substitute another difficulty.

### 2.7 Worked examples (N = 4, Balanced T = 0.50, λ = 0.02, default 1/2/1)

**Example A — cold start (no sessions).** `r = (0.80, 0.50, 0.25)` (priors only).

| Mix | E | \|E−T\| | L1 from 1/2/1 | C |
|---|---|---|---|---|
| 1/2/1 | (0.80+1.00+0.25)/4 = 0.5125 | 0.0125 | 0 | **0.0125** |
| 0/4/0 | 0.5000 | 0 | 4 | 0.0800 |
| 2/1/1 | 0.5875 | 0.0875 | 2 | 0.1275 |
| 2/0/2 | 0.5250 | 0.0250 | 4 | 0.1050 |

→ **1 Easy · 2 Medium · 1 Hard**.

**Example B — the room struggles with hard.** Last 3 sessions, 4 active people:
easy S=11/N=12, medium 9/24, hard 0/12.
`r_e = (11 + 3.2)/16 = 0.8875`, `r_m = (9 + 2)/28 = 0.3929`, `r_h = (0 + 1)/16 = 0.0625`.

| Mix | E | \|E−T\| | L1 | C |
|---|---|---|---|---|
| 1/2/1 | (0.8875+0.7857+0.0625)/4 = 0.4339 | 0.0661 | 0 | 0.0661 |
| 1/3/0 | (0.8875+1.1786)/4 = 0.5165 | 0.0165 | 2 | **0.0565** |
| 2/1/1 | 0.5576 | 0.0576 | 2 | 0.0976 |
| 2/2/0 | 0.6402 | 0.1402 | 2 | 0.1802 |

→ **1 Easy · 3 Medium · 0 Hard**, expected 2.07 of 4 per person.

**Example C — a strong room.** easy 20/20, medium 18/24, hard 5/12:
`r_e = 23.2/24 = 0.9667`, `r_m = 20/28 = 0.7143`, `r_h = 6/16 = 0.375`.

| Mix | E | \|E−T\| | L1 | C |
|---|---|---|---|---|
| 1/2/1 | 0.6926 | 0.1926 | 0 | 0.1926 |
| 0/2/2 | (1.4286+0.75)/4 = 0.5446 | 0.0446 | 2 | **0.0846** |
| 0/1/3 | 0.4598 | 0.0402 | 4 | 0.1202 |
| 1/1/2 | 0.6077 | 0.1077 | 2 | 0.1477 |

→ **0 Easy · 2 Medium · 2 Hard**, but only if the pool has ≥ 2 hard problems; with topic "Stack" (1 hard:
longest-valid-parentheses) the 0/2/2 mix is infeasible and the next-cheapest feasible mix is shown.

**Example D — tiers.** Expected participants alice, bob, carol; slot Medium, topics Any. Medium problems:
merge-intervals (never used, solved by nobody) → A; house-robber (never used, bob solved) → B1;
coin-change (used Oct 3) → C. Draw = merge-intervals. Re-roll → house-robber with note
"1 of 3 people has solved this before". Re-roll again → coin-change, "Used in this room on Oct 3".

### 2.8 Edge cases

- K window contains sessions with different participants: fine, the rate is per room, not per person (v1). With
  ≥ 3 sessions the panel also shows per-person rates in a disclosure (read-only, for the host's judgement).
- A problem's difficulty changes in `problems/` later: calibration uses the snapshot; the draw uses the current value.
- A problem is unpublished after being drawn in a lobby: Start re-validates; unpublished slots → 409
  "Problem 3 is no longer available; re-roll it". Finished sessions keep showing it (title from `problems`).
- Manual mix with a sum ≠ N → 400. N > pool → E1. N = 1: default shape 0/1/0.
- RNG: `crypto.getRandomValues` in production; tests inject a seeded RNG.

---

## 3. Real-time notifications

### 3.1 Options compared

| Option | How it would work here | Complexity | Cost / limits | Secrets / RLS | Reliability | Verdict |
|---|---|---|---|---|---|---|
| **Short polling** of one cheap endpoint | Client asks `GET …/state?after=<cursor>` every 3 s while live and visible | Lowest: one route, one query, no new service | ≈ 20 req/min per viewer; 8 people × 90 min ≈ 14 400 small requests per session. Vercel bills active CPU + provisioned memory per invocation (Vercel docs, read 2026-10-17); a few ms of CPU each. Monthly included quotas: **verify** for the owner's plan | None new: same cookie auth and membership check as every page | High: stateless; every response is a full answer; reconnect = next poll | **v1** |
| SSE from a Vercel Function | Long-lived streamed response; the function itself must poll the DB (no LISTEN, see below) and push | Medium: stream handling, heartbeats, reconnect with `Last-Event-ID`, polling fallback anyway | Max duration: Hobby 300 s, Pro 800 s default max (Vercel docs, read 2026-10-17), so a reconnect at least every 5 min; each open stream keeps an instance busy and is billed for provisioned memory for the whole time it is open; one DB query per second per stream | None new | Good with reconnect; proxies/buffering risk (**verify** on Vercel for Node functions) | v2 candidate, little gain over polling because the server still polls |
| Postgres `LISTEN/NOTIFY` | Server listens on a channel | — | Does **not** work through the Supabase transaction pooler (port 6543), which is what Vercel uses (DEPLOY.md). Would need a session-mode connection held per listener | — | — | Rejected |
| Supabase Realtime (Broadcast / Postgres Changes) | Server sends via REST `POST /realtime/v1/api/broadcast` or SQL `realtime.send()`; browser subscribes with `@supabase/supabase-js` | Medium-high: new client lib, key management, channel auth | Free plan: 200 concurrent connections, 100 msg/s; Pro 500 / 500 (Supabase docs, read 2026-10-17) — ample | Private channels require an *authenticated* Supabase client and RLS **policies** on `realtime.messages` (Supabase docs). Our users are not Supabase Auth users, so we would mint JWTs the Realtime server accepts (project JWT secret or signing keys: **verify** with the new `sb_publishable_` / `sb_secret_` key system) and add the first RLS policy in the project. Postgres Changes would need SELECT policies on our tables, contradicting "RLS on, no policies" | Very good latency (sub-second) | v2: use only as a payload-free "poke" (§3.2) |
| Vercel WebSockets | Vercel changelog lists WebSocket support in public beta | Unknown | **verify** (beta; instance pinning) | — | Beta | Not for v1 |
| Web Push (tab closed) | Service worker + VAPID + push subscriptions | High | Free, but new keys and a table | VAPID private key in env | Good | v2 |
| Notification API (tab open, in background) | `new Notification()` when `document.hidden` | Low | — | — | Desktop: yes. Mobile Chrome requires a service worker `showNotification` (**verify**); iOS only for installed PWAs (**verify**) → in-app only on mobile | **v1, opt-in** |
| In-app toast + activity feed + scoreboard | Rendered from the same events | Low | — | — | — | **v1** |
| Sound | WebAudio short tone, no asset | Low | — | — | Autoplay rules need a prior user gesture: the toggle click is that gesture | **v1, off by default** |

**Latency budget reality.** The judge itself takes 1–5 s per submit (AC-M7-5 target p95 < 5 s), and the solver
polls their own verdict every 1 s. With 3 s polling, friends learn of a solve 0–3 s after the verdict, which is fine
for people sitting in a call together.

**Background tabs.** Browsers throttle timers in hidden tabs (Chrome's "intensive throttling" can reduce timers
to about once per minute after 5 minutes hidden: **verify**). So a background browser notification may arrive up to about a
minute late. This is documented in the notification settings help text ("Notifications in background tabs may be
delayed by up to a minute").

### 3.2 Decision: v1 = adaptive short polling behind a swappable interface

**Why:** zero new services or secrets; it uses the same cookie auth and membership check as everything else, so
RLS stays "enabled, no policies". It is stateless, so it works with Vercel Functions and the transaction pooler.
Replay and reconnect are trivial (cursor), and it costs a few thousand tiny requests per weekly session.
The DB stays the single source of truth.

**Polling schedule (client):**

| State | Visible tab | Hidden tab |
|---|---|---|
| Lobby | 5 s | 15 s |
| Live | 3 s | 10 s (browser may throttle further) |
| Finished with pending judging | 3 s | 10 s |
| Finished, nothing pending / Cancelled | stop | stop |

Plus an immediate poll on `visibilitychange` → visible, on `online`, and right after the user's own submit
returns a final verdict. On a network error or 5xx: exponential backoff 3 → 6 → 12 → 30 s (cap), with a muted
"Reconnecting…" indicator after 2 failures. On 429: wait `Retry-After`. On 404: stop and show "You no longer have
access to this room." On 401: "Sign in again" link.

**Abstraction** (`src/lib/rooms/event-source.ts`, client):

```ts
export type RoomEventBatch = { cursor: string; events: RoomEvent[]; snapshot?: SessionSnapshot };
export interface RoomEventSource {
  /** Starts delivering batches from `cursor` (null = from now with a full snapshot). */
  subscribe(sessionId: string, cursor: string | null,
            onBatch: (b: RoomEventBatch) => void,
            onStatus: (s: "connected" | "reconnecting" | "gone" | "unauthenticated") => void): () => void;
}
export function createPollingEventSource(opts?: { fetch?: typeof fetch; schedule?: PollSchedule }): RoomEventSource;
```

Server side, all events go through one function, `appendRoomEvent(tx, event)` (`src/server/rooms/events.ts`), and an
`afterCommit` notifier hook `notifyRoomEvent(sessionId, cursor)` that is a **no-op in v1**. v2 swap: the hook
POSTs a Supabase Broadcast containing only `{cursor}` (no names, no titles) to topic `rs:<sessionId>`, and the client
`SupabasePokeEventSource` subscribes to it and on each poke calls the same `state` endpoint. Authorization
and data stay in our app. A leaked topic reveals only timing. The UI does not change.

### 3.3 Event model

Table `room_events` (§6). Every event is scoped to a session. The cursor is the event's `bigint` id.

```ts
type RoomEvent =
  | { id: string; type: "participant_joined"; at: string; actor: Actor }
  | { id: string; type: "lobby_updated";      at: string; payload: { problemCount: number; durationMin: number } }
  | { id: string; type: "session_started";    at: string; payload: { startedAt: string; endsAt: string } }
  | { id: string; type: "problem_solved";     at: string; actor: Actor;
      payload: { position: number; solveSeconds: number; wrongBefore: number; firstSolver: boolean; solvedCount: number } }
  | { id: string; type: "attempt_failed";     at: string; actor: Actor; payload: { position: number; attempts: number } }
  | { id: string; type: "session_ended";      at: string; payload: { endedAt: string; reason: "time" | "host" } }
  | { id: string; type: "session_cancelled";  at: string };
type Actor = { userId: string; username: string };
```

Payloads never contain code, verdict types, test data or problem titles (titles come from the snapshot,
which hides them before start). `attempt_failed` is always stored; whether it is *toasted* is a per-viewer opt-in
(default off). It always updates the scoreboard's attempt count.

**Ordering and the commit-order trap.** Identity values are assigned at insert time but transactions can commit
out of order, so a reader holding cursor 105 could permanently miss 104 if 104 commits later. Prevention: every
transaction that appends an event for session S first takes `pg_advisory_xact_lock(hashtext('rs:' || S))`
and holds it until commit. Event ids for one session are therefore allocated in commit order, so
`WHERE session_id = S AND id > cursor` never skips. Advisory xact locks work through the transaction pooler (PLAN §13).

**Delivery guarantee:** at-least-once to the client, exactly-once in the DB, client de-duplicates by id (keeps the
last 200 ids). Replay: any `after=<cursor>` returns all later events (page size 100, `hasMore` → client polls
again immediately). If the client has no cursor, or the cursor is not a number, the response is a fresh snapshot
plus the latest cursor and no events. Events are never deleted while the room exists (≈ 30–60 rows per session),
so a cursor is never "too old".

### 3.4 How a solve is produced (single place)

**Association: explicit session context on Submit.** The submit body gets an optional `roomSessionId`
(uuid). It is stored in the new column `submissions.room_session_id`. Deriving the session from "time window +
problem membership" was rejected: it would count a problem solved in another tab "just for practice", it is
ambiguous when a user is in two rooms with overlapping sessions, and it makes the problem page unable to
tell the user whether the submit counts. With an explicit id the same problem solved outside the session
(no id) never counts. FEATURES F3 uses the same pattern (`interview_session_id`); a body may carry at most one of
the two (400 "A submission can belong to one session only").

**Validation at submit time** (in `createSubmission`, after step 5, and the window check again inside the
`insertWithLimits` transaction so a race with the end is impossible):
1. The session exists, its room has the user as a member, the user is a participant → else 404 "Session not found"
   (non-members never learn it exists); member but not participant → 409 "Join the session first".
2. The problem is in the session → else 400 "This problem is not part of the session".
3. `status = 'live'` and `clock_timestamp() < ends_at` (lazy close runs first, §7.3) → else 409 "The session has
   ended; this submission would not count. Submit without the session?" (the client offers a plain submit).
Runs ignore session context (Runs never count).

**Evaluation point: inside `finalize()`, in the same DB transaction** (`worker/queue.ts`). Today `finalize()` is one
`UPDATE … WHERE id=? AND status='running'`. It becomes a transaction:
1. `UPDATE submissions SET … WHERE id = $1 AND status = 'running' RETURNING room_session_id, user_id, problem_id, kind, status`.
2. If no row → return false (already finalized by the sweep; nothing else happens, which is idempotent).
3. If `kind = 'submit'` and `room_session_id IS NOT NULL` → `applySessionOutcome(tx, row)`
   (`src/server/rooms/outcome.ts`).

Every executor goes through `finalize()`: the Docker worker today, and in production a future Vercel Sandbox
executor (PLAN §13) must call the same `finalize()`. `finalizeInternalError()` and `sweep()` need no change
because `internal_error` never counts. They only end "pending judging", which is computed by query Q10.

`applySessionOutcome(tx, {sessionId, userId, problemId})`:
1. `pg_advisory_xact_lock(hashtext('rs:' || sessionId))`.
2. Load the session (`started_at`, `ends_at`, status) and the slot `position` of the problem.
3. **Recompute from source of truth** (query Q9): all `submit` rows of (session, user, problem) with a final status,
   ordered by `created_at, id`. Then:
   - counted submissions: status ∈ {accepted, wrong_answer, time_limit, memory_limit, runtime_error} and
     `started_at ≤ created_at < ends_at`. `compile_error` and `internal_error` are ignored (not the
     participant's algorithm, no penalty; same idea as common contest rules).
   - `first_accepted` = earliest counted `accepted`; `wrong_before` = counted non-accepted before it;
     `attempts` = all counted; `solve_seconds = floor(first_accepted.created_at − started_at)`.
4. Read the previous `room_session_results` row; upsert the recomputed values.
5. Recompute the participant's `solved_count` and `penalty_sec`, then ranks for the whole session (≤ 20 rows, Q11), and
   update `room_session_participants`.
6. Events: if the previous row had no `first_accepted_at` and now it has one → `problem_solved` (with
   `firstSolver` = no other participant has an earlier `first_accepted_at` for that position). Else if this
   submission is counted and not accepted and the problem is still unsolved → `attempt_failed`. A partial unique
   index on `room_events (session_id, actor_user_id, (payload->>'position')) WHERE type = 'problem_solved'` makes a
   duplicate solve event impossible even if a bug called this twice.

Because results are recomputed from `submissions`, out-of-order judging is handled. Example: two parallel submits
A (created first) and B are judged B then A. A becomes the first accepted, and the time shown is corrected. The
solve was already announced by B, and no second event is sent.

**What counts (summary):**

| Case | Counts? |
|---|---|
| Submit with session id, created in `[started_at, ends_at)`, accepted | yes; time from `started_at` to `created_at` |
| Same, judged after `ends_at` | yes (judge latency is not the participant's fault) |
| Submit with session id after `ends_at` | rejected at submit time (409) |
| Submit before start | impossible (problems hidden, status not live → 409) |
| Same problem solved outside the session (no id) | no; it only affects "Avoid already solved" for later draws |
| Accepted again after the first accepted | ignored for score; shown as attempts count only |
| `compile_error`, `internal_error` | ignored |
| Participant had solved the problem before the session | counts; results show a small "Solved before" marker (fairness, trust-based) |

**Times:** all from the DB clock (`clock_timestamp()` at insert). The client countdown uses `endsAt` and the
`serverNow` value of each state response (offset computed once per response), never the local clock alone.

### 3.5 User-visible behaviour

**Where updates appear:**
- *Session screen* (`/rooms/[roomId]/sessions/[sessionId]`): the scoreboard updates in place (changed cell highlights
  with a 260 ms fade, `motion-safe` only) and the **Activity** feed gets a new line on top. No toasts on this
  screen, because the feed is already in view and duplicate announcements are avoided.
- *Problem page with `?session=`*: toasts (sonner, DESIGN §8.10 placement) and the banner's mini progress
  ("You 1/4 · Leader 2/4"). These are other people's events, not the user's verdict, so DESIGN's "never toast verdicts"
  still holds. The user's own solve is never toasted; their verdict stays in the console.
- *Any other page*: nothing in v1 (no global poller).

**Copy (exact):**

| Event | Toast title | Toast description | Icon / action |
|---|---|---|---|
| `problem_solved` (other) | "alice solved Problem 2 · Coin Change" | "at 23:41 · first to solve it" or "at 31:05 · after 2 wrong attempts" or "at 18:02" | `CircleCheck` success; action "Scoreboard" |
| `attempt_failed` (opt-in) | "bob made an attempt on Problem 3" | — | `CircleDashed` muted |
| `participant_joined` (live only) | "carol joined the session" | — | `UserPlus` info |
| `session_started` (lobby screen → live) | "The session has started" | "4 problems · 90 minutes. Good luck." | action "Open Problem 1" |
| client timer 10 min / 1 min | "10 minutes left" / "1 minute left" | — | `Timer` warning |
| `session_ended` | "Time is up" | "Final results are ready." | action "Results" |
| ≥ 4 events in one batch (reconnect) | "4 updates while you were away" | — | action "Scoreboard" |

Activity feed lines use the same text in the past tense with the time ("23:41 alice solved Problem 2").

**Notification settings** (popover on the session screen and in the banner, `Bell` icon button
"Notification settings"; stored per browser in `localStorage`, wrapped in try/catch):
- Switch **Sound** (default off): a 150 ms 880 Hz sine "tick" via WebAudio on `problem_solved` by others.
- Switch **Browser notifications when this tab is in the background** (default off). Turning it on calls
  `Notification.requestPermission()` (never on page load). If denied: help text "Blocked in your browser
  settings." A notification is shown only when `document.hidden`, with `tag = "rs-<sessionId>-<eventId>"`
  (de-dupe across tabs), title = toast title, body = description, no code.
- Switch **Show failed attempts** (default off).
- Help: "Notifications in background tabs may be delayed by up to a minute."

**Spoilers.** Events and the scoreboard never include code, verdict type or failing test data. Only "solved",
the time and the number of attempts are shown.

---

## 4. Scoring and results

### 4.1 Rules (v1)

- **Primary**: problems solved (desc). **Secondary**: total time (asc) = Σ over *solved* problems of
  `solve_seconds + 300 × wrong_before`. That is a **5-minute penalty per counted wrong attempt before the first accept**
  (owner decision D1). Wrong attempts on unsolved problems add nothing.
- **Ties**: equal solved and equal time → same rank (standard competition ranking 1, 1, 3), listed by username.
- **First solver per problem**: the participant with the earliest `first_accepted_at` (by `created_at`; equal
  timestamps → both marked). Shown with a `Medal` icon and the word "First" (never color alone).
- **Partial results**: the scoreboard is valid at every moment. After the end, while session submissions are still
  judging, a muted line shows "Judging 1 submission… results may still change", and ranks update when it finishes.
- **Participants with zero submits** appear on the scoreboard with 0 and rank, but are excluded from calibration.

### 4.2 What the scoreboard shows

| When | Per cell (participant × problem) | Row |
|---|---|---|
| Lobby | — (participant list only) | username, "Host" badge |
| Live | solved: `CircleCheck` + "23:41" (+ "−1" when wrong attempts); attempted: `CircleDashed` + "−2"; untouched: "—" | rank, username (you: `bg-secondary` + "(you)"), solved, time "1:26:40" |
| Finished | same + "First" marker + "Solved before" marker + **View solution** (if shared, §4.5) | same + final rank |

Screen-reader text per cell, for example: "Problem 2: solved at 23 minutes 41 seconds after 1 wrong attempt, first to solve".

### 4.3 Time format

`mm:ss` under one hour, `h:mm:ss` otherwise, `tabular-nums`. Penalty-inclusive total in the Time column, with a
Tooltip "Includes 5 min per wrong attempt before a solve".

### 4.4 Anti-cheat stance

None. This is a room of friends: trust-based. A participant can paste code, open the catalog or look at hints elsewhere.
Two cheap fairness signals, no enforcement: "Solved before" marker (had an accepted submit for the problem
before `started_at`), and F2 hints are locked for live participants on session problems (if F2 exists: reveal →
409 "Hints are off during a room session"). The help page says this plainly.

### 4.5 Solution sharing after the session (owner decision D2)

- Room setting **Share accepted solutions with members after each session** (`rooms.share_solutions`, default **on**,
  owner can change; shown on the join page: "Accepted solutions in this room are visible to members after each
  session ends.") plus a per-member opt-out (`room_members.share_solutions`, switch on the room's Members tab
  "Show my solutions to this room").
- When the session is **finished** and both flags are true, other members see **View solution** for each solved
  cell. This opens `/rooms/[roomId]/sessions/[sessionId]/solutions/[username]/[position]`, a read-only code viewer
  (language, runtime, memory; no stdout, no failed cases). It is never available during live, and never to non-members.
- Only the `first_accepted_submission_id` of that cell is viewable, nothing else from that user's history.

---

## 5. History and stats

### 5.1 Kept data

Per session: date (`started_at`), duration, host, settings (topics, mix, challenge), problems with snapshot
difficulty and position, participants, per participant × problem: attempts, wrong before accept, first accepted time,
submission id, "solved before". Per participant: solved count, penalty, rank. Events (activity log).
Nothing is aggregated away; leaderboards are computed by query.

### 5.2 Pages

- **Room → Sessions tab** (history): list of finished sessions, newest first, 20 per page. Each row: date
  ("Sat, Oct 24, 2026"), problems as difficulty-tinted titles, participants count, winner(s), "you: 3/4, rank 1".
  Clicking a row opens the session results. Above the list: the open session card (lobby/live) if any. Empty state:
  "No sessions yet" + **New session**.
- **Room → Leaderboard tab**: Select "Last 4 weeks / Last 3 months / All time" (default last 3 months). Table:
  rank, member, sessions played, problems solved, solve rate (solved / offered in sessions played), wins (rank 1),
  average rank. Sorted by problems solved, then solve rate. Footnote: "Counts finished sessions only. People who
  left the room are shown in grey with "(left)"" (history stays, decision §8.6).
- **Member timeline** `/rooms/[roomId]/members/[username]`: header stats (sessions, solved, solve rate per
  difficulty with Progress bars and numbers), then a dated list: "Oct 24 · rank 1 of 3 · solved Valid Anagram
  (6:10), House Robber (24:30, 1 wrong), Coin Change (51:00); not solved: Edit Distance". This directly answers "on a
  given date each participant solved such and such problems".
- **Calibration data**: the same numbers as the lobby panel, read-only, at the bottom of the Leaderboard tab
  ("Room difficulty profile, last 6 sessions").

### 5.3 Retention and export

- Retention: until the room is deleted (cascade). Events stay with their session. Submissions are never deleted by
  rooms (deleting a room sets `submissions.room_session_id` to NULL).
- Export (v1.5): `GET /api/rooms/:roomId/export.csv` (members only), one row per participant × problem:
  `date,session_id,participant,position,problem,difficulty,solved,solve_time_sec,wrong_attempts,attempts,rank`.
  A Markdown variant (`.md`) renders the history list. 5/min in-process limit.

---

## 6. Data model

One additive migration `drizzle/00NN_f6_rooms.sql` (generated by `pnpm db:generate`; `NN` = next free number when
the branch is cut; per FEATURES.md the CLAUDE.md rule "schema only in M1" is amended for F-features). New: 3 enums,
7 tables, 1 nullable column + 1 partial index + 1 CHECK on `submissions`. No drops, no type changes. Every new
table uses `.enableRLS()` with **no policies**, like the existing ones: the app connects as the owner and bypasses
RLS, Supabase's REST roles see nothing. Apply with `DATABASE_URL_DIRECT` (session pooler) as in DEPLOY.md §5.

### 6.1 ER overview

```
users 1─* room_members *─1 rooms 1─* room_sessions 1─* room_session_problems *─1 problems
                                        │  1─* room_session_participants *─1 users
                                        │         1─* room_session_results (session,user,position)
                                        │                    └─ first_accepted_submission_id ─► submissions
                                        │  1─* room_events
submissions.room_session_id ─► room_sessions (ON DELETE SET NULL)
```

### 6.2 Drizzle schema (appended to `src/server/db/schema.ts`)

```ts
import { bigint, foreignKey, smallint, uniqueIndex } from "drizzle-orm/pg-core"; // plus existing imports

export const roomRoleEnum = pgEnum("room_role", ["owner", "member"]);
export const roomSessionStatusEnum = pgEnum("room_session_status", ["lobby", "live", "finished", "cancelled"]);
export const roomEventTypeEnum = pgEnum("room_event_type", [
  "participant_joined", "lobby_updated", "session_started",
  "problem_solved", "attempt_failed", "session_ended", "session_cancelled",
]);

/** Session settings as chosen in the lobby (validated by Zod on write). */
export type RoomSessionSettings = {
  tags: string[];                               // tag slugs, 0..5; [] = any
  mixMode: "suggested" | "manual";
  mix: { easy: number; medium: number; hard: number };  // actual target mix used for the draw
  challenge: "relaxed" | "balanced" | "tough";
  avoidSolved: boolean;
};

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** sha256(token) as 64 hex chars; null = invite link turned off. */
  inviteTokenHash: text("invite_token_hash").unique(),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  shareSolutions: boolean("share_solutions").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  check("rooms_name_length", sql`char_length(${t.name}) BETWEEN 1 AND 60`),
  check("rooms_invite_hash_format", sql`${t.inviteTokenHash} IS NULL OR ${t.inviteTokenHash} ~ '^[0-9a-f]{64}$'`),
  check("rooms_invite_pair", sql`(${t.inviteTokenHash} IS NULL) = (${t.inviteExpiresAt} IS NULL)`),
  index("rooms_created_by_idx").on(t.createdBy, t.createdAt),
]).enableRLS();

export const roomMembers = pgTable("room_members", {
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roomRoleEnum("role").notNull().default("member"),
  shareSolutions: boolean("share_solutions").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.roomId, t.userId] }),
  index("room_members_user_idx").on(t.userId, t.joinedAt.desc()),
  uniqueIndex("room_members_one_owner").on(t.roomId).where(sql`${t.role} = 'owner'`),
]).enableRLS();

export const roomSessions = pgTable("room_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  hostId: uuid("host_id").references(() => users.id, { onDelete: "set null" }),
  status: roomSessionStatusEnum("status").notNull().default("lobby"),
  durationMin: smallint("duration_min").notNull().default(90),
  problemCount: smallint("problem_count").notNull().default(4),
  settings: jsonb("settings").$type<RoomSessionSettings>().notNull(),
  plannedFor: timestamp("planned_for", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endReason: text("end_reason"),                       // 'time' | 'host' | 'cancelled' | 'stale'
  rerolledProblemIds: uuid("rerolled_problem_ids").array().notNull().default(sql`'{}'::uuid[]`),
  rerollCount: smallint("reroll_count").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  check("room_sessions_duration", sql`${t.durationMin} BETWEEN 15 AND 240 AND ${t.durationMin} % 5 = 0`),
  check("room_sessions_count", sql`${t.problemCount} BETWEEN 1 AND 8`),
  check("room_sessions_reroll_cap", sql`${t.rerollCount} BETWEEN 0 AND 30`),
  check("room_sessions_end_reason", sql`${t.endReason} IS NULL OR ${t.endReason} IN ('time','host','cancelled','stale')`),
  check("room_sessions_state", sql`
    (${t.status} = 'lobby'     AND ${t.startedAt} IS NULL AND ${t.endedAt} IS NULL) OR
    (${t.status} = 'live'      AND ${t.startedAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL AND ${t.endedAt} IS NULL) OR
    (${t.status} = 'finished'  AND ${t.startedAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL AND ${t.endedAt} IS NOT NULL) OR
    (${t.status} = 'cancelled' AND ${t.startedAt} IS NULL AND ${t.endedAt} IS NOT NULL)`),
  check("room_sessions_ends", sql`${t.endsAt} IS NULL OR ${t.endsAt} = ${t.startedAt} + make_interval(mins => ${t.durationMin})`),
  // One open session per room.
  uniqueIndex("room_sessions_one_open").on(t.roomId).where(sql`${t.status} IN ('lobby', 'live')`),
  // History, leaderboard, calibration window.
  index("room_sessions_room_finished_idx").on(t.roomId, t.startedAt.desc()).where(sql`${t.status} = 'finished'`),
  // Repeat avoidance: problems used in live/finished sessions (joined via room_session_problems).
  index("room_sessions_room_status_idx").on(t.roomId, t.status),
]).enableRLS();

export const roomSessionProblems = pgTable("room_session_problems", {
  sessionId: uuid("session_id").notNull().references(() => roomSessions.id, { onDelete: "cascade" }),
  position: smallint("position").notNull(),
  // RESTRICT: problems are unpublished, never deleted; history must keep them.
  problemId: uuid("problem_id").notNull().references(() => problems.id, { onDelete: "restrict" }),
  difficulty: difficultyEnum("difficulty").notNull(),    // snapshot at pick time (calibration)
  pinned: boolean("pinned").notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.position] }),
  unique("room_session_problems_unique_problem").on(t.sessionId, t.problemId),
  check("room_session_problems_position", sql`${t.position} BETWEEN 1 AND 8`),
  index("room_session_problems_problem_idx").on(t.problemId),
]).enableRLS();

export const roomSessionParticipants = pgTable("room_session_participants", {
  sessionId: uuid("session_id").notNull().references(() => roomSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  solvedCount: smallint("solved_count").notNull().default(0),
  penaltySec: integer("penalty_sec").notNull().default(0),
  rank: smallint("rank"),                                   // null until first scoring pass
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.userId] }),
  index("room_session_participants_user_idx").on(t.userId, t.sessionId),
  check("room_session_participants_nonneg", sql`${t.solvedCount} BETWEEN 0 AND 8 AND ${t.penaltySec} >= 0 AND (${t.rank} IS NULL OR ${t.rank} >= 1)`),
]).enableRLS();

export const roomSessionResults = pgTable("room_session_results", {
  sessionId: uuid("session_id").notNull(),
  userId: uuid("user_id").notNull(),
  position: smallint("position").notNull(),
  attempts: smallint("attempts").notNull().default(0),
  wrongBeforeAccept: smallint("wrong_before_accept").notNull().default(0),
  firstAcceptedAt: timestamp("first_accepted_at", { withTimezone: true }),
  firstAcceptedSubmissionId: uuid("first_accepted_submission_id")
    .references(() => submissions.id, { onDelete: "set null" }),
  solveSeconds: integer("solve_seconds"),
  solvedBefore: boolean("solved_before").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.userId, t.position] }),
  foreignKey({ columns: [t.sessionId, t.userId],
               foreignColumns: [roomSessionParticipants.sessionId, roomSessionParticipants.userId] }).onDelete("cascade"),
  foreignKey({ columns: [t.sessionId, t.position],
               foreignColumns: [roomSessionProblems.sessionId, roomSessionProblems.position] }).onDelete("cascade"),
  check("room_session_results_solved_pair", sql`(${t.firstAcceptedAt} IS NULL) = (${t.solveSeconds} IS NULL)`),
  check("room_session_results_counts", sql`${t.attempts} >= 0 AND ${t.wrongBeforeAccept} BETWEEN 0 AND ${t.attempts} AND (${t.solveSeconds} IS NULL OR ${t.solveSeconds} >= 0)`),
]).enableRLS();

export const roomEvents = pgTable("room_events", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: uuid("session_id").notNull().references(() => roomSessions.id, { onDelete: "cascade" }),
  type: roomEventTypeEnum("type").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
}, (t) => [
  index("room_events_session_id_idx").on(t.sessionId, t.id),
  uniqueIndex("room_events_one_solve").on(t.sessionId, t.actorUserId, sql`(${t.payload} ->> 'position')`)
    .where(sql`${t.type} = 'problem_solved'`),
  check("room_events_payload_size", sql`octet_length(${t.payload}::text) <= 2048`),
]).enableRLS();

// submissions: new column (inside the existing pgTable definition)
//   roomSessionId: uuid("room_session_id").references(() => roomSessions.id, { onDelete: "set null" }),
// and in its extras:
//   index("submissions_room_session_idx").on(t.roomSessionId, t.userId, t.problemId, t.createdAt)
//     .where(sql`${t.roomSessionId} IS NOT NULL`),
//   check("submissions_room_session_submit_only", sql`${t.roomSessionId} IS NULL OR ${t.kind} = 'submit'`),
//   // if F3 exists: check("submissions_one_session_kind", sql`${t.roomSessionId} IS NULL OR ${t.interviewSessionId} IS NULL`)
```

Notes:
- `rooms.invite_token_hash` uses a plain `UNIQUE` (NULLs are distinct in Postgres, so many rooms can have no link).
- `room_members_one_owner` enforces at most one owner. "Exactly one" is kept by the app: transfer is a single
  transaction (demote, then promote). If the owner's user row is deleted (cascade), the room has no owner. The next
  read promotes the earliest-joined member (lazy repair), and a room with no members is deleted.
- `room_sessions.host_id` is `SET NULL`; the owner can then operate the session.
- Session circular FK (`submissions` → `room_sessions` → … → `room_session_results` → `submissions`): both sides are
  nullable `SET NULL`, so deletes do not deadlock; Drizzle handles forward references via callbacks.
- Lazy stale-lobby rule: a lobby older than 7 days is set to `cancelled` with `end_reason = 'stale'` on the next read.

### 6.3 Migration plan

1. Branch `feature/f6-rooms-core` adds the schema above, then runs `pnpm db:generate` → `drizzle/00NN_f6_rooms.sql`.
   Review the SQL by hand: `CREATE TYPE` ×3, `CREATE TABLE` ×7 with `ENABLE ROW LEVEL SECURITY`,
   `ALTER TABLE submissions ADD COLUMN room_session_id uuid` (nullable, no default, so no table rewrite),
   FK `NOT VALID`-free (the column is empty), the partial index and CHECK. Wrap nothing else.
2. Local: `pnpm db:migrate`, `pnpm test:integration` (new constraint tests, AC-S-DB-*).
3. Production (by the owner, only after explicit go-ahead): `DATABASE_URL_DIRECT=<session pooler> pnpm db:migrate`.
   Then check Supabase Security Advisor: new tables show "RLS enabled, no policy" (expected).
4. Rollback: not required (additive). Emergency: the app ignores the tables if F6 routes are not deployed.

### 6.4 Sample rows: one weekly session

Room **Saturday Algo Club** (`r1`), members alice (owner), bob, carol. Session `s1`, started
2026-10-24 18:00:00Z, 90 min. Problems drawn with the suggested mix 1/2/1 (cold start).

`rooms`: `(r1, 'Saturday Algo Club', '9f2c…e1', 2026-10-31T18:00Z, true, alice, 2026-10-17…)`

`room_members`: `(r1, alice, owner)`, `(r1, bob, member)`, `(r1, carol, member)`

`room_sessions`: `(s1, r1, host=alice, 'finished', 90, 4, {"tags":[],"mixMode":"suggested","mix":{"easy":1,"medium":2,"hard":1},"challenge":"balanced","avoidSolved":true}, started 18:00:00, ends 19:30:00, ended 19:30:00 (lazy close at 19:30:02 sets ended_at = ends_at), 'time', '{}', 1)`

`room_session_problems`:

| position | problem | difficulty | pinned |
|---|---|---|---|
| 1 | valid-anagram | easy | false |
| 2 | house-robber | medium | false |
| 3 | coin-change | medium | true |
| 4 | edit-distance | hard | false |

`submissions` with `room_session_id = s1` (kind submit; times are `created_at`):

| user | P | created | status |
|---|---|---|---|
| bob | 1 | 18:04:00 | accepted |
| alice | 1 | 18:06:10 | accepted |
| carol | 1 | 18:08:00 | wrong_answer |
| carol | 1 | 18:12:00 | accepted |
| alice | 2 | 18:20:00 | wrong_answer |
| alice | 2 | 18:24:30 | accepted |
| carol | 2 | 18:35:00 | accepted |
| bob | 3 | 18:40:00 | accepted |
| bob | 2 | 18:45:00 | compile_error (ignored) |
| bob | 2 | 18:50:00 | wrong_answer |
| alice | 3 | 18:51:00 | accepted |
| alice | 4 | 19:10:00 | time_limit |
| carol | 3 | 19:29:50 | accepted (finalized 19:30:04, after the end: counts) |

`room_session_results` (attempts / wrong before / solve seconds):

| user | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| alice | 1 / 0 / 370 | 2 / 1 / 1470 | 1 / 0 / 3060 | 1 / 1 / — |
| bob | 1 / 0 / 240 | 1 / 1 / — | 1 / 0 / 2400 | (no row) |
| carol | 2 / 1 / 720 | 1 / 0 / 2100 | 1 / 0 / 5390 | (no row) |

`room_session_participants` (solved, penalty_sec, rank):
alice `3, 370+1470+300+3060 = 5200, 1` · carol `3, 720+300+2100+5390 = 8510, 2` · bob `2, 240+2400 = 2640, 3`.
First solvers: P1 bob, P2 alice, P3 bob, P4 none. Scoreboard time column: alice 1:26:40, carol 2:21:50, bob 44:00.

`room_events` (id, type, actor, payload):
`101 participant_joined alice` · `102 participant_joined bob` · `103 lobby_updated {problemCount:4,durationMin:90}` ·
`104 participant_joined carol` · `105 session_started {startedAt,endsAt}` ·
`106 problem_solved bob {position:1,solveSeconds:240,wrongBefore:0,firstSolver:true,solvedCount:1}` ·
`107 problem_solved alice {1,370,0,false,1}` · `108 attempt_failed carol {position:1,attempts:1}` ·
`109 problem_solved carol {1,720,1,false,1}` · `110 attempt_failed alice {2,1}` · `111 problem_solved alice {2,1470,1,true,2}` ·
`112 problem_solved carol {2,2100,0,false,2}` · `113 problem_solved bob {3,2400,0,true,2}` · `114 attempt_failed bob {2,1}` ·
`115 problem_solved alice {3,3060,0,false,3}` · `116 attempt_failed alice {4,1}` · `117 session_ended {reason:'time'}` ·
`118 problem_solved carol {3,5390,0,false,3}`.
(No event for bob's compile error.) Calibration contribution of s1: easy 3/3, medium 5/6, hard 0/3.

### 6.5 Key queries and their indexes

All room reads start with the membership gate **Q0**, often merged into the first query.

| # | Purpose | Query (sketch) | Index used |
|---|---|---|---|
| Q0 | Membership gate | `SELECT role FROM room_members WHERE room_id=$r AND user_id=$u` | PK `(room_id,user_id)` |
| Q1 | My rooms (`/rooms`) | `SELECT r.*, m.role, (SELECT count(*) FROM room_members WHERE room_id=r.id), open session (status in lobby/live) FROM room_members m JOIN rooms r ON r.id=m.room_id WHERE m.user_id=$u ORDER BY m.joined_at DESC` | `room_members_user_idx`; `room_sessions_one_open` |
| Q2 | Room history page | `SELECT s.id,s.started_at,s.problem_count,s.duration_min FROM room_sessions s WHERE s.room_id=$r AND s.status='finished' ORDER BY s.started_at DESC LIMIT 20 OFFSET $o`, then for those ids: participants (`username, solved_count, rank`) and problems (`position, title, difficulty`) in two `WHERE session_id = ANY($ids)` queries | `room_sessions_room_finished_idx`; PKs of participants/problems (prefix `session_id`) |
| Q3 | Per-participant timeline | `SELECT s.id,s.started_at,p.rank,p.solved_count,sp.position,pr.title,sp.difficulty,res.solve_seconds,res.wrong_before_accept FROM room_session_participants p JOIN room_sessions s ON s.id=p.session_id AND s.room_id=$r AND s.status='finished' JOIN room_session_problems sp ON sp.session_id=s.id JOIN problems pr ON pr.id=sp.problem_id LEFT JOIN room_session_results res ON (res.session_id,res.user_id,res.position)=(s.id,p.user_id,sp.position) WHERE p.user_id=$target ORDER BY s.started_at DESC, sp.position LIMIT 200` | `room_session_participants_user_idx`; PKs |
| Q4 | Calibration (last K=6) | `WITH recent AS (SELECT id FROM room_sessions WHERE room_id=$r AND status='finished' ORDER BY started_at DESC LIMIT 6), active AS (SELECT DISTINCT res.session_id,res.user_id FROM room_session_results res JOIN recent ON recent.id=res.session_id WHERE res.attempts>0) SELECT sp.difficulty, count(*) AS pairs, count(res.first_accepted_at) AS solved FROM active a JOIN room_session_problems sp ON sp.session_id=a.session_id LEFT JOIN room_session_results res ON (res.session_id,res.user_id,res.position)=(a.session_id,a.user_id,sp.position) GROUP BY sp.difficulty` | `room_sessions_room_finished_idx`; results PK prefix |
| Q5 | Per-room leaderboard | `SELECT p.user_id,u.username,count(*) sessions,sum(p.solved_count) solved,sum(s.problem_count) offered,count(*) FILTER (WHERE p.rank=1) wins,avg(p.rank) avg_rank FROM room_session_participants p JOIN room_sessions s ON s.id=p.session_id JOIN users u ON u.id=p.user_id WHERE s.room_id=$r AND s.status='finished' AND s.started_at>=$since GROUP BY p.user_id,u.username ORDER BY solved DESC, solved::float/offered DESC` + left join `room_members` for the "(left)" marker | `room_sessions_room_finished_idx`; participants PK |
| Q6 | Event replay by cursor | `SELECT id,type,actor_user_id,u.username,payload,created_at FROM room_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.session_id=$s AND e.id>$cursor ORDER BY e.id LIMIT 101` | `room_events_session_id_idx` |
| Q7 | Repeat avoidance | `SELECT sp.problem_id, max(s.started_at) last_used FROM room_sessions s JOIN room_session_problems sp ON sp.session_id=s.id WHERE s.room_id=$r AND s.status IN ('live','finished') GROUP BY sp.problem_id` | `room_sessions_room_status_idx`; problems PK |
| Q8 | Solved by expected participants | `SELECT problem_id, count(DISTINCT user_id) FROM submissions WHERE user_id = ANY($users) AND kind='submit' AND status='accepted' GROUP BY problem_id` | existing `submissions_user_problem_created_idx` (prefix `user_id`) |
| Q9 | Outcome recompute | `SELECT id,status,created_at FROM submissions WHERE room_session_id=$s AND user_id=$u AND problem_id=$p AND kind='submit' AND status NOT IN ('queued','running') ORDER BY created_at,id` | new `submissions_room_session_idx` |
| Q10 | Pending judging after end | `SELECT count(*) FROM submissions WHERE room_session_id=$s AND status IN ('queued','running')` | `submissions_room_session_idx` (prefix) |
| Q11 | Scoreboard snapshot | participants `WHERE session_id=$s` + results `WHERE session_id=$s` + problems with titles (titles only if status ≠ lobby or viewer is host) | PKs |
| Q12 | Join by invite | `SELECT id,name,invite_expires_at FROM rooms WHERE invite_token_hash=$h` | `rooms_invite_token_hash_key` (unique) |

Query-count targets: state poll without new events ≤ 3 queries (session user, Q0 merged with session read, Q6);
with events +2 (Q11); session page render ≤ 6; history page ≤ 5.

---

## 7. API and pages

### 7.1 Conventions

PLAN §6 / FEATURES §3 check order on every mutating route: (1) `assertSameOrigin()` → 403; (2) `getCurrentUser()` → 401;
(3) `readJsonBody(schema, maxBytes)` → 413/400 (strict Zod objects, body ≤ 4 KB unless stated); (4) field limits
and `\u0000` → 413/400; (5) **resource + membership**: room or session not found **or caller not a member** → 404
(never 403, so existence is not revealed); member without the right role → 403 "Only the room owner can do this" /
"Only the host can do this"; (6) state → 409, rate → 429 + `Retry-After`; (7) write in one transaction. Rejected
requests write nothing. All responses `Cache-Control: no-store`; all routes `dynamic = 'force-dynamic'`.
Ids in paths are validated as uuid (malformed → 404). Room-scoped server code lives in `src/server/rooms/`
(`access.ts` with `requireRoomMember(db, roomId, userId)` and `requireSessionInRoom(db, roomId, sessionId)`, the only
way to load room data).

### 7.2 Endpoints

| Method | Path | Body / query | Auth & checks | Response |
|---|---|---|---|---|
| POST | `/api/rooms` | `{name}` (1–60 chars after trim, no control chars) | user; ≤ 5 owned rooms (409), ≤ 20 memberships (409), 5 creates/hour (DB count on `rooms.created_by`) | 201 `{id}` |
| POST | `/api/rooms/:roomId/rename` | `{name}` | owner | 200 |
| POST | `/api/rooms/:roomId/settings` | `{shareSolutions: boolean}` | owner | 200 |
| POST | `/api/rooms/:roomId/invite` | `{action: "rotate", expiresInDays: 1\|7\|30}` or `{action: "disable"}` | owner; 20 rotations/day (in-process) | 200 `{url, expiresAt}` (the only time the token is returned) / 200 `{}` |
| POST | `/api/rooms/join` | `{token}` (43-char base64url) | user; 20 attempts/hour/user (in-process, soft); unknown/expired → 404 "This invite link is invalid or has expired"; already member → 200 (idempotent); room full (20) → 409 | 200 `{roomId}` |
| POST | `/api/rooms/join/preview` | `{token}` | user; same limits | 200 `{name, memberCount, memberNames (≤ 5), shareSolutions}` |
| POST | `/api/rooms/:roomId/leave` | `{}` | member; owner with other members → 409 "Transfer ownership first"; last member → deletes the room | 200 |
| POST | `/api/rooms/:roomId/members/:userId/remove` | `{}` | owner; not self | 200 |
| POST | `/api/rooms/:roomId/members/:userId/make-owner` | `{}` | owner | 200 |
| POST | `/api/rooms/:roomId/members/me/settings` | `{shareSolutions: boolean}` | member | 200 |
| POST | `/api/rooms/:roomId/delete` | `{confirmName}` (must equal name) | owner | 200 |
| POST | `/api/rooms/:roomId/sessions` | `{problemCount?, durationMin?, tags?, mixMode?, mix?, challenge?, avoidSolved?, plannedFor?}` | member; open session exists → 409 `{code:"session_open", sessionId}`; 10 creates/hour/room (DB count) | 201 `{id, lobby}`; draw errors return 201 with `lobby.drawError` (lobby exists, slots partly empty) |
| POST | `/api/rooms/:roomId/sessions/:sid/draw` | same settings | host/owner; status lobby (409) | 200 `{lobby}` or 409 `{code:"pool_too_small"\|"mix_infeasible", counts}` |
| POST | `/api/rooms/:roomId/sessions/:sid/slots/:pos/reroll` | `{}` | host/owner; lobby; cap 30 (409) | 200 `{lobby}` |
| POST | `/api/rooms/:roomId/sessions/:sid/slots/:pos/pin` | `{slug}` / `{unpin: true}` | host/owner; lobby; published slug (404); duplicate (409) | 200 `{lobby}` |
| GET | `/api/rooms/:roomId/sessions/:sid/problem-search?q=` | q 1–60 chars | host/owner | 200 `[{slug,title,difficulty,tags}]` (≤ 10) |
| POST | `/api/rooms/:roomId/sessions/:sid/join` | `{}` | member; status lobby or live and `now < ends_at` (409 "The session has ended"); idempotent | 200 |
| POST | `/api/rooms/:roomId/sessions/:sid/start` | `{}` | host/owner; lobby; all N slots filled & published (409 with the slot); ≥ 1 participant | 200 `{startedAt, endsAt}` |
| POST | `/api/rooms/:roomId/sessions/:sid/end` | `{}` | host/owner; live (idempotent if finished) | 200 |
| POST | `/api/rooms/:roomId/sessions/:sid/cancel` | `{}` | host/owner; lobby only (live → 409 "End the session instead") | 200 |
| GET | `/api/rooms/:roomId/sessions/:sid/state?after=<cursor>` | cursor = decimal string | member; 120 req/min/user (in-process soft limit → 429 `Retry-After: 5`) | 200 `{serverNow, status, endsAt, cursor, events[], hasMore, snapshot?, pendingJudging}` |
| POST | `/api/problems/:slug/submit` (existing) | + optional `roomSessionId` | §3.4 validation | 202 `{id}` |
| GET | `/api/rooms/:roomId/sessions/:sid/solutions/:userId/:pos` | — | member; finished; both share flags; cell solved | 200 `{language, code, runtimeMs, memoryKb}` |
| GET | `/api/rooms/:roomId/export.csv` (v1.5) | — | member; 5/min | CSV |

The `state` response includes `snapshot` when `after` is missing/invalid, when any event was returned, or every
10th poll (self-healing). Snapshot = `{session:{status,startedAt,endsAt,durationMin,problemCount}, problems:[{position,
slug?,title?,difficulty,tags}], participants:[{userId,username,isHost,solvedCount,penaltySec,rank,cells:[{position,
attempts,wrongBefore,solveSeconds,firstSolver,solvedBefore}]}]}`. `slug/title` are omitted in the lobby for non-hosts.

**Rate-limit caveat:** the FEATURES in-process limiter (`src/server/http/rate-limit.ts`) is per instance; on Vercel
with several instances it is a soft cap. Limits that matter for abuse (room/session creation) use DB counts.

### 7.3 Session state machine

```
           create (member)                start (host/owner, slots valid, ≥1 participant)
  (none) ───────────────► LOBBY ─────────────────────────────────────────► LIVE
                            │  cancel (host/owner) or 7 days stale                │ now ≥ ends_at (lazy) │ end (host/owner)
                            ▼                                                     ▼                      ▼
                        CANCELLED                                             FINISHED ◄─────────────────┘
```

Lazy close: every request touching a live session (state poll, submit validation, page render, join) runs
`closeIfExpired(tx, sessionId)` under the session advisory lock: `UPDATE room_sessions SET status='finished',
ended_at=ends_at, end_reason='time' WHERE id=$s AND status='live' AND now() >= ends_at` and, if a row changed,
appends `session_ended`. There is no cron. If nobody looks, the session finishes on the next visit, with
`ended_at = ends_at` (correct time). Submissions already created before `ends_at` still finalize and score afterwards.

### 7.4 Pages (App Router)

All in `(site)` except the problem page integration in `(workspace)`. Pages call `requireUser(path)` then
`requireRoomMember`; a non-member gets `notFound()` (global 404 page). Per DESIGN §11.2: no route-level `loading.tsx`
on these pages (they redirect/404); use `<Suspense fallback={<PageSkeleton/>}>` after the checks.

| Route | Content |
|---|---|
| `/rooms` | PageHead "Rooms", subtitle "Private rooms for solving problems with friends." Grid of **RoomCard** (name, member avatars ×5 + "+3", "Live now · 47 min left" / "Lobby open" / "Last session Oct 24"). Primary **New room** (Dialog with name field). Empty: EmptyState "No rooms yet" body "Create a room and send the invite link to your friends." + **New room**. Header nav gains "Rooms" for signed-in users. |
| `/rooms/join` | Client page reading the fragment token: Card "Join Saturday Algo Club?" members preview, sharing notice, **Join room** / **Cancel**; guest: **Log in** / **Sign up** with `next=/rooms/join`; error state Alert danger with the invalid-link copy. `Referrer-Policy: no-referrer`. |
| `/rooms/[roomId]` | PageHead (breadcrumb Rooms › name, H1 name, "3 members"), open-session Card on top (Lobby: "Session open · 4 problems · 90 min · 2 joined" **Open lobby**; Live: countdown + **Open session**; none: **New session**). Tabs **Sessions** (history, §5.2), **Leaderboard**, **Members** (list with role Badge, joined date, owner actions in a DropdownMenu; **InviteLinkCard**; **Leave room**; "Show my solutions to this room" switch; owner: room sharing switch, rename, delete in a "Danger zone" Card). Tab in URL `?tab=`. |
| `/rooms/[roomId]/sessions/[sessionId]` | One route, three states (below). |
| `/rooms/[roomId]/sessions/[sessionId]/solutions/[username]/[position]` | Read-only code viewer (same component as `/submissions/[id]` code block), header "alice · Problem 2 · House Robber · Python 3 · 41 ms". 404 unless finished + shared. |
| `/rooms/[roomId]/members/[username]` | Member timeline (§5.2). 404 if the username never participated and is not a member. |
| `(workspace)/problems/[slug]?session=<id>` | Problem page + **SessionBanner** (below). |

**Session screen: Lobby.** Two columns ≥ lg (`grid-cols-[1.4fr_1fr] gap-6`), stacked below.
Left (host): **SessionSettingsForm** (Problems stepper 1–8, Duration Select 30/45/60/75/90/120/150/180 min or custom
15–240 step 5, Topics multi-select of tags with counts, Difficulty "Suggested / Custom" RadioGroup + three steppers,
Challenge Select, Switch "Avoid problems someone has already solved", optional "Planned for"), **CalibrationPanel**
(§2.3 copy, numbers table), **SlotList** (rows: "Problem 1", DifficultyBadge, tags, title (host only), notes
"Used Oct 3", buttons **Re-roll** (icon `Dices`, Tooltip), **Pin** (`Pin`, opens a Dialog with search),
**Unpin**), **Re-roll all**, primary **Start session**. Non-host left side: the same slots read-only without titles
("Titles are revealed when the session starts"). Right: participants list ("Joined: alice (Host), bob"),
**Join session** / "You're in", invite hint for members not joined, **Cancel session** (host, AlertDialog).

**Session screen: Live.** Top band (`bg-surface-sunken border-b`): H1 "Session · Oct 24", **Countdown** (serif
numerals 30/36 per DESIGN §5 display usage, `role="timer"`, `aria-label="Time left: 47 minutes 12 seconds"`; warning
token text when < 10 min plus the word "left"), **NotificationSettings** button, host **End session**.
Body ≥ lg: left column **ProblemList** (rows: "1", title link → `/problems/<slug>?session=<id>`, DifficultyBadge,
your status icon + word "Solved 23:41" / "Attempted" / "Not started", **Open** button); right column **Scoreboard** +
**ActivityFeed** (`role="log"`, `aria-live="polite"`, newest on top, max 50 lines, "Show earlier"). Below lg: Tabs
**Problems | Scoreboard | Activity**, countdown sticky under the header (h-12).

**Session screen: Finished.** Band "Finished · Oct 24, 18:00–19:30 · 3 participants", optional "Judging 1
submission…" Alert (info). Final **Scoreboard** with First/Solved-before markers and **View solution** links,
per-problem summary list ("Problem 2 · House Robber · solved by 2 of 3 · first: alice 24:30"), buttons
**New session** and (v1.5, F1) "Add unsolved problems to my review queue". Cancelled: EmptyState "This session was
cancelled" + **Back to room**.

**Error / edge states:** polling `gone` → Alert danger "You no longer have access to this room." + link /rooms;
"Reconnecting…" muted inline indicator with `LoaderCircle` (static under reduced motion); session not found → 404.

**SessionBanner (problem page).** A 40px strip between the compact header and the workspace canvas
(`bg-info-bg border-b text-sm`, icon `Users`): "**Saturday Algo Club** · Problem 2 of 4 · 47:12 left · You 1/4 ·
Leader 2/4" + links "Session" (back) and prev/next problem chevrons (`aria-label="Problem 1"`), + NotificationSettings.
States: participant & live → as above, Submit carries `roomSessionId`; member not participant → "You haven't joined
this session" + **Join**; finished → "Session finished · submissions no longer count" + "Results" (Submit normal);
invalid/not member → no banner (normal page). Mobile (<768): banner wraps to two lines (`h-auto py-2`), still above the
Description/Code tabs; the fixed bottom action bar is unchanged. The page-level `workspace.tsx` height calc subtracts the
banner height (`h-[calc(100dvh-52px-40px)]`). The submit client (`startSubmit`) gets `roomSessionId` in its body;
on 409 "session ended" the console shows Alert warning "The session has ended; this submission would not count."
with **Submit anyway (won't count)**. F2 hints accordion: rendered as locked ("Hints are off during the session")
for live participants.

**New components** (`src/components/rooms/`): `room-card.tsx`, `invite-link-card.tsx` (read-only Input + Copy
button with `aria-live` "Copied", expiry text, rotate/disable), `session-status-badge.tsx` (dictionary
`session-status.ts`: Lobby `Clock` muted, Live `Radio` info, Finished `Flag` outline, Cancelled `Ban` muted; always
word + icon), `countdown.tsx`, `session-settings-form.tsx`, `calibration-panel.tsx`, `slot-list.tsx`,
`problem-search-dialog.tsx`, `scoreboard.tsx` (+ mobile card list), `scoreboard-cell.tsx`, `activity-feed.tsx`,
`session-banner.tsx`, `notification-settings.tsx`, `room-leaderboard.tsx`, `member-timeline.tsx`. New ui primitives
needed (add via shadcn in the same branch, themed per DESIGN): `ui/switch.tsx`, `ui/popover.tsx`, `ui/radio-group.tsx`
(F1 may add it first), `ui/checkbox.tsx` if used. DESIGN.md gets a new §9.9 "Rooms" and §8.10 amendment ("Room
toasts: other people's events on the problem page only") in the same branch.

**Accessibility:** one h1 per page; scoreboard is a real `<table>` with `<caption class="sr-only">Scoreboard</caption>`,
row headers = participant; cell icons `aria-hidden` + sr-only text (§4.2); first-solver and solved-before markers have
words; the countdown announces only at 10 and 1 minutes left via a separate sr-only `aria-live="polite"` region (not
every second); ActivityFeed is the single live region on the session screen; on the problem page, sonner's toasts are
the announcement (**verify** sonner's region politeness with VoiceOver/NVDA; if it is assertive, set it to polite);
all icon buttons have `aria-label` + Tooltip; Re-roll/Pin keyboard reachable; focus moves to the slot after re-roll
with an sr-only "Problem 2 re-rolled" message; color never the only signal. axe 0 serious/critical in both themes.

---

## 8. Security and abuse

1. **Invite token**: 32 random bytes (`crypto.randomBytes`) → base64url (43 chars, 256 bits). Only
   `sha256(token)` hex is stored; the plaintext is shown once to the owner (and can always be rotated). Expiry
   1/7/30 days (default 7); rotation and disabling take effect immediately. The link uses a **URL fragment**
   (`/rooms/join#<token>`). Fragments are not sent to the server, so the token never lands in Vercel request logs,
   `next=` query strings or `Referer`. The client POSTs it in a JSON body. The join page sets `Referrer-Policy:
   no-referrer` and loads no third-party resources. Brute force against 256 bits is infeasible; the attempt
   limit is hygiene. Lookup is by hash equality (no timing-sensitive string compare of secrets).
2. **Membership on every read and write**: `requireRoomMember` / `requireSessionInRoom` in every route and page;
   all session queries filter by `room_id` from the path *and* verify the session belongs to it (IDOR: a member of
   room A asking for a session of room B with A's roomId gets 404). Non-members get 404 everywhere, including
   solutions, timelines and exports.
3. **Submit context**: `roomSessionId` is validated server-side (membership, participation, problem in session,
   window inside the insert transaction). A forged id writes nothing (404/409/400).
4. **Spoilers**: titles hidden from non-hosts in the lobby (API omits them); no code, verdict types or test data in
   events/snapshots; solutions only after finish and with both consent flags; F2 hints locked for live participants.
5. **Rate limits**: rooms 5/h/user (DB), sessions 10/h/room (DB), re-rolls 30/session (DB column), invite rotation
   20/day, join 20/h/user, state polling 120/min/user (in-process soft); existing submit limits unchanged.
6. **Input limits**: names 1–60 chars, trimmed, no `\p{Cc}`, rendered as text only; tags ≤ 5 known slugs; counts and
   durations bounded by Zod and DB CHECKs; bodies ≤ 4 KB; problem search q ≤ 60; payload CHECK ≤ 2 KB.
7. **Privacy of history**: rooms data never appears on public `/u/[username]` or in any public page; usernames
   shown only to co-members. Leaderboard and timelines are member-only.
8. **Removal / leaving**: access ends immediately (next poll → 404 → "You no longer have access"). Their past
   participant and result rows stay in the room's history (shown with "(left)"), so the group's record stays intact.
   Their solutions stop being viewable (membership is required for the share flag to apply). A removed member
   who is a live participant: further session submits are rejected (membership check); their score so far remains.
   Account deletion (no UI today) cascades and removes their rows.
9. **Roles**: owner-only actions return 403 for members (they already know the room exists). Ownership transfer and
   the one-owner index prevent two owners.
10. **CSRF**: unchanged model (SameSite=Lax cookie + `assertSameOrigin` + JSON content type on all POSTs). GETs have
    no side effects except lazy close, which is idempotent and only moves time-based state forward.

---

## 9. Acceptance criteria, tests, modules, risks

### 9.1 Acceptance criteria

**Data model**
- AC-S-DB-1 `pnpm db:migrate` applies `00NN_f6_rooms.sql` on a DB at the current head; `drizzle-kit` reports no drift;
  every new table has RLS enabled and no policies (integration: `pg_class.relrowsecurity` true, `pg_policies` empty).
- AC-S-DB-2 Constraints (integration, each a test): second owner → unique violation; second open session per room →
  violation; `duration_min=17` or `problem_count=9` → CHECK; inconsistent status/timestamps → CHECK; `ends_at ≠
  started_at + duration` → CHECK; result with `first_accepted_at` but null `solve_seconds` → CHECK; duplicate
  `problem_solved` event for (session, user, position) → violation; `room_session_id` on a `run` → CHECK; deleting a
  room cascades sessions/results/events and sets `submissions.room_session_id` NULL; deleting a problem used in a
  session → restrict error.
- AC-S-DB-3 Sample rows of §6.4 load via factories and Q2–Q6 return the documented numbers (fixture test).

**Selection**
- AC-S-SEL-1 `computeCalibration` unit tests reproduce Examples A–C rates to 4 decimals; participants without judged
  submits are excluded; `compile_error`/`internal_error` excluded.
- AC-S-SEL-2 `suggestMix` reproduces Examples A (1/2/1), B (1/3/0), C (0/2/2) and returns the next feasible mix when
  hard availability = 1; tie-break order is deterministic (table-driven test of all 15 mixes for N=4).
- AC-S-SEL-3 `drawSlots` with a seeded RNG: tier A before B before C; B ordered by solver count; C oldest first;
  `avoidSolved=false` merges A/B; pinned slots untouched by re-roll-all; re-rolled problems excluded until the
  difficulty is exhausted, then the notice is returned.
- AC-S-SEL-4 Pool smaller than N → `pool_too_small` with counts; manual mix exceeding availability → `mix_infeasible`
  with counts; no silent substitution (unit + API 409 test).
- AC-S-SEL-5 API: re-roll #31 → 409; pin duplicate → 409; pin unpublished/unknown → 404; non-host member draw → 403.

**Scoring & outcome**
- AC-S-SCO-1 Unit (pure `scoreSession`): §6.4 data → ranks alice 1, carol 2, bob 3, penalties 5200/8510/2640; ties
  get equal rank (1,1,3); compile errors ignored; wrong attempts after the accept ignored.
- AC-S-SCO-2 Integration (real DB, stub executor through `finalize()`): accepted session submit → results row,
  participant totals and exactly one `problem_solved` event in the same transaction; calling `finalize()` twice for
  the same id → second returns false, no new rows/events.
- AC-S-SCO-3 Out-of-order: submissions A (created first) and B both accepted, finalized B then A → `first_accepted`
  = A, `solve_seconds` from A, one `problem_solved` event.
- AC-S-SCO-4 Submit created before `ends_at` and finalized after → counts and an event is emitted after `session_ended`;
  submit with `roomSessionId` after `ends_at` → 409 and no row; same problem without `roomSessionId` during live →
  202, no results change.
- AC-S-SCO-5 Concurrency: 2 users × 2 accepted submits finalized in parallel (4 concurrent `finalize` calls) →
  event ids for the session strictly increase in commit order (reader polling with cursor during the test sees no
  gap: compare final list with union of polled batches).

**Rooms & invites**
- AC-S-INV-1 Create room → creator is owner; 6th owned room → 409; name "" / 61 chars / with `\u0000` → 400.
- AC-S-INV-2 Invite rotate returns a 43-char token once; DB stores only a 64-hex hash; old token after rotation →
  404; expired token → 404 (time moved via DB helper); disabled → 404; join is idempotent; the 21st member → 409.
- AC-S-INV-3 Owner leave with members → 409; last member leave deletes the room; remove member → their next state
  poll → 404; make-owner swaps roles atomically.
- AC-S-INV-4 E2E: guest opens `/rooms/join#<token>` → Sign up → lands on the join confirmation (token survived via
  sessionStorage) → Join → room page; server logs/request URLs in the test contain no token string.

**Sessions & events**
- AC-S-SES-1 Lifecycle: create (lobby, auto-join host) → join (member) → start (startedAt/endsAt set,
  `session_started` event) → lazy finish after `ends_at` on the next state poll (`ended_at = ends_at`,
  `session_ended` once even with 5 parallel polls) → cancel on live → 409; second open session → 409.
- AC-S-SES-2 State endpoint: no cursor → snapshot + latest cursor; `after=<cursor>` → only newer events; 150 events
  → pages of 100 with `hasMore`; lobby snapshot for non-host has no titles/slugs (assert on JSON); 121st poll in a
  minute → 429 with `Retry-After`.
- AC-S-SES-3 Submit validation: non-member session id → 404; member not participant → 409; problem not in session →
  400; both `roomSessionId` and `interviewSessionId` (if F3) → 400; rejected submits write no rows.

**UI / live flow**
- AC-S-UI-1 Playwright, two browser contexts (alice host, bob), real worker (Docker) locally: alice creates room,
  bob joins via link, alice creates session with 2 problems / 30 min, starts; bob opens Problem 1 via the banner link
  and submits a correct solution; within 6 s alice's session screen shows bob's solved cell and an Activity line
  "bob solved Problem 1"; alice on a problem page sees the toast "bob solved Problem 1 · <title>".
- AC-S-UI-2 E2E: test hook sets `ends_at` to now+5 s → both screens switch to Finished, Results shown, banner on the
  problem page says submissions no longer count; a submit through the UI shows the "would not count" Alert.
- AC-S-UI-3 Notification settings: sound/browser toggles persist in localStorage; with permission granted (Playwright
  `context.grantPermissions(['notifications'])`) and the page hidden (emulated), a `Notification` is constructed with
  the expected title (spy); without a click, `requestPermission` is never called.
- AC-S-UI-4 Mobile 360 px: lobby, live (tabs Problems/Scoreboard/Activity) and banner have no horizontal scroll; tap
  targets ≥ 40 px (Playwright check of bounding boxes).
- AC-S-UI-5 Empty/loading/error states exist for `/rooms`, room page tabs, session states; "gone" state appears
  after removal during a live session (e2e).

**Security & privacy**
- AC-S-SEC-1 For every room GET/POST route: a signed-in non-member gets 404 with a body identical to unknown id;
  cross-room session id → 404 (table-driven integration test over all routes).
- AC-S-SEC-2 Solutions endpoint: live session → 404; finished but room sharing off → 404; member opt-out → 404; other
  cell than first accepted not reachable.
- AC-S-SEC-3 `/u/[username]` HTML contains no room names or session data (integration render test).
- AC-S-SEC-4 Negative-case table per mutating route: 403 (Content-Type/Origin), 401, 400 (extra keys, bad uuid,
  out-of-range numbers), 413 (> 4 KB), 429 where limited; each writes nothing.

**History & stats**
- AC-S-HIS-1 History tab lists finished sessions newest first with problems and per-member solved counts (fixture of
  3 sessions); member timeline shows "solved X (mm:ss)" per date matching §6.4; leaderboard numbers match Q5 by hand.
- AC-S-HIS-2 Query-count tests: state poll without events ≤ 3 queries; session page ≤ 6; history ≤ 5.

**A11y**
- AC-S-A11Y-1 axe 0 serious/critical on `/rooms`, room page (3 tabs), lobby, live, finished, problem page with banner,
  both themes. Scoreboard cells expose sr text per §4.2; ActivityFeed has `role="log"`; countdown announces only at
  10 and 1 minutes (component test with fake timers).

### 9.2 Test plan

- **Unit (Vitest)**: `computeCalibration`, `suggestMix`, `drawSlots` (seeded RNG; Examples A–D as table tests),
  `scoreSession` (§6.4 + ties), time formatting, Zod schemas, event-source polling scheduler (fake timers:
  intervals per state, backoff, 429, de-dupe, visibility change), notification decision function (hidden + enabled
  + type opt-in).
- **Integration (Vitest, real Postgres)**: constraints, all API routes (membership matrix), `finalize()` →
  `applySessionOutcome` with the existing stub-executor queue harness (AC-M4-4 pattern), idempotency, out-of-order,
  concurrency/cursor gap test, lazy close races, invite hashing/expiry.
- **E2E (Playwright)**: two contexts (AC-S-UI-1/2), guest join flow, removal during live, mobile viewport; requires the
  local Docker worker as in AC-M7-1.
- **A11y**: axe on all new pages and states in both themes.

### 9.3 Dependency on the production judge

Run/Submit only work where a judge worker runs. Today that is a host with Docker (`pnpm worker`). On Vercel nothing
picks up queued submissions (DEPLOY.md §7), so in production **no one can solve anything, so no solved events
and no scores**. Rooms, invites, lobbies, history pages and the timer still work. The live value of F6 in
production depends on the PLAN §13 executor decision (Vercel Sandbox executor or a small VPS worker). That executor
must finalize through `finalize()` (§3.4), which is the only integration point. Meanwhile:
- develop and demo locally with `pnpm dev:all` (web + Docker worker), several browser profiles as friends;
- integration tests use the existing stub executor through the real `finalize()` path (no user code runs; PLAN's
  "user code only in Docker" rule is respected because nothing executes);
- an optional test-only DB helper `markSubmissionFinal(id, status)` (tests/helpers, never shipped) for UI tests that
  do not need the judge;
- a production preview can run the web on Vercel against Supabase while a laptop worker points at the same
  `DATABASE_URL_DIRECT`. This is possible, but only with the owner's go-ahead, since it runs a worker against production data.

### 9.4 Implementation modules (order and sizes)

| # | Module / branch | Content | Depends on | Size |
|---|---|---|---|---|
| R1 | `feature/f6-rooms-core` | Migration + schema (§6), factories in `tests/helpers/db.ts`, pure `selection.ts` + `scoring.ts` with unit tests, `access.ts` helpers | — | M |
| R2 | `feature/f6-rooms-membership` | Rooms/invite/join/leave/remove/transfer/settings APIs, `/rooms`, `/rooms/join`, room page shell with Members tab, header nav item, InviteLinkCard | R1 | M |
| R3 | `feature/f6-room-sessions` | Session lifecycle APIs (create/draw/reroll/pin/join/start/end/cancel), lazy close, `state` endpoint, events, submit `roomSessionId`, `finalize()` transaction + `applySessionOutcome`, F2 hint lock hook | R1, R2 | L |
| R4 | `feature/f6-room-live-ui` | Session screen (lobby/live/finished), Scoreboard, ActivityFeed, Countdown, polling `RoomEventSource`, toasts, sound, browser notifications, SessionBanner on the problem page, DESIGN.md §9.9 | R3 | L |
| R5 | `feature/f6-room-history` | Sessions history tab, Leaderboard, member timeline, solutions viewer, calibration read-out; v1.5 export | R3 (R4 for shared components: Scoreboard) | M |

Order: R1 → R2 → R3 → (R4 ∥ R5; R5 starts after R4's Scoreboard lands or builds its own read-only table). Every
implementer reads `PLAN.md`, `CLAUDE.md`, `FEATURES.md` §3 and this file first; reviewer + tester per PLAN §11;
AC table `AC-ID → pass/fail → how`.

### 9.5 Risks and open questions (with recommendation)

| Risk / question | Recommendation |
|---|---|
| Production judge missing → feature is mostly cosmetic in prod | Ship F6 after (or together with) the PLAN §13 executor; dev/test locally meanwhile (§9.3). |
| Catalog of 20 problems is exhausted by a weekly room in about 5 weeks (hard: 3 problems) | Accept repeats with visible notes (tier C); add problems over time; owner decision D3 on "avoid already solved". |
| Polling cost/latency | 3 s live interval ≈ 14k tiny requests/session for 8 people; check the owner's Vercel plan quotas (**verify**). The swap to a broadcast poke is contained (§3.2). |
| Background-tab throttling delays notifications | Documented in settings; Web Push in v2 if the friends complain. |
| `finalize()` becomes a transaction with extra work | Only for session submits; normal submits keep the one-statement path. Test for no regression in AC-M4-4. |
| Advisory lock contention per session | ≤ 20 participants, a few submits/min: negligible. |
| Clock: `created_at` uses `clock_timestamp()` at insert, `ends_at` from DB `now()` at start | Both DB clocks; single DB, no skew. |
| Priors/λ/K are judgement calls | Constants in one file, shown transparently in the panel; revisit after 6 real sessions. |
| Sonner live-region behaviour unverified | Verify with a screen reader in R4; adjust politeness if needed. |
| Supabase Realtime auth with the new key system unverified | Not used in v1; spike in v2 before committing. |
| F3/F2/F1 not yet implemented | F6 does not require them; hooks are conditional (hint lock if F2 exists, CHECK if F3 exists, review button if F1 exists). |
| Users can be in several rooms with overlapping live sessions | Allowed; the explicit session id on Submit removes ambiguity. |

---

## 10. What to show the owner first

1. Rooms are private friend groups. You join with an invite link (expires, can be replaced). Only members see anything.
2. Weekly session: **New session** → 4 problems, 90 min by default → lobby → host presses **Start**.
3. Problems are drawn at random from the chosen topics. The difficulty mix comes from your room's real results
   (people who submitted, last 6 sessions), and the panel shows the numbers, e.g. "Hard: 0 of 12 solved →
   1 Easy · 3 Medium · 0 Hard". The host can override, re-roll a problem or pin one.
4. Problems already used in the room, or already solved by someone, are avoided while possible. With 20 problems,
   repeats start after about 5 weeks, and the lobby says so.
5. Everyone solves on their own. When a friend solves a problem you see it within about 3 s: scoreboard tick, activity line,
   toast on the problem page, optional sound and browser notification. No code is shown during the session.
6. Score = solved count, then time (+5 min per wrong attempt before solving).
7. History: every session with date, problems and who solved what and when; a room leaderboard; a timeline per friend.
8. Limitation: solving needs the judge. In production on Vercel it does not run yet (PLAN §13). Until then it works locally.

**Decisions for the owner**
- **D1 Scoring penalty**: 5 min per wrong attempt before solving (recommended, rewards care) / no penalty
  (solved count, then time only).
- **D2 Solutions after the session**: visible to room members by default with a per-person opt-out (recommended,
  good for discussing) / never shown / opt-in per person.
- **D3 "Avoid problems someone already solved"**: on by default (recommended; fewer "I've seen this" problems, but
  repeats within the room come sooner with 20 problems) / off by default (only avoid problems used in the room).
