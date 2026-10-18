# Rooms: real LeetCode problems, picked automatically (research and plan)

Date: 2026-10-18. Status: research and plan for owner review. No code yet. Extends
`docs/specs/rooms-external-problems.md` (LeetCode slots, honor-system results) and `docs/specs/rooms-v2.md` (draw
modes, per-room Elo). Everything not mentioned here stays as specified there.

> Not legal advice. The author is not a lawyer. The legal and terms-of-service sections below describe public
> information and a risk judgement. The owner should confirm them himself (or with a lawyer) before shipping.

## 0. Owner summary

**What you asked.** Rooms should get real LeetCode problems picked automatically by difficulty, topic and a
contest-style rating, instead of only links you type by hand. You also asked how the LeetRooms extension gets its
problems.

**How LeetRooms does it (§1.1).** Its source is public (MIT). The maintainer runs a seed script once. The script
sends a request to LeetCode's undocumented GraphQL endpoint and saves every free problem it returns (number, title,
slug, difficulty, topic names) in the LeetRooms Postgres database. Paid-only problems are dropped. It has **no ratings**.
A room picks 4 random problems from that table by topic and difficulty. A solve is detected **inside the user's
browser**: the extension watches LeetCode's own "check submission" request and the "Accepted" text on the page, then
reports it to the LeetRooms server. The server **trusts that report** and never asks LeetCode. LeetRooms is an
extension because only an extension can run code on leetcode.com pages. A normal website like ours cannot.

**Where "problem ratings" come from (§1.2).** Every rating extension and dashboard we found uses the same community
dataset: **zerotrac/leetcode_problem_rating** (MIT licence, updated weekly by an automatic commit, about 2,600 weekly
and biweekly contest problems, Elo-style ratings from about 1,080 to 3,120). It holds number, title, slug, contest
and position (Q1–Q4) and the rating. It has **no difficulty label, no topic tags and no premium flag.**

**Recommendation (§4).**
- **MVP: option A, a static catalog committed to the repository.** A script turns zerotrac's MIT `data.json` into
  `src/server/leetcode/catalog.json` (number, slug, title, rating, contest position). A small file that you edit by
  hand adds topic tags, difficulty corrections, premium and exclude flags. The lobby then fills the room's LeetCode
  slots automatically, with the same "By rating" ladder and "By difficulty" mix as our own problems, plus repeat
  avoidance. Nothing calls LeetCode at runtime. Results stay honor-system and stay out of Elo.
- **Later, only if you want verified solves: option D, our own small browser extension** that reports "Accepted"
  from the LeetCode page to LemmaYard, the way LeetRooms does it. It is a convenience, not proof: anyone can fake the
  message.
- **Do not:** call LeetCode's GraphQL endpoint from our server or from users' browsers (B, C), or ask users for their
  LeetCode username to verify solves through LeetCode (E). These break LeetCode's terms and `robots.txt`, fail on
  Vercel, or prove nothing.

**What you must decide (§7, 8 questions).** The most important one is Q1. Your earlier decision says "no LeetCode
data is ever scraped or copied". The MVP copies **facts** about LeetCode problems (number, slug, title) and a
**third party's** ratings from a public MIT dataset. We do not scrape anything ourselves. You need to say whether that
is acceptable.

---

## 1. Findings

### 1.1 LeetRooms

Sources: Chrome Web Store listing [S1], public repository `marwanhawari/LeetRooms` (MIT) [S2] and the files cited
below. Store listing (from search snippets; the store page itself needs a consent page we could not pass): version
0.1.15, "Multiplayer rooms for LeetCode", about 5,000 users, works only with the new LeetCode UI. Last repository
commit: 2025-06-06 [S2].

**Components.** `extension/` (Manifest V3 extension, React UI), `server/` (Express + Socket.IO + Prisma/Postgres +
Redis, OAuth sign-in with GitHub/Google/Discord/Twitch), `website/` (Astro landing page with terms and privacy
pages), Caddy as the HTTPS proxy [S2].

**Problem list (what it stores).** `server/prisma/seed.ts` [S3] sends one POST to `https://leetcode.com/graphql/` with
the `problemsetQuestionList` query (`limit: 5000`). From each problem it keeps the frontend number, title, slug,
difficulty and the names of its topic tags. Paid-only problems are skipped. The acceptance rate is requested but not
stored. The script then deletes the whole `Question` table and inserts the new rows in one transaction. The maintainer
runs it by hand. Its CONTRIBUTING notes that the seed step sometimes fails with a 403 and usually works on a retry
[S4], which matches LeetCode blocking automated clients. **LeetRooms has no ratings and no premium content.**

**Room problem selection.** `server/src/api/rooms/rooms.handler.ts` [S5]: a room either filters by **topics** (Prisma
`tags hasSome selections`) plus chosen difficulties, or the creator lists **1–4 problem slugs** by hand. Count is
always 4: all three difficulties → 1 easy, 2 medium, 1 hard; two difficulties → 2 + 2; one → 4. A shortfall in one
pool moves to another selected difficulty. Shuffle is `sort(() => Math.random() - 0.5)` (not uniform). Optional
duration in minutes.

**Solve detection (no LeetCode credentials, no LeetCode API call).**
1. The service worker `background.js` [S6] listens with `chrome.webRequest.onBeforeRequest` to LeetCode's own
   request `https://leetcode.com/submissions/detail/*/check/`, which the LeetCode page sends while it waits for a
   verdict. It reads the submission id from the URL and sends it to the content script of the active tab.
2. The content script `content.ts` [S7] runs on `https://leetcode.com/problems/*`. It adds the LeetRooms panel as an
   **iframe** of the LeetRooms web app next to LeetCode's problem pane and posts it a "submit" message. Then it polls
   the page DOM every 100 ms for up to 20 s for the element `[data-e2e-locator='submission-result']`. When its text is
   exactly "Accepted", it posts an "accepted" message.
