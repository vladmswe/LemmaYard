# Rooms: LeetCode problems (external, honor-system slots)

Date: 2026-10-18. Status: built on `feature/rooms-external-problems`. Extends `docs/specs/rooms-v2.md`; everything
not mentioned here works as in v2.

## 0. Summary

The owner wants sessions to include LeetCode problems. Our judge cannot check them, and we must not fetch anything
from leetcode.com (terms of service, copyright). So a LeetCode problem in a room is **a link plus an honor-system
result**: participants open it on leetcode.com in a new tab and mark it solved themselves.

- **Room LeetCode list ("bank")**, managed in Settings → *LeetCode problems*: the owner adds, edits and removes
  entries; every member can read them.
- **Sessions** can mix our problems and LeetCode problems (1–8 slots in total, as before). The host adds a LeetCode
  slot in the lobby from the room list or by pasting a link (optionally saving it to the list).
- **Results**: during the live session a participant marks a LeetCode slot *solved* (and can undo while the session
  is live). The time is server time since the start. These cells carry a visible **self-reported** marker.
- **Scoring** treats a self-reported solve like a verified one (solved count, time, rank, ★ First), and every place
  that shows such a session says it "includes self-reported LeetCode problems".
- **Ratings** ignore LeetCode problems completely. A session with only LeetCode problems is unrated.
- **Auto-pick** (`docs/specs/leetcode-integration.md`, built later): the draw can fill the LeetCode slots from a
  committed catalog. Still nothing is fetched from leetcode.com. Slots the draw picked are listed in
  `settings.leetcodeAutoSlugs` (re-picked by the next draw, re-rollable); every other LeetCode slot was picked by
  hand and stays. LeetCode rows keep `pinned = false` (the CHECK below requires it).

## 1. Data

### 1.1 Bank: `room_external_problems` (migration `0005_rooms_external_problems.sql`)

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `room_id` | uuid → rooms ON DELETE CASCADE | |
| `slug` | text | `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–100 chars; unique per room |
| `title` | text | 1–100 chars, no control or bidi-override characters; default = Title Case of the slug |
| `difficulty` | `difficulty` enum, nullable | optional, owner-entered |
| `rating` | smallint, nullable | optional, owner-entered, 0–4000, **display only** |
| `added_by` | uuid → users ON DELETE SET NULL | |
| `created_at`, `updated_at` | timestamptz | |

At most 100 entries per room (409 beyond). RLS enabled, no policies (like every table). Only the slug is stored;
the URL `https://leetcode.com/problems/<slug>/` is built when rendering. We never store or render an arbitrary URL.

### 1.2 Session slots

External slots live in `room_session_problems` next to internal ones, so results, scoring, events, history and
member stats keep working on one table:

- `problem_id` and `difficulty` become nullable. New columns `external_problem_id` (→ bank, ON DELETE SET NULL),
  `external_slug`, `external_title`, `external_rating`: a **snapshot** taken when the slot is filled, so editing or
  removing a bank entry never changes history.
- CHECK `room_session_problems_kind`: exactly one of `problem_id` / `external_slug`; an internal slot has a
  difficulty and no external fields; an external slot has a valid slug and title. Unique `(session_id,
  external_slug)` for external slots.
- **External slots are always the last positions.** `settings.external = E` (0..8, absent = 0) reserves positions
  `N − E + 1 … N`; internal problems keep positions `1 … N − E`, so the rating ladder (warm-up → stretch), the
  problem page banner (prev/next by slug) and pins are unchanged. A reserved position without a row is an empty
  LeetCode slot ("Pick a LeetCode problem"); Start needs every slot filled.

### 1.3 Results

A self-reported solve is a `room_session_results` row with `attempts = 1`, `wrong_before_accept = 0`,
`first_accepted_at = clock_timestamp()`, `solve_seconds = floor(now − started_at)`, no submission id. Undo deletes
the row. The judge's `finalize()` never touches external positions (it finds slots by `problem_id`).

## 2. URL validation (`src/lib/rooms/external.ts`, pure, shared by client and server)

Accepted: `https://leetcode.com/problems/<slug>` with an optional trailing `/`, optional extra lowercase path
segments (`/description/`, `/submissions/`), an optional query and fragment; all of that is dropped. Scheme and host
are matched case-insensitively; the slug must be lowercase `[a-z0-9-]`, 1–100 chars, no leading/trailing/double
hyphens. Input is trimmed, at most 300 characters.

Rejected (unit-tested): other hosts and subdomains (`www.`, `leetcode.cn`, `leetcode.com.evil.io`), `http:`,
`javascript:`/`data:` and protocol-relative URLs, userinfo (`user@`), any explicit port, backslashes, encoded
characters (`%2e`), dot segments (`..`), Unicode lookalikes and invisible characters (Cyrillic `е`, full-width,
zero-width space), whitespace or control characters inside, and anything that is not under `/problems/`. Matching is
a strict regular expression on the raw string, never the WHATWG `URL` parser (which silently normalizes tabs,
backslashes and IDN).

Rendering: `<a href={leetcodeProblemUrl(slug)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">`
with "(opens leetcode.com in a new tab)" for screen readers. Nothing from leetcode.com is loaded into our pages; the
CSP is unchanged. Titles are plain text everywhere (React escaping, never HTML).