3. The iframe app (`Room.tsx`) [S8] checks `event.origin === "https://leetcode.com"` and POSTs
   `{submissionStatus, questionTitleSlug, url}` to its own server with its own session cookie. Submissions after the
   room's duration are dropped on the client.
4. The server (`submissions.handler.ts`) [S9] **trusts the client's status**. It only checks that the URL starts with
   `https://leetcode.com/problems/<slug>/submissions/`. It never contacts LeetCode. Anyone with a LeetRooms session
   can POST "Accepted".

**Room state and sync.** Postgres (users, rooms, room questions, submissions; one row per user × question × room,
status Attempted/Accepted), Redis (session store and per-user room state), Socket.IO for chat and the "everyone
finished" message [S10]. The players list is fetched when the modal opens, not live [S11]. The session cookie is
`SameSite=None; Secure`, because the app runs as a third-party iframe inside leetcode.com [S10].

**Permissions** (`manifest.json`) [S12]: `activeTab`, `storage`, `webRequest`; host permission
`https://leetcode.com/problems/*`; content scripts on `leetcode.com/problems/*` (the panel) and on other
`leetcode.com/*` pages. The `webRequest` permission is what lets it see LeetCode's verdict requests.

**Why a plain website cannot do the same.**
- It cannot run code or draw UI on leetcode.com pages, and it cannot see LeetCode's network requests or DOM (same-origin
  policy). Only an extension's content script and `webRequest` can.
- A `fetch` from our page to `leetcode.com/graphql` is cross-origin. Community reports say LeetCode sends no CORS
  headers for other origins, so the browser blocks the response [S13] (anecdotal; we did not test it, by rule). Even
  if it were allowed, the browser would not send the user's LeetCode cookies (SameSite and third-party cookie
  blocking). Our own CSP (`connect-src 'self'`, `src/server/http/security-headers.ts`) also blocks the request, and
  we do not loosen the CSP for features (AGENT-HANDOFF §5).
- Framing leetcode.com inside our page is very likely blocked by LeetCode's frame-ancestors / X-Frame-Options (not
  verified).

### 1.2 Similar tools and where ratings come from

| Tool | Problem data | Ratings | Solve detection | Source |
|---|---|---|---|---|
| LeetRooms | one-off GraphQL seed into own DB | none | page request + DOM in the extension, server trusts client | [S2]–[S12] |
| zerotrac/leetcode_problem_rating | weekly crawl of contest results; the crawler is closed source | own Elo / maximum-likelihood ratings of contest problems | n/a | [S14] |
| "Leetcode Difficulty Rating" extension (boenshao, MIT) | the problem page itself | zerotrac data; optional clist.by lookup with the user's own API key | n/a | [S15] |
| "Leetcode Analytics" extension | the user's profile page | names zerotrac as the source | n/a | [S16] |
| LeetBattle, Yeetcode (1v1 extensions) | extension + own server | none | extension on the LeetCode page; Yeetcode stores a LeetCode username and uses GraphQL + Socket.IO | [S17] |
| Unofficial API wrappers (LeetCode-Query MIT, alfa-leetcode-api) | LeetCode GraphQL | n/a | public "recent submissions" of any username: **max 20, no auth**; full history needs the user's session cookie | [S18], [S19] |
| Community datasets (e.g. Zanger67/leetcode-question-data) | weekly GraphQL dump: number, slug, title, difficulty, tags, acceptance, paid-only | none | n/a | [S20] |

**The zerotrac dataset in detail** (checked 2026-10-18; we read the public `data.json` from GitHub, not from
LeetCode):
- Licence: MIT, "Copyright (c) 2021 Shuxin Chen" [S14]. MIT requires keeping that notice with copies of substantial
  portions.
- Cadence: an automatic commit after every contest ("Add weekly-contest-523 and biweekly-contest-193",
  2026-10-17) [S14].
- Content: 2,616 problems, one per slug; fields `ID` (frontend number), `Title`, `TitleZH`, `TitleSlug`,
  `ContestSlug`, `ContestID_en/zh`, `ProblemIndex` (Q1–Q4), `Rating` (float). Rating range 1,084–3,124. Numbers 746
  to 4,081. Weekly contests 1–62 and non-contest problems are not included.
- Median rating by position: Q1 ≈ 1,255, Q2 ≈ 1,505, Q3 ≈ 1,841, Q4 ≈ 2,247 (10th–90th percentile Q1 1,166–1,406, Q4
  1,915–2,646). This is the same scale our Elo uses (rooms-v2 §6.4), so no conversion is needed.
- The author says the result "is not a 100% accurate result, but sufficient for evaluating the relative difficulty"
  [S14], and that the crawler is closed to avoid violating possible terms and regulations.
- **Missing:** difficulty label, topic tags, premium flag, acceptance rate, about 1,000 older or non-contest problems
  (including many classics like "Two Sum").

**NeetCode and curated lists.** NeetCode publishes hand-curated lists that link to LeetCode problems. A curated list
of links and difficulties is the same shape as option A with the owner as curator. We did not find a public,
licensed export of those lists.

### 1.3 What is public on LeetCode, and solve verification

- There is **no official public API**. The GraphQL endpoint has no published schema; wrappers reverse-engineer it
  [S19], [S21].
- Without login, the GraphQL endpoint returns the problem list (number, slug, title, difficulty, tags, acceptance,
  paid-only) and, for any username, the last **20** public submissions and the solved counts [S18].
- `robots.txt` (fetched as a public page on 2026-10-18) disallows `/graphql`, `/api/`, `/submissions`, `/accounts`,
  `/problems/*/submit`, `/problems/random-one-question`, `/contest/*/problems` and more for all user agents. It does
  **not** disallow `/problems/<slug>/` pages [S22].