## 3. API

All bodies are strict Zod objects (4 KB cap), same check order as the other room routes (Origin/Content-Type 403 →
401 → body 413/400 → non-member 404 → role 403 → state 409 → rate 429 → write).

| Method | Path | Who | Body / response |
|---|---|---|---|
| GET | `/api/rooms/:roomId/external-problems` | member | `{problems: BankEntry[], canEdit}` |
| POST | `/api/rooms/:roomId/external-problems` | owner | `{action:"add", url, title?, difficulty?, rating?}` / `{action:"update", id, url?, title?, difficulty?, rating?}` / `{action:"delete", id}` → `{problems}`; 409 duplicate slug, 409 list full; room settings limiter (60/h per room) |
| POST | `/api/rooms/:roomId/sessions/:sid/external` | host or owner, lobby | `{action:"add", bankId}` / `{action:"add", url, title?, difficulty?, rating?, saveToBank?}` / `{action:"remove", position}` → `{lobby}`; `saveToBank` is owner-only (403 otherwise); 409 duplicate in session, 409 eight slots; 60 per 10 min per session |
| POST | `/api/rooms/:roomId/sessions/:sid/slots/:position/self-report` | participant, live | `{solved: boolean}` → `{position, solved, solveSeconds}`; 403 not a participant, 409 not live or not a LeetCode slot; 30/min per user |

Writes run in one transaction holding the room lock, then the session lock `rs:<id>` (same order as R3). The draw
endpoint accepts `external` (0..8) so preset tiles can set the number of LeetCode slots; positions beyond the new
count are dropped, positions are renumbered to stay last.

## 4. Lobby, presets and visibility

- **Add LeetCode problem** (host): a dialog with *From the room list* (entries not yet in the session) and *Paste a
  link* (inline validation, optional title, difficulty, rating, "Save to the room's LeetCode list" for the owner). It
  fills the first empty LeetCode slot, else appends a slot (N + 1 ≤ 8). **Remove** drops the slot (N − 1 ≥ 1).
- The stepper counts all slots; the draw fills `N − E` slots; a custom difficulty mix adds up to `N − E`. Re-roll,
  pin and unpin refuse LeetCode positions.
- **Presets** carry an optional count `external` (0..problemCount): "LeetCode slots to fill in the lobby". Simplest
  consistent design: a weekly preset usually wants a *different* LeetCode problem each week, so it reserves slots
  instead of pinning bank entries; the lobby then shows them as empty LeetCode slots.
- **AC-V2-SEL-4 still holds**: non-hosts see "LeetCode" and the difficulty of a LeetCode slot, never its title,
  slug or rating, until the session starts (lobby view and snapshot both omit them).

## 5. Live, results, history

- Matrix column header of a LeetCode slot: "LeetCode" tag, title, **Open on LeetCode ↗** (new tab). A participant
  gets a **Mark solved** / **Undo** button for their own LeetCode problems (live card above the matrix on desktop;
  in the Problems tab on phones).
- A self-reported solved cell shows `✓ 24:30` plus a `SELF` tag (text, not colour only), tooltip "Self-reported:
  marked solved on LeetCode, not checked by LemmaYard"; the sr-only sentence starts "Problem 5: marked solved
  (self-reported) …". ★ First applies among self-reported solves too and carries the same marker.
- The legend adds "SELF = self-reported LeetCode solve (not checked by the judge)". Results, the finished screen and
  the history cards say "Includes self-reported LeetCode problems".
- Events: `problem_solved` gains `selfReported: true`; a new type `solve_undone` (`{position, solvedCount}`) records
  an undo. The one-solve unique index applies to verified solves only, so mark → undo → mark works. The activity
  feed reads "bob marked Problem 5 solved (self-reported)" / "bob undid their LeetCode solve on Problem 5". Toasts
  as for solves; undo is not toasted.

## 6. Scoring and ratings (decisions)

- **Scoring**: a self-reported solve counts toward the solved count and the time exactly like a judged one (no wrong
  attempts exist for it, so no penalty beyond its time). Ranking is unchanged. Rationale: friends trust each other;
  the marker and the "includes self-reported" note make it visible.
- **Ratings**: LeetCode slots never take part in the Elo update. Pairs, expected solves and the K divisor use internal
  problems only; "active" means at least one judged session submit on an internal problem. A session whose slots are
  all LeetCode problems is unrated: Start sets `rated = false`, and the lobby's Rated switch explains "LeetCode
  problems never change ratings; a session with only LeetCode problems is unrated". The optional bank rating is only
  displayed (lobby, column header, settings list).
- Calibration (difficulty mode) and repeat avoidance read internal problems only.

## 7. Security

Member-only reads, owner-only bank writes, host-only slot configuration, participant-only self-reports of their own
cells, server time only, Zod on every boundary, rate limits, advisory locks as above, RLS on the new table, no
outbound requests to leetcode.com anywhere (also not in tests). User text is rendered as text, never HTML.

## 8. Known limits

- Honor system: nothing stops a participant from marking a problem they did not solve. The marker is the safeguard.
- The bank title is not checked against LeetCode (we never fetch it); a typo stays until the owner edits it.
- Solved-count chips on the rooms list and attendance do not distinguish self-reported solves.