- Verifying a solve through a username is **weak**. Anyone can type any username. A "put this code in your LeetCode
  bio" challenge proves ownership, but our server still has to read LeetCode, which `robots.txt` and the terms rule
  out. LeetCode also blocks automated clients (LeetRooms' seed sees 403s [S4]), and Vercel's shared IP ranges make
  that more likely.

---

## 2. Terms, robots and risk

### 2.1 What LeetCode says

We could not read `leetcode.com/terms` directly (HTTP 403 for automated fetches), so the following comes from search
snippets and secondary sources. Confirm it on the live page.
- **Automated access:** the terms forbid crawling, scraping, spidering and reverse engineering any part of the
  service, and automated processes that run while logged out or load its infrastructure (search snippet of the terms
  page) [S23].
- **Content:** LeetCode's own content is its exclusive property and copyrighted; users agree not to copy,
  redistribute, publish or exploit content in violation of intellectual-property rights (quoted in an EMNLP 2023
  paper) [S24]. Content includes user-submitted solutions.
- **robots.txt** disallows `/graphql` and `/api/` [S22].
- **Enforcement history** (GitHub's public DMCA repository): 2021-03-25, LeetCode, Inc. against a GitHub Pages site
  that republished "ALL LeetCode Premium problems" [S25]; 2024-02-01, LeetCode LLC against two premium-unlocker
  extensions for "publicly revealing content that is part of our paid service" [S26]. We found **no** action against
  rating datasets, link lists, room/duel extensions or zerotrac. Thousands of solution repositories that quote
  titles and link problems are online.

### 2.2 Facts versus protected content

| Kind | Examples | Our view (uncertain, confirm) |
|---|---|---|
| Facts / identifiers | number, slug, URL, difficulty label, topic tag names, contest and position | Facts are not protected by copyright in the US (Feist v. Rural, 1991). A whole compilation can be protected in its selection and arrangement, and in the EU a database can be protected by the sui generis database right against extracting a substantial part. |
| Short names | problem titles | Usually too short for copyright; widely used in links. Low risk. |
| Third-party analysis | zerotrac ratings | The author's own computation, published under MIT. Safe to reuse with the notice, even though the underlying contest data was crawled by the author. |
| Protected content | statements, examples, constraints, hints, editorials, solutions, test cases, images, premium content | Copyrighted and (premium) the paid product. **Never copy, show, store or fetch.** |
| Access | GraphQL / API calls, scraping pages | Contract (terms) and `robots.txt`, regardless of what is returned. **Not from our code.** |

Deep links to public problem pages (`https://leetcode.com/problems/<slug>/`) are ordinary links. They open LeetCode
in the user's own browser, where the user's relationship with LeetCode applies. We already do this.

### 2.3 Risk assessment

| Option | ToS / legal risk for a public MIT repo and a hobby site | Why |
|---|---|---|
| A (static catalog from zerotrac, links only) | **Low** | No access to LeetCode by us. Facts plus an MIT third-party dataset with attribution. Same pattern as several extensions with thousands of users. The residual risk is LeetCode asking us to remove the list (we would comply; the feature degrades to hand-typed links). |
| A with a list generated from LeetCode GraphQL by the maintainer | **Medium** | The maintainer, a LeetCode user bound by the terms, would scrape (`/graphql` is disallowed). The committed file then re-publishes a full problem database (EU database right). |
| A with third-party GraphQL dumps (e.g. [S20]) | **Medium** | The dump's licence (often none) cannot grant rights the uploader does not have. Same origin as above. |
| B (server calls LeetCode at runtime) | **High** | Direct breach of the terms and `robots.txt` from our infrastructure, in a public repo that documents it. Also unreliable (403s). |
| C (users' browsers call LeetCode) | **High / not feasible** | Same breach. Blocked by CORS and our CSP anyway. |
| D (own extension reading the LeetCode page the user is on) | **Low–medium** | Reads only what the user sees, no crawling, no LeetCode API. Same pattern as LeetRooms (on the store since 2023). Store review and privacy duties apply. |
| E (verify via public username) | **High** | Needs B. Also weak against spoofing. |

For a hobby site the realistic worst case of A is a takedown request, not damages. The realistic worst case of B is
IP blocking plus a takedown of the repo or the site. **Owner: confirm with your own reading of the current terms (and
a lawyer if the site grows or makes money).** If you or the site are based in the EU, the database right makes a full
copy of LeetCode's own problem list riskier than in the US; a third-party rating dataset of contest problems with
titles is a smaller and different thing.

---

## 3. Options for LemmaYard

| | A. Static catalog in repo | B. Server calls LeetCode | C. Browser calls LeetCode | D. Our MV3 extension | E. Verify via username | F1. Owner-curated list (CSV import into the room bank) | F2. "Past contest" pack |
|---|---|---|---|---|---|---|---|
| What it is | zerotrac `data.json` → committed `catalog.json` + hand-edited overlay; draw fills LeetCode slots | Route handler queries GraphQL for list / solves | Client JS queries GraphQL | Extension on leetcode.com reports Accepted to our site, optionally reads tags from the page | User links a LeetCode username; server reads the last 20 public submissions | Owner pastes a CSV of links into the room bank (bulk "add") | Pick one past weekly contest (4 problems with ratings) whose average fits the room |
| Vercel + CSP | Works; JSON bundled server-side, no outbound requests, CSP unchanged | Needs outbound fetches; likely 403 from shared IPs; cache needed | Fails: CORS, cookies, `connect-src 'self'` | Website unchanged except one API route; the extension talks to our API (CSP of our page is not involved) | Same as B | Works | Works (on top of A) |
| ToS / legal | Low | High | High | Low–medium | High | Low (the owner types facts) | Low (same data as A) |
| Reliability / maintenance | Very high; owner refreshes when he wants new contests (one command) | Low; undocumented schema, blocking | n/a | Medium; breaks when LeetCode changes its DOM or request URLs (LeetRooms already needs the "new UI") | Low | High, but manual | High |
| Privacy | Nothing new | We contact LeetCode with usernames | Users' IPs to LeetCode via our page | Extension sees LeetCode problem pages; must publish a privacy policy | We store LeetCode usernames | Nothing new | Nothing new |
| Effort (one Opus agent) | M (≈ 2 days) | M + ongoing | n/a | L (≈ 4–6 days + store review + owner's developer account) | M | S | S after A |
| UX | Auto-pick by rating / difficulty / topic (topics only where the overlay has tags); honor-system results | Same plus live tags | — | Auto-marks solved when "Accepted" appears; still forgeable | "Verified" badge that is not really verified | Faster bank filling, still manual picking | Fun "replay contest 412" evenings |

---

## 4. Recommendation

**MVP: A (static catalog) + F2 as a small extra if time allows.** Reasons:
1. It meets the request: real LeetCode problems, auto-picked by rating (zerotrac, same scale as our Elo), by
   difficulty (estimated from the rating, overridable by hand) and by topic (where the owner has tagged problems).
2. It has the lowest risk: no request to LeetCode from anywhere, no statements, no premium content, attribution kept.
   The enforcement history is only about premium content and statements.
3. It fits the architecture: the pure draw (`drawSlotsByRating`, `drawSlots`) already works on abstract candidates;
   LeetCode slots and their snapshots exist; no migration is needed.
4. It is reversible: deleting the catalog file returns the feature to hand-typed links.

**Later: D (own extension) only if honor-system results turn out to be a real problem.** It gives convenience
(auto-mark solved), not proof. Keep self-reported solves out of Elo either way unless the owner decides otherwise
(Q5).

**Not recommended:** B, C, E.

Option A covers 2,616 contest problems, not the older classics (Two Sum, LRU Cache and so on). Those can still be
added by hand to the room bank (existing feature) or to the overlay with an owner-entered rating (Q3).

---

## 5. Fit with the existing code

| Area today | Change |
|---|---|
| `room_external_problems` (bank) | Unchanged. Manual picks keep working. |
| `room_session_problems` external snapshot (`external_slug`, `external_title`, `external_rating`, `difficulty`, `external_problem_id`) | Unchanged columns. An auto-picked slot writes the catalog values with `external_problem_id = NULL` and **`pinned = false`**. Slots filled from the bank or a pasted link are written with **`pinned = true`** from now on (today they are `false`; the CHECK does not constrain `pinned` on external rows). The draw re-picks only unpinned LeetCode slots. |
| `settings.external` (E LeetCode slots, always last) | Unchanged. New optional settings field `leetcodeAuto: boolean` (absent = false): the draw fills empty or unpinned LeetCode slots from the catalog. New optional `leetcodeRerolled: string[]` (≤ 30 slugs) because `rerolled_problem_ids` is `uuid[]`. jsonb + Zod only, **no migration**. |
| Presets (`SessionTemplate`) | New optional `leetcodeAuto?: boolean`. Tile summary: "4 problems · 1 LeetCode (auto)". |
| Draw modes | **By rating:** LeetCode slots get their own ladder: `ratingTargets({ratings, freeCount: E_free, pinnedRatings: ratings of pinned LeetCode slots, challenge})`, then `drawSlotsByRating` over catalog candidates. Internal positions and targets are unchanged. **By difficulty:** LeetCode slots use `suggestMix({problemCount: E_free, rates: calibration.rates, challenge, available: mixOf(lcPool), pinned: mixOf(pinned LeetCode)})` then `drawSlots`; a custom mix applies only to our problems (as today). **Manual:** no auto-pick; the host picks from the catalog search (below). |
| Candidates | Map each catalog entry to `RatedCandidate`: `id = "lc:" + slug`, `difficulty`, `rating`, `lastUsedAt` (last live/finished session of this room with that `external_slug`), `solvedBy` (expected participants with a self-reported solve of that slug in this room). Tier A/B/C ranking and "avoid solved" then work unchanged. The slot's `problemId` stays `"lc:<slug>"` only inside the pure call; `src/server/rooms/draw.ts` converts it to an external row. |
| Topics | Session topics filter LeetCode candidates by overlay tags (`tags ∩ settings.tags ≠ ∅`). If fewer than `E_free` candidates match, ignore the topics for LeetCode slots and add the notice `leetcode_topics_ignored`: "Not enough LeetCode problems are tagged with these topics; LeetCode slots ignore the topics." |
| Premium | Entries with `premium: true` or `exclude: true` in the overlay are never drawn or offered in search. |
| Hidden-title rule (AC-V2-SEL-4) | Non-hosts get only `{position, difficulty, external: {}}` for every LeetCode slot (as today) and **no `rating.chance`** on LeetCode slots (the chance plus known member ratings would reveal the exact rating, which identifies one of 2,616 problems). |
| Elo | Unchanged: LeetCode slots never change ratings; an only-LeetCode session is unrated. The catalog rating is used for selection and display only. |
| Calibration | Unchanged (internal problems only). |
| Re-roll | New: the host can re-roll one auto LeetCode slot (`external` endpoint `{action:"reroll", position}`), counted in the same `reroll_count` cap (30). Re-roll all also re-picks unpinned LeetCode slots when `leetcodeAuto`. Pin/unpin of internal slots unchanged. |
| Results, history, scoring | Unchanged (snapshots and self-reports). |

---

## 6. Implementation plan (one Opus agent, branch `feature/rooms-leetcode-catalog`)

Read first: `CLAUDE.md`, `AGENTS.md`, `docs/AGENT-HANDOFF.md`, `docs/specs/rooms-v2.md`,
`docs/specs/rooms-external-problems.md`, this file. Size: M (about 2 working days). No migration.

### 6.1 Files

| File | Purpose |
|---|---|
| `src/server/leetcode/catalog.json` | Generated. Do not edit by hand. |
| `src/server/leetcode/overlay.json` | Hand-edited by the owner (tags, difficulty, premium, exclude, extra problems). |
| `src/server/leetcode/NOTICE.md` | zerotrac's MIT copyright and permission notice, the source URL and commit, and the line "LeetCode is a trademark of LeetCode LLC. LemmaYard is not affiliated with LeetCode." |
| `src/lib/leetcode/catalog-schema.ts` | Zod schemas and types for both files (pure, no server imports). |
| `src/server/leetcode/catalog.ts` | `import "server-only"`; loads, validates and merges both files once per process; exports `getLeetCodeCatalog()` (null when disabled or invalid). |
| `src/lib/rooms/leetcode-draw.ts` | Pure: candidate mapping, topic fallback, `drawLeetCodeSlots(...)` wrapping `drawSlotsByRating` / `drawSlots`. |
| `scripts/leetcode-catalog.ts` + `package.json` script `leetcode:catalog` | Generator. |
| `src/server/rooms/draw.ts`, `src/server/rooms/external.ts`, the external route, a new search route | Integration. |
| Lobby / settings / preset UI components | UI. |

### 6.2 Catalog format (`catalog.json`)

```json
{
  "version": 1,
  "source": {
    "name": "zerotrac/leetcode_problem_rating",
    "url": "https://github.com/zerotrac/leetcode_problem_rating",
    "commit": "<40-hex sha given to the script>",
    "licence": "MIT",
    "retrievedAt": "2026-10-18"
  },
  "problems": [
    { "n": 746, "slug": "min-cost-climbing-stairs", "title": "Min Cost Climbing Stairs",
      "rating": 1358, "contest": "weekly-contest-66", "q": 1 }
  ]
}
```

Rules (Zod, strict): `version` = 1; `n` integer 1–99,999, unique; `slug` matches `EXTERNAL_SLUG_RE`, 1–100 chars,
unique; `title` 1–100 chars, no control or bidi characters (reuse `externalTitleSchema` rules); `rating` integer
800–4,000 (`Math.round` of the float); `contest` matches `^(weekly|biweekly)-contest-[0-9]{1,4}$`; `q` 1–5. Sorted by
`n`. Minified one entry per line (stable diffs; about 300 KB). No Chinese titles, no other fields.

### 6.3 Overlay format (`overlay.json`)

```json
{
  "version": 1,
  "problems": {
    "min-cost-climbing-stairs": { "tags": ["dynamic-programming", "array"] },
    "some-slug": { "difficulty": "medium" },
    "another-slug": { "premium": true },
    "bad-slug": { "exclude": true },
    "two-sum": { "n": 1, "title": "Two Sum", "rating": 1180, "difficulty": "easy", "tags": ["array", "hash-table"] }
  }
}
```

- Keys are slugs. `tags`: 0–8 of **our** tag slugs (must exist in `problems/*/meta.json` tags or the `tags` table;
  the unit test checks against the list of tag slugs used in `problems/`). `difficulty`: easy/medium/hard. `premium`,
  `exclude`: booleans. `note`: ≤ 200 chars, never rendered.
- An overlay key **not** in the catalog adds a problem only if it has `n`, `title`, `rating` and `difficulty` (the
  owner's own entry, e.g. classics). `rating` then carries the label "owner's estimate".
- Difficulty when the overlay gives none: from the rating with our bands (rooms-v2 §8, `verify-problems`): < 1,450
  easy, 1,450–1,849 medium, ≥ 1,850 hard. The UI says "difficulty estimated from rating" (Q2).
- LeetCode tag names → our slugs (for the owner when typing): Array → `array`, Hash Table → `hash-table`, Dynamic
  Programming → `dynamic-programming`, Breadth-First Search → `breadth-first-search`, Depth-First Search →
  `depth-first-search`, Graph → `graph`, Greedy → `greedy`, Heap (Priority Queue) → `heap`, Math → `math`, Matrix →
  `matrix`, Monotonic Stack → `monotonic-stack`, Prefix Sum → `prefix-sum`, Shortest Path → `shortest-path`, Sliding
  Window → `sliding-window`, Sorting → `sorting`, Stack → `stack`, String → `string`, Topological Sort →
  `topological-sort`, Tree / Binary Tree / Binary Search Tree → `tree`, Trie → `trie`, Two Pointers →
  `two-pointers`, Union Find → `union-find`, Backtracking → `backtracking`, Binary Search → `binary-search`, Bit
  Manipulation → `bit-manipulation`. Anything else: leave out.

### 6.4 Generator `pnpm leetcode:catalog --input <path> --commit <sha> [--date YYYY-MM-DD]`

- **Offline.** The maintainer downloads zerotrac's `data.json` himself (the command is in the doc comment and in
  `NOTICE.md`: the raw GitHub URL of `data.json` at a commit). The script never makes network requests and never
  touches leetcode.com.
- Reads with `fs`, validates every record with Zod (`ID`, `Title`, `TitleSlug`, `ContestSlug`, `ProblemIndex`,
  `Rating`); **skips** invalid records and prints a count per reason (bad slug, bad title, out-of-range rating,
  duplicate slug or number). Fails (exit 1) if fewer than 1,000 valid records remain or the input is not an array.
- Writes `catalog.json` atomically (temp file + rename), sorted, deterministic (same input → byte-identical output),
  and updates the commit/date in `NOTICE.md`. Prints "N problems, M skipped, rating range a–b".
- No `exec`/shell; argument parsing as in the other scripts.

### 6.5 Loading at runtime

- `getLeetCodeCatalog()`: imports both JSON files (bundled on Vercel; no filesystem reads at runtime), validates with
  Zod once, merges the overlay, drops `premium`/`exclude` entries from the draw pool, memoizes. On a validation error
  it logs one line (no data) and returns null: LeetCode auto-pick then answers 409 `leetcode_catalog_unavailable` and
  the UI hides the switch. Also null when `LEETCODE_CATALOG_ENABLED=0` (kill switch, Q6).
- Never sent to the client as a whole. Only individual entries go to the host's lobby view and the search route.

### 6.6 Draw integration (`src/server/rooms/draw.ts`)

1. `drawAndSave` / `drawByRating`: after the internal draw succeeds and when `settings.leetcodeAuto` and E > 0, call
   `drawLeetCode(tx, session, resolved, rng, ctx)`:
   - load existing LeetCode slots; keep pinned ones; `E_free = E − pinned`;
   - candidates = catalog minus slugs in this session minus `leetcodeRerolled`, with usage and solver counts from two
     queries (room's live/finished `external_slug` max `started_at`; self-reported solves of expected participants per
     slug in this room);
   - topic filter with fallback notice;
   - rating mode: separate ladder, `drawSlotsByRating`; difficulty mode: `suggestMix` + `drawSlots`;
   - write unpinned LeetCode rows at positions after the pinned ones (positions stay `N − E + 1 … N`, pinned first in
     their old order, then the new picks in ladder order), storing targets in `settings.targets` at those positions.
   - Errors: `pool_too_small` for LeetCode → the whole draw returns error code `leetcode_pool_too_small` and writes
     nothing (one transaction).
2. `buildLobbyView`: for the host, LeetCode slots gain `external.auto: boolean`, `external.target`, and
   `rating.chance` from the expected participants; for non-hosts nothing new (§5).
3. Start: unchanged ("Start needs every slot filled"; the draw fills them).

### 6.7 API (all existing check order: Origin/Content-Type 403 → 401 → body 413/400 → non-member 404 → role 403 →
state 409 → rate 429 → write)

| Method | Path | Change |
|---|---|---|
| POST | `…/sessions` and `…/sessions/:sid/draw` | body accepts `leetcodeAuto?: boolean` (strict Zod). 409 `leetcode_catalog_unavailable` when true and the catalog is null. |
| POST | `/api/rooms/:roomId/presets` | preset accepts `leetcodeAuto?: boolean`. |
| POST | `…/sessions/:sid/external` | new actions `{action:"reroll", position}` (auto LeetCode slot only; 409 `not_auto` otherwise; counts toward the 30 re-rolls) and `{action:"add", catalogSlug}` (host picks a catalog entry: written as pinned). Existing actions write `pinned = true`. |
| GET | `…/sessions/:sid/leetcode-search?q=&difficulty=&min=&max=&tag=` | host or owner, lobby only; `q` ≤ 60 chars matches number prefix or title substring (case-insensitive); returns ≤ 20 `{n, slug, title, difficulty, rating, tags}` excluding premium/excluded and slugs already in the session; 60 per 10 min per session (reuse `lobbyExternalLimiter`). |

### 6.8 UI

- **Lobby setup card:** under "LeetCode problems" (the stepper that sets E), a switch **"Pick LeetCode problems
  automatically"** with help "From a list of 2,616 LeetCode contest problems with community ratings (zerotrac). Links
  only; results are self-reported." Hidden when the catalog is unavailable.
- **LeetCode slot card (host):** title, "LeetCode #746", difficulty (with "estimated" when derived), rating with
  "target 1,507 (−13)" in rating mode, tags if any, "Auto-picked" tag or "Picked by you", buttons **Re-roll** (auto
  only), **Remove**, **Open on LeetCode ↗**. Notices for topic fallback and far targets (`targets_far` wording).
- **Add LeetCode problem dialog:** new first tab **"From the LeetCode list"** with search, difficulty and rating range
  filters (uses the search route). Existing tabs *From the room list* and *Paste a link* stay.
- **Presets / Settings:** the preset form gets the same switch; the preset tile summary says "1 LeetCode (auto)".
- **Attribution:** the lobby help and the site footer link "LeetCode ratings: zerotrac (MIT)"; the disclaimer line
  from `NOTICE.md` on the room Settings → LeetCode problems section.
- DESIGN.md tokens and components; axe 0 serious/critical; no horizontal scroll at 320–1440 px.

### 6.9 Security rules

- No network request to leetcode.com or any third party from app code, scripts or tests. The generator is offline.
- CSP unchanged. Links only through `leetcodeProblemUrl(slug)` with `rel="noopener noreferrer"` and
  `referrerPolicy="no-referrer"`. Titles rendered as text.
- Catalog and overlay validated with Zod at load and in a unit test; slug regex reused; invalid data disables the
  feature instead of rendering it.
- Non-hosts never receive slug, title, number, rating or chance of a LeetCode slot before the start.
- Search route host-only, lobby-only, rate-limited, bounded output; query parameters validated with Zod.
- Never store or show statements, examples, hints, editorials, tests or premium content. Premium-flagged entries are
  excluded everywhere.

### 6.10 Tests and acceptance criteria

- **AC-LC-1** Generator: a fixture `data.json` (10 records incl. a bad slug, a control-character title, a duplicate
  slug, a rating of 5,000, a non-array input) produces the expected `catalog.json` byte for byte, prints the skip
  counts, and exits 1 for the non-array input and for fewer than the minimum records (minimum injectable in tests).
  Running twice gives identical output. No network module is imported (unit test greps the script for `fetch`,
  `http`, `https`).
- **AC-LC-2** The committed `catalog.json` and `overlay.json` pass the Zod schemas; slugs and numbers are unique;
  every overlay tag is a known tag slug; `NOTICE.md` contains the MIT notice and the same commit as the catalog.
- **AC-LC-3** Difficulty derivation: 1,449 → easy, 1,450 → medium, 1,849 → medium, 1,850 → hard; an overlay
  difficulty wins.
- **AC-LC-4** Seeded rating-mode draw with E = 2 LeetCode slots: targets come from the LeetCode ladder of the
  expected participants; picks are within ±100 when available; internal slots and their targets are byte-identical to
  a draw without `leetcodeAuto` (regression).
- **AC-LC-5** Difficulty-mode draw: LeetCode slots follow `suggestMix` for E; a custom mix still applies to internal
  slots only.
- **AC-LC-6** Repeat avoidance: a slug used in this room's finished session is tier C; a slug self-reported solved by
  an expected participant is avoided with "avoid solved" on.
- **AC-LC-7** Topics: candidates are filtered by overlay tags; with too few matches the topics are ignored for
  LeetCode slots and the notice `leetcode_topics_ignored` is returned.
- **AC-LC-8** Premium or excluded overlay entries are never drawn and never returned by search (seeded test over all
  seeds 1–200).
- **AC-LC-9** Pinned LeetCode slots (bank, pasted link, catalog pick) survive Apply-and-draw and Re-roll all; auto
  slots are re-picked; positions stay last; the unique `(session_id, external_slug)` index is never violated.
- **AC-LC-10** `{action:"reroll"}` on an auto slot changes the slug, increments `reroll_count`, adds the old slug to
  `leetcodeRerolled`; on a pinned slot → 409 `not_auto`; after 30 re-rolls → 409.
- **AC-LC-11** Non-host lobby JSON (API test) contains no `slug`, `title`, `n`, `rating` or `chance` for LeetCode
  slots (extends AC-V2-SEL-4).
- **AC-LC-12** Search route: member non-host → 403, non-member → 404, live session → 409, > 60 requests → 429, ≤ 20
  results, premium excluded.
- **AC-LC-13** Kill switch / bad data: `LEETCODE_CATALOG_ENABLED=0` or an invalid catalog → draw with `leetcodeAuto`
  answers 409 `leetcode_catalog_unavailable`, the lobby hides the switch, manual LeetCode slots still work.
- **AC-LC-14** Elo: a finished rated session with auto LeetCode slots updates ratings exactly as one without them
  (integration test reusing the v2 rating fixtures).
- **AC-LC-15** E2E: host enables the switch with E = 1, draws, sees an auto-picked LeetCode card with rating and
  Re-roll; a second member sees only "LeetCode · Medium"; after Start both see the title and link; the CSP walk stays
  at zero violations; axe 0 serious/critical on the lobby at 1440 and 390.

Verification gate as in AGENT-HANDOFF §4 (no migration, so no `db:export-sql` change).

### 6.11 Docs to update in the implementation branch

- `docs/specs/rooms-external-problems.md`: §0 "nothing is fetched" stays true; add "auto-pick from the committed
  catalog" and the `pinned` meaning for LeetCode slots.
- `docs/specs/rooms-v2.md` §6.7 and `docs/AGENT-HANDOFF.md` §2 owner decisions: replace "no LeetCode problem ratings"
  / "no LeetCode data is ever scraped or copied" with the owner's answer to Q1.
- Root `README.md` rooms section and third-party notices; `docs/DEPLOY.md` env table (`LEETCODE_CATALOG_ENABLED`);
  `.env.example`; a short maintainer section "Refreshing the LeetCode catalog" (download command, generator, review
  the diff, commit).

---

## 7. Owner decisions (multiple choice; recommended option marked)

**Q1. Use of LeetCode problem facts and the zerotrac dataset.** Today's rule says "no LeetCode data is ever scraped
or copied".
- a) **Allow a committed catalog of facts (number, slug, title, contest position) and zerotrac's MIT ratings, with
  attribution. We never fetch from LeetCode ourselves.** *(recommended)*
- b) Ratings only for problems the owner adds by hand (no bulk list).
- c) Keep the current rule: hand-typed links only (no auto-pick).

**Q2. Difficulty label of catalog problems.**
- a) **Estimated from the rating with our bands, shown as "estimated"; the overlay can correct it.** *(recommended)*
- b) From the contest position (Q1 easy, Q2–Q3 medium, Q4 hard).
- c) Only problems the owner labels by hand are eligible in difficulty mode.

**Q3. Problems outside the dataset (classics like Two Sum).**
- a) **Owner adds them to the overlay with his own rating and difficulty, labelled "owner's estimate".**
  *(recommended)*
- b) Not in the auto-pick at all (bank only).

**Q4. Topic tags.**
- a) **Owner tags problems in the overlay over time; until enough are tagged, LeetCode slots ignore topics with a
  notice.** *(recommended)*
- b) Import tags from a third-party GraphQL dump (higher ToS risk, unclear licence).
- c) No topic filtering for LeetCode slots.

**Q5. Do self-reported LeetCode solves change Elo?**
- a) **No, as today (selection and display only).** *(recommended)*
- b) Yes, in rated sessions, with half the K factor.
- c) Only once verified solves exist (needs option D).

**Q6. Kill switch.**
- a) **`LEETCODE_CATALOG_ENABLED` env (default on) so you can turn the feature off without a deploy of new code.**
  *(recommended)*
- b) No switch; delete the file if needed.

**Q7. Who may enable auto-pick?**
- a) **Host or owner in the lobby, and the owner in presets (same as other settings).** *(recommended)*
- b) Owner only.

**Q8. Refresh cadence.**
- a) **Owner refreshes by hand when he wants newer contests (monthly is plenty).** *(recommended)*
- b) A scheduled GitHub Action opens a refresh PR (touches GitHub settings; later, with the open-source setup).
- c) Never; freeze at the first import.

Later (not now): build option D (own extension)? Recommended answer: **not until honor-system cheating is a real
problem in your rooms.**

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| LeetCode objects to the list or the ratings | Low | Kill switch; delete the files; the bank and pasted links still work. Keep attribution and the not-affiliated line. |
| ToS reading is wrong or the terms change (we could not fetch them) | Medium | Owner confirms the live terms before merging; re-check yearly. |
| zerotrac stops updating or changes its format | Medium | The committed catalog keeps working; the generator fails loudly on schema changes; only new contests are missing. |
| Ratings inaccurate for some problems | Medium | Show the source; the overlay can exclude or override; selection uses bands ±100–300 anyway. |
| Estimated difficulty differs from LeetCode's label | High (by design) | Label "estimated"; overlay overrides; rating mode does not use the label. |
| A premium problem slips in | Low (contest problems are believed to be free; not verified) | Overlay `premium: true`; users can report; excluded everywhere. |
| Problem identity leaks before the start | Low | Hide slug, title, rating and chance from non-hosts (AC-LC-11). |
| Honor-system cheating | Low among friends | Unchanged SELF marker; out of Elo (Q5). |
| Catalog size in the server bundle | Low | About 300 KB JSON, server-only import, parsed once. |
| Topic filter mostly ignored at first | High until tagged | Clear notice; owner tags gradually (Q4). |
| The extension path (D), if built later, breaks on LeetCode UI changes | High over time | Treat as convenience only; never required for scoring. |

---

## 9. Sources

LeetCode pages could not be fetched (403) except `robots.txt`; LeetCode statements above come from search snippets
and secondary sources, as marked. No LeetCode API or GraphQL endpoint was contacted for this research.

- [S1] LeetRooms on the Chrome Web Store: https://chromewebstore.google.com/detail/leetrooms/ekldadcjhbmljcefnilihgagmnmmlfcd
  (listing data via search snippets and https://www.chromeboard.com/extension/leetrooms-ekldadcjhbmljcefnilihgagmnmmlfcd)
- [S2] LeetRooms repository (MIT): https://github.com/marwanhawari/LeetRooms
- [S3] Seed script: https://github.com/marwanhawari/LeetRooms/blob/main/server/prisma/seed.ts
- [S4] CONTRIBUTING: https://github.com/marwanhawari/LeetRooms/blob/main/CONTRIBUTING.md
- [S5] Room handler: https://github.com/marwanhawari/LeetRooms/blob/main/server/src/api/rooms/rooms.handler.ts
- [S6] Background worker: https://github.com/marwanhawari/LeetRooms/blob/main/extension/src/public/background.js
- [S7] Content script: https://github.com/marwanhawari/LeetRooms/blob/main/extension/src/content.ts
- [S8] Room component: https://github.com/marwanhawari/LeetRooms/blob/main/extension/src/components/Room.tsx
- [S9] Submissions handler: https://github.com/marwanhawari/LeetRooms/blob/main/server/src/api/submissions/submissions.handler.ts
- [S10] Server app: https://github.com/marwanhawari/LeetRooms/blob/main/server/src/api/app.ts
- [S11] Players button: https://github.com/marwanhawari/LeetRooms/blob/main/extension/src/components/buttons/PlayersButton.tsx
- [S12] Manifest: https://github.com/marwanhawari/LeetRooms/blob/main/extension/src/public/manifest.json
- [S13] CORS report (Obsidian forum): https://forum.obsidian.md/t/need-help-automating-my-leetcode-notes-using-leetcodes-graphql-endpoint/85863
- [S14] zerotrac/leetcode_problem_rating (MIT, README, LICENSE, commits, data.json): https://github.com/zerotrac/leetcode_problem_rating
- [S15] Leetcode Difficulty Rating extension: https://github.com/boenshao/leetcode-difficulty-rating-extension
- [S16] Leetcode Analytics listing: https://chromeboard.com/extension/leetcode-analytics-pcgnpclciloahjpjhhmjbalpcdmlkpba
- [S17] LeetBattle: https://github.com/linden0/LeetBattle ; Yeetcode: https://chromewebstore.google.com/detail/jfdjendlhcodpecohebkckfmdcofdlao
- [S18] LeetCode-Query (MIT): https://github.com/JacobLinCool/LeetCode-Query
- [S19] alfa-leetcode-api: https://github.com/BooleanCube/alfa-leetcode-api
- [S20] Zanger67/leetcode-question-data (no licence shown): https://github.com/Zanger67/leetcode-question-data
- [S21] Go wrapper noting no official schema: https://pkg.go.dev/github.com/mutasim77/leetcode-api
- [S22] LeetCode robots.txt: https://leetcode.com/robots.txt
- [S23] LeetCode Terms of Service (search snippet only): https://leetcode.com/terms/
- [S24] "Copyright Violations and Large Language Models", EMNLP 2023: https://aclanthology.org/2023.emnlp-main.458.pdf
- [S25] GitHub DMCA notice 2021-03-25 (LeetCode): https://github.com/github/dmca/blob/master/2021/03/2021-03-25-leetcode.md
- [S26] GitHub DMCA notice 2024-02-01 (LeetCode): https://github.com/github/dmca/blob/master/2024/02/2024-02-01-leetcode.md
- Chrome `externally_connectable` (for option D): https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable ;
  Chrome Web Store program policies: https://developer.chrome.com/docs/webstore/program-policies/
- Feist Publications v. Rural Telephone Service (1991): https://en.wikipedia.org/wiki/Feist_Publications,_Inc.,_v._Rural_Telephone_Service_Co.

## Appendix: option D in brief (for later)

- Manifest V3; permissions `storage`; host permission `https://leetcode.com/problems/*` only; a content script there
  that watches the verdict element (as LeetRooms does) and, with the user's consent per room, sends
  `{slug, submissionUrl, verdict:"accepted"}` to `https://<our host>/api/rooms/.../self-report` with the user's
  LemmaYard session (a short-lived token from our site, passed via `externally_connectable` matches = our origin, or
  via a content script on our own domain). No `webRequest`, no cookies of LeetCode, no LeetCode API calls, no remote
  code (MV3 forbids it).
- Our API treats it exactly like the Mark solved button (still self-reported, labelled "auto-marked by the
  extension"). It is not proof: anyone can send the same request.
- Owner tasks: Chrome Web Store developer account (one-time fee), privacy policy page, permission justifications,
  review (days). Maintenance: LeetCode DOM changes break the selector.
