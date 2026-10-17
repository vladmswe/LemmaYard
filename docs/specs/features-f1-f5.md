# LemmaYard: post-MVP features (product decision and specs)

Date: 2026-10-17. Inputs: `research-pain-points.md` (scratchpad), `PLAN.md` (M0–M7), code on branch `integration` (20 seed problems: 11 easy, 6 medium, 3 hard, 10 tags, all `compare.mode=exact` except two-sum `unordered`, 12–20 tests each, types limited to int/float/bool/string/arrays, no trees/lists).

Assumption: M0–M7 are complete before F-work starts. Every feature here is post-M7 and is allowed to add **one additive migration** (new tables / nullable or defaulted columns only, no drops or type changes). The orchestrator must amend the CLAUDE.md rule "DB schema changes only in M1" to: "M-milestones: schema only in M1. F-features: one additive migration per feature branch, generated with `pnpm db:generate`, named `drizzle/00NN_f<id>_<name>.sql`." Branches: `feature/f1-review-queue`, `feature/f2-guided-hints`, etc. (repo convention `feature/<id-name>`). Every implementer reads `PLAN.md`, `CLAUDE.md` and this file first.

Evidence caveat (applies to all scores): no Reddit, Quora or LeetCode Discuss pages were read directly. Discuss items are search snippets, many posts are 2018–2022. I discounted snippet-only themes by about one point on evidence. I did no additional web research: the top choice (retention/spaced repetition) is supported by three independent HN Show HN threads with real engagement (206, 178 points) plus several products, which is enough to decide; the lower ranks would not change with one more search.

---

## 1. Candidate long-list and scores

### Weights
| Criterion | Weight | Scale meaning |
|---|---|---|
| User value (V) | 0.25 | how much it relieves a real pain for a learner |
| Evidence (E) | 0.20 | independent sources, quality, recency, discounted for caveats |
| Differentiation vs LeetCode free (D) | 0.10 | missing or paywalled there |
| Fit (F) | 0.10 | single-instance self-hosted, our stack, 20 problems, 2 languages, no external services |
| Effort (Ef) | 0.10 | 5 = small |
| Risk (R) | 0.10 | security / complexity / judge correctness; 5 = low risk |
| Synergy (S) | 0.15 | with other candidates and with the learning / university feel |

Total = 0.25V + 0.20E + 0.10D + 0.10F + 0.10Ef + 0.10R + 0.15S (max 5.00).

### Scores
| # | Candidate (theme) | V | E | D | F | Ef | R | S | Total | Rationale / uncertainty |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | Review queue: spaced re-solve scheduler, mastered state (T1) | 5 | 5 | 5 | 5 | 3 | 4 | 5 | **4.70** | Strongest, most consistent theme: ~13 sources incl. two HN Show HN with 100+ comments, many self-built tools. Missing on LC. Self-contained. HN counterpoint (re-solve, not re-read) shapes the design: blank editor, hidden past code. |
| C2 | Guided hints (3 levels) + approach + complexity + reference solution (T4, T3 editorial paywall) | 4 | 4 | 4 | 5 | 3 | 5 | 5 | **4.25** | Hint/editorial tools exist because LC hints are coarse and editorials paywalled/uneven. We already own `solution.py/js` for every problem, so the "solution" part is free; hints are 60 short texts to author. Evidence is mostly snippets of tools (LeetSmith, LeetCopilot), so E=4 not 5. |
| C3 | Interview mode: timed session, hidden difficulty/tags, help locked, report (T9, T10 hide-difficulty) | 4 | 3 | 4 | 5 | 3 | 4 | 4 | **3.80** | LC's version is Premium; timer + hide-difficulty extensions have 10K+ users (third-party counts, snippet). Solo mode only; no human/peer mocks. |
| C4 | Personal notes per problem + Markdown export of my notes and accepted code (T12, T11) | 3 | 3 | 3 | 5 | 5 | 5 | 4 | **3.75** | Mild individually, but cheap and feeds C1 (recall summary) and data ownership (LeetHub has tens of thousands of users, though that is GitHub sync, not export; I am inferring the need transfers). |
| C5 | Test-case workbench: saved custom cases, run many at once, expected from reference solution, "add failed case", clickable error lines (T6, part of T2) | 4 | 3 | 4 | 5 | 2 | 3 | 3 | **3.55** | Long-standing pain ("passes examples, fails hidden"). MVP allows one unsaved custom input with no expected. Reference-solution expected is a strong unique lever. Highest judge risk of the chosen set; scope shrunk. |
| C6 | Curated study tracks / roadmap (Grind 75, NeetCode style) | 3 | 3 | 2 | 4 | 3 | 5 | 5 | 3.50 | Proven demand via alternatives and very "university". But with 20 problems a track is barely different from the catalog. Defer until ≥50 problems. |
| C7 | Per-topic progress and "next problem from weakest topic" (T10) | 3 | 2 | 3 | 4 | 4 | 5 | 4 | 3.35 | Asked for in Lanki/Blind comments. With 20 problems and 10 tags, recommendations are near-trivial. Defer. |
| C8 | Empirical complexity estimator (run at growing n, fit curve) (T8) | 4 | 3 | 5 | 4 | 2 | 2 | 3 | 3.35 | Attractive differentiator, but needs per-problem input generators, more sandbox time per submit, and curve fitting on noisy small-n Python timings misclassifies (false "O(n^2)" would erode trust). Authored complexity in C2 covers "what is expected". Defer. |
| C9 | Hide-difficulty toggle in catalog (T10) | 2 | 3 | 3 | 5 | 5 | 5 | 3 | 3.35 | Folded into C3 (interview hides difficulty). Standalone deferred. |
| C10 | Editorial/video corpus (T4, T3) | 4 | 4 | 3 | 2 | 1 | 4 | 3 | 3.25 | Rejected at scale (content). Its valuable core (approach + complexity + code) is in C2. |
| C11 | Editor settings: Vim mode, font size, resizable/persisted split (T2) | 3 | 3 | 2 | 5 | 4 | 4 | 2 | 3.15 | Complaints are mainly about LC's redesign, which our layout does not inherit; LC already has Vim. Nice polish, not a pain reliever. Defer. |
| C12 | Custom lists / bookmarks (T12) | 2 | 3 | 2 | 5 | 4 | 5 | 3 | 3.15 | Low value with 20 problems; review queue covers "revisit later". Defer. |
| C13 | Clickable error line numbers (T2, T6) | 2 | 2 | 2 | 5 | 5 | 5 | 3 | 3.05 | Folded into C5. |
| C14 | LLM hints / explanations (T4, T8) | 4 | 3 | 3 | 2 | 3 | 2 | 3 | 3.05 | Needs an API key and an external service (PLAN: no external services), cost, prompt injection via user code, spoiler control. Defer as optional later. |
| C15 | Stable runtime display, no "beats %" percentile (T7) | 2 | 3 | 2 | 5 | 4 | 4 | 2 | 2.90 | MVP already shows absolute runtime with no percentile on an uncontended local judge, so the pain is mostly absent. No work. |
| C16 | Company tags with frequency (T3) | 4 | 4 | 3 | 1 | 1 | 2 | 1 | 2.65 | Rejected: needs crowdsourced interview data we cannot produce; scraping LC Premium is a ToS/legal risk. |
| C17 | Private group leaderboard / shared lists (T14) | 2 | 2 | 3 | 4 | 3 | 4 | 2 | 2.60 | Only valuable for a multi-user instance; weak evidence. Defer. |
| C18 | Virtual contests for a group (T13) | 2 | 2 | 3 | 3 | 2 | 3 | 3 | 2.45 | Needs a group and fresh problems. Defer. |
| C19 | Tree/list visualizer (T6) | 3 | 2 | 4 | 1 | 2 | 3 | 2 | 2.45 | Our type system has no ListNode/TreeNode (out of MVP). Reject until those types exist. |
| C20 | Step debugger / variable trace (T2, T6) | 3 | 2 | 4 | 3 | 1 | 2 | 2 | 2.45 | Interactive debugging inside a `--network none` one-shot container is a large, risky judge change. `print` + stdout already works. Reject for now. |
| C21 | More languages (Java/C++/Go/Rust) | 3 | 2 | 2 | 3 | 2 | 3 | 2 | 2.45 | Each needs an image, harness and calibrated limits; not a research pain beyond one Trustpilot line. Defer. |
| C22 | GitHub sync of accepted solutions (T11) | 2 | 3 | 2 | 2 | 3 | 2 | 2 | 2.30 | Requires storing GitHub tokens and outbound network from web; self-hosting plus C4 export covers ownership. Reject. |
| C23 | Public Discuss / solutions community (T5) | 2 | 3 | 2 | 1 | 2 | 2 | 2 | 2.10 | Needs an audience; spam/moderation cost first. Reject. |
| C24 | Live rated public contests / Elo difficulty (T13, T10) | 2 | 3 | 2 | 1 | 1 | 1 | 1 | 1.85 | Needs thousands of concurrent users and anti-cheat. Reject. |
| C25 | Human / peer mock interviews (T9) | 3 | 2 | 2 | 1 | 1 | 2 | 1 | 1.80 | Needs a marketplace of interviewers. Reject; C3 is the solo substitute. |

---

## 2. Decision

### Chosen, in priority order
| Priority | ID | Feature | Score | Size |
|---|---|---|---|---|
| 1 | **F1** | Review queue (spaced re-solve) | 4.70 | M |
| 2 | **F2** | Guided hints and solution | 4.25 | M (content-heavy) |
| 3 | **F3** | Interview mode | 3.80 | M |
| 4 | **F4** | Notes and export | 3.75 | S |
| 5 | **F5** | Test-case workbench | 3.55 | M (upper end, scope shrunk) |

Five are chosen because each is backed by an independent theme and they compose into one learning loop: solve (F5 debug, F2 help) → record (F4 note) → re-solve later (F1) → test under pressure (F3), with F1 learning from F2/F3 signals.

### Recommended implementation order (dependencies)
1. **F2** first: adds `reference_solutions`, hints and reveal tracking. F1 reads reveals for the suggested rating, F3 locks reveals, F5 uses reference solutions for expected output.
2. **F1**: uses F2 reveals (soft dependency: if F2 is absent, suggested rating defaults to Good).
3. **F4**: small; adds "Your note" on the F1 review card.
4. **F3**: needs F2 (lock help), F1 ("Practice later" enrolls into review), F4 (hide notes).
5. **F5**: needs F2's `reference_solutions` column; independent of F1/F3/F4.

Each feature is one branch, one implementer, then reviewer + tester as in PLAN section 11. A feature that finds a dependency missing must stop and report, not stub it.

### Rejected / deferred
| Item | Decision | Reason |
|---|---|---|
| Company tags / frequency (C16) | Reject | Needs crowdsourced interview data we cannot produce; scraping LC is a ToS/legal risk; even LC's list was called inaccurate. |
| Editorial / video corpus at scale (C10) | Reject (core kept in F2) | Content authoring at scale and copyright risk. F2 gives each problem an original approach note plus our verified reference code. |
| Public Discuss community (C23) | Reject | Network effect needed; spam and moderation before any audience. |
| Live public contests, Elo/rating from own data (C24) | Reject | Needs large concurrent audience, weekly fresh problems, anti-cheat; statistically meaningless on one instance. |
| Human / peer mocks (C25) | Reject | Needs an interviewer marketplace. F3 is the solo substitute. |
| GitHub sync (C22) | Reject | Token storage and outbound network for little gain over F4 export on a self-hosted instance. |
| Tree/list visualizer (C19) | Reject for now | No ListNode/TreeNode types. Revisit if those types are added. |
| Step debugger (C20) | Reject for now | Large, risky sandbox change; stdout printing already available. |
| Empirical complexity estimator (C8) | Defer (first in line after these five) | Needs input generators per problem and robust timing; misclassification risk. F2's authored complexity covers the immediate need. |
| Study tracks (C6), per-topic recommendations (C7), lists/bookmarks (C12) | Defer | Low value with 20 problems; revisit at ≥50 problems. |
| Editor settings / Vim (C11) | Defer | Polish, weak link to a pain our layout actually has. |
| LLM hints (C14) | Defer | External service, keys, cost, prompt-injection and spoiler risks; conflicts with "no external services". |
| Group leaderboard (C17), virtual contests (C18), more languages (C21) | Defer | Need a group or heavy judge work; weak evidence. |
| Stable runtime (C15) | No work | MVP already shows absolute runtime with no percentile. |

---

## 3. Shared conventions for all features

- **Mutating handlers** follow PLAN section 6 check order exactly: (1) `assertSameOrigin()` (Content-Type + Origin) → 403; (2) `requireUser`-style auth → 401; (3) Content-Length limit → 413, `readJsonBody()` + Zod → 400; (4) per-field byte limits → 413, `\u0000` in any string → 400; (5) slug exists and published → 404; (6) state checks → 409, rate limits → 429 + `Retry-After`; (7) write. Rejected requests write nothing. All responses `Cache-Control: no-store`.
- **Rate limits.** Where a log table exists, count rows in the DB inside the write transaction (as PLAN does). Where none exists, use one new in-process helper `src/server/http/rate-limit.ts` (`checkRateLimit(key, limit, windowMs)` → `{ok} | {retryAfterSec}`, sliding window, Map with periodic pruning). It is acceptable because the app is single-instance; document that in its header comment. Limits are env vars with defaults added to `src/server/env.ts` and `.env.example`.
- **UI** uses design-system components only (Card, Button, Badge, Tabs, Accordion, Dialog/AlertDialog, Table, Progress, Callout/Alert, EmptyState, Skeleton, Toast, Tooltip, Textarea, Select, RadioGroup). If a needed component is missing, add it to the design system (`src/components/ui`) in the same branch rather than styling ad hoc. No colors in specs: use the design system's semantic variants (e.g. Badge `success`/`warning`/`muted`).
- **All user-visible text in English.** All new pages have loading skeleton, empty state, error boundary, and pass `@axe-core/playwright` with 0 serious/critical in both themes (extend the M7 a11y test list).
- **Times** are stored as `timestamptz`; the server is the time authority.
- Every AC is verified by a named test or a described browser scenario; the reviewer reports `AC-ID → pass/fail → how`.

---

## 4. Feature specs

### F1. Review queue (spaced re-solve)

**User story.** As a learner who has solved problems, I want the app to bring each solved problem back at growing intervals and make me re-solve it from a blank editor, so that I keep the patterns instead of forgetting them weeks later.

**Scope in**
- Grading a problem after an accepted submit with Again / Hard / Good / Easy; this enrolls it in review.
- Deterministic Leitner-style scheduler (pure function, no FSRS).
- `/review` page: due now, upcoming 14 days, mastered; bulk "Add all solved problems".
- Review mode on the problem page: blank template, separate draft, past submissions and notes collapsed.
- Header nav item "Review" with due-count badge.
- Remove from review, bring back from mastered.

**Scope out (cut)**: FSRS/SM-2 ease factors, streaks, calendar heatmap, email/push reminders, daily new-problem limits, snooze, per-pattern scheduling, timezone-aware day boundaries.

**Scheduler (pure function `schedule(prev | null, rating, now)` in `src/lib/review/schedule.ts`)**
- Stages (box) 0–6 with intervals in days `[1, 3, 7, 14, 30, 60, 120]`.
- First grade (no item): again → box 0, hard → 1, good → 2, easy → 3.
- Existing active item: again → box 0 and `lapses += 1`; hard → same box; good → box + 1; easy → box + 2; capped at 6.
- If the item was at box 6 and rating is good or easy → `state = 'mastered'`, `due_at = null`.
- `due_at = now + interval(box) × 24h − 4h` (4-hour grace so a daily habit at a similar time works). Item is "due" when `due_at <= now`.
- **Suggested rating** shown preselected in the prompt (user can change it): `again` if the user revealed the F2 solution (level 4) for this problem since `last_reviewed_at` (or ever, for first grade); `hard` if any F2 hint was revealed in that window; otherwise `good`.

**UX flow**
1. *Submit result panel (problem page).* After an `accepted` submit, if the problem is not in review or is due, show a Card "Add to your review queue" (first time) or "How did this review go?" (review mode): RadioGroup/segmented Buttons Again / Hard / Good / Easy, each with helper text showing the next due ("in 3 days"), suggested option preselected, primary Button "Save", secondary "Not now". If the problem is in review and not due, show a muted line "In review, next on <date>" with no prompt. Success → Toast "Next review: <date>".
2. *Review mode.* `/problems/[slug]?review=1` (link from `/review`): Callout at top of the description: "Review: solve it from scratch. Your notes and past submissions are hidden until you finish." with link Button "Show anyway" (reveals for the session). Editor loads the starter template, not the normal draft; draft key `review:<slug>:<language>` in localStorage. The Submissions tab and Notes tab (F4) are collapsed behind "Show anyway". A "Give up" Button opens AlertDialog "Mark as Again? It will come back tomorrow." → grade `again`.
3. *`/review` page.* Header stat strip (4 small Cards): Due now, In review, Mastered, Reviews in the last 7 days. Section "Due now": Table/list rows (title link, difficulty Badge, tags, stage "Stage 3 of 7", last reviewed relative date, Button "Start review" → review mode, overflow menu "Remove from review"). Section "Upcoming" (next 14 days): grouped by date, count + titles. Section "Mastered": list with "Bring back" Button. States: loading Skeleton; empty (no items) EmptyState "Nothing to review yet" + text explaining the loop + Button "Add all solved problems (N)" (disabled when N=0, with link to /problems); none due EmptyState "All caught up. Next review on <date>."; guest → redirect `/login?next=/review`.
4. *Header.* Nav item "Review" for signed-in users, Badge with due count when > 0 (count capped as "99+").

**Data model** (migration `00NN_f1_review_queue.sql`)
- enum `review_rating`: `again | hard | good | easy`; enum `review_state`: `active | mastered`.
- `review_items`: `user_id uuid FK users ON DELETE CASCADE`, `problem_id uuid FK problems ON DELETE CASCADE`, `box smallint not null` CHECK 0..6, `state review_state not null default 'active'`, `due_at timestamptz null`, `last_reviewed_at timestamptz not null`, `reviews_count int not null default 1`, `lapses int not null default 0`, `created_at`. PK `(user_id, problem_id)`. CHECK `(state = 'active') = (due_at IS NOT NULL)`. Index `(user_id, due_at) WHERE state = 'active'`.
- `review_logs`: `id uuid pk`, `user_id` FK cascade, `problem_id` FK cascade, `rating review_rating`, `box_before smallint null`, `box_after smallint`, `state_after review_state`, `submission_id uuid null FK submissions ON DELETE SET NULL`, `created_at`. Index `(user_id, created_at desc)`.
- "Remove from review" deletes the item (logs kept).

**API**
| Method | Path | Body | Behaviour |
|---|---|---|---|
| POST | `/api/review/grade` | `{slug, rating}` | Validates (Zod strict). Requirement: for `hard/good/easy` the user must have an `accepted` `submit` for this problem with `created_at > last_reviewed_at` (or any accepted submit if no item) → else 409 "Solve it first". `again` allowed for any published problem. If item exists, is active, and `due_at > now`, grading `hard/good/easy` is still allowed only if that fresh accepted submit exists (early review is fine). Mastered item → 409 "Problem is mastered; bring it back first". Transaction with `pg_advisory_xact_lock(hashtext(user_id))`: rate limit `REVIEW_GRADE_PER_MIN=30` by counting `review_logs` in last 60 s → 429; upsert item via `schedule()`; insert log. 200 `{item: {slug, box, state, dueAt, lastReviewedAt}}`. |
| POST | `/api/review/enroll-solved` | `{}` | Enrolls every solved problem without an item: `box = 2`, `due_at` spread evenly over the next 7 days (problem i of n gets `now + ceil((i+1)×7/n) days − 4h`, ordered by first accepted date ascending) so the queue does not arrive at once. Logs rating `good` per item. In-process limit 5/min. 200 `{added}`. |
| POST | `/api/review/item` | `{slug, action: 'remove' \| 'restore'}` | `remove` deletes the item (404 if none). `restore` sets mastered → active, `box = 3`, `due_at = now + 1d − 4h` (409 if not mastered). In-process limit 30/min. |

Server components read `/review` data and the header count directly (one count query using the partial index). Body limit for these routes: 2 KB.

**Worker/judge changes**: none.

**Security/abuse**: per-user data only; every query filters by `user_id` from the session; slugs resolve to published problems; no user-supplied ids. Grading cannot be inflated without real accepted submits (the 409 rule), though it is self-only data anyway.

**Acceptance criteria**
- **AC-F1-1** `schedule()` unit tests cover: each first-grade mapping; again/hard/good/easy transitions from boxes 0, 3, 5, 6; cap at 6; mastering from box 6 with good and easy; `again` from box 6 returns to 0 and increments lapses; `due_at` equals `now + days×24h − 4h` for an injected `now`.
- **AC-F1-2** Migration applies on a DB at M7 head; integration test: PK uniqueness, CHECK `active ⇔ due_at not null`, cascade on user delete.
- **AC-F1-3** Integration (API): `good` without any accepted submit → 409, no rows; with an accepted submit → 200, item box 2, log row; second `good` without a newer accepted submit → 409; after a new accepted submit → 200 box 3.
- **AC-F1-4** Integration: `again` on a published problem with no submits → 200, item box 0, due ≈ now+20h; on unknown/unpublished slug → 404; mastered item graded → 409.
- **AC-F1-5** Negative cases for all three routes (each a test, each writes nothing): wrong Content-Type / foreign Origin → 403; no session → 401; invalid body / unknown `rating` / extra keys → 400; body > 2 KB → 413; 31st grade within a minute → 429 with `Retry-After`.
- **AC-F1-6** `enroll-solved`: user with 7 solved problems (fixtures) → 7 items, due dates spread over 7 days (each `due_at` within `[now+1d−4h, now+7d−4h]`, at least 4 distinct dates); second call → `{added: 0}`.
- **AC-F1-7** E2E (Playwright, Python): register → solve Two Sum → Accepted → prompt shows "Add to your review queue" with Good preselected → Save → Toast with date → `/review` shows it in Upcoming, header badge absent. Then move `due_at` to the past via test helper → reload → header badge "1", row in Due now → Start review → editor contains the starter template (not the previous code) and the Submissions tab is collapsed → submit correct code → prompt "How did this review go?" → Good → row moves to Upcoming with stage 4 of 7.
- **AC-F1-8** E2E: "Give up" in review mode → confirm → item stage 1 of 7, due tomorrow.
- **AC-F1-9** With F2 present: revealing hint 1 then solving → prompt preselects Hard; revealing the solution → preselects Again (component/integration test of the suggestion function with fixture reveals).
- **AC-F1-10** `/review` empty state shows "Add all solved problems (N)" with correct N; guest visiting `/review` → redirect to `/login?next=/review`; axe 0 serious/critical in both themes.
- **AC-F1-11** Remove and Bring back work from `/review` (e2e or integration on the API plus a component test of the menu).
- **AC-F1-12** Query-count test: `/review` renders with ≤ 4 queries; header badge adds exactly 1 query per page for signed-in users and 0 for guests.

**Test plan**: unit (scheduler, suggestion function, spread function); integration (API routes, constraints, rate limit, enroll); e2e (AC-F1-7/8); a11y (`/review`).

**Size**: M.

**How we will know it's useful (browser check)**: solve 3 problems, grade them differently, fake time forward (helper or DB edit), and confirm that `/review` brings back exactly the expected ones in the expected order, that the re-solve really starts from a blank template with past code out of sight, and that the prompt's suggestion reflects hint use. Ask: would I come back daily for this badge? If the due list feels like noise (too many at once), the spread and intervals are wrong.

---

### F2. Guided hints and solution

**User story.** As a learner who is stuck, I want to reveal help one step at a time (a nudge, then a direction, then the plan, then a full explained solution), so that I get unstuck without being handed the answer, and I can always see a correct, explained solution for free once I have solved it or given up.

**Scope in**
- Per-problem content file `problems/<slug>/hints.json`: exactly 3 hints, an approach write-up (Markdown), time/space complexity.
- Importer stores hints, approach, complexity and the reference solutions (`solution.py`, `solution.js`) in the DB.
- "Hints" accordion on the problem page with sequential reveal and server-side reveal tracking; level 4 "Solution" (approach + complexity + reference code in both languages).
- Content authoring for all 20 seed problems.

**Scope out (cut)**: AI hints, videos, multiple community solutions, per-hint feedback ("was this helpful"), hint usage stats for others.

**Content format** `problems/<slug>/hints.json` (Zod `hintsSchema` in `src/lib/problems/schema.ts`, strict):
```json
{
  "hints": ["level 1: observation", "level 2: direction", "level 3: plan"],
  "approach": "Markdown: idea, why it works, step list, edge cases.",
  "complexity": { "time": "O(n)", "space": "O(n)" }
}
```
Rules enforced by the importer: exactly 3 hints, each trimmed length 20–400 chars; hints 1–2 contain no code fence (```` ``` ````) and no inline code longer than 30 chars; approach 300–3000 chars; complexity values match `/^O\([^\n]{1,30}\)$/`; file required for every problem (missing → importer fails with the slug, non-zero exit). Unit-test fixture problems get minimal valid `hints.json`.

**Hint levels (authoring rubric)**
- Hint 1, *observation*: points at what to notice in the input or the question ("What do you need to remember about earlier elements to answer quickly for the current one?"). Must not name the data structure or algorithm.
- Hint 2, *direction*: names the technique or data structure and what it stores ("A hash map from value to index lets you check the complement in O(1).").
- Hint 3, *plan*: the step-by-step plan in prose, including the key edge case, no code.
- Approach: why it works (invariant or recurrence), steps, edge cases, a note on the naive approach and why it is slower. May include short pseudo-code. Written in own words, not adapted from LeetCode editorials.
- Complexity: must match the reference solution in `solution.py` (the reviewer checks both against the code).

**UX flow**
- Description column, below the statement and samples (on mobile inside the Description tab): Accordion "Hints" with 4 items: "Hint 1", "Hint 2", "Hint 3", "Solution".
- Locked hint item: collapsed content shows "Reveal hint N" Button. Hint N+1's Button is disabled with Tooltip "Reveal hint N first" until N is revealed. Revealed hints stay expanded-able and persist across reloads and devices (server-tracked).
- Solution item states: (a) user has an accepted submit → "Show solution" Button, no confirmation; (b) all 3 hints revealed, not solved → "Show solution" opens AlertDialog "See the full solution? This problem will be suggested for early review." Confirm/Cancel; (c) otherwise disabled with text "Available after you solve it or reveal all hints". Revealed solution: approach Markdown (same sanitized renderer), two Badges "Time O(n)" "Space O(n)", Tabs Python / JavaScript with a read-only code block (default tab = current editor language).
- Guest: the accordion is visible with item titles; any reveal Button → redirect to `/login?next=/problems/<slug>`.
- Loading: Button shows spinner while revealing; error → inline Callout "Could not load the hint. Try again."
- F3 lock: during an active interview containing this problem, the accordion is not rendered at all (F3 owns that).

**Data model** (migration `00NN_f2_guided_hints.sql`)
- `problems`: add `hints jsonb not null default '[]'`, `approach_md text null`, `complexity jsonb null` (`{time, space}`), `reference_solutions jsonb null` (`{python: string, javascript: string}`). Importer fills them on every import (in the existing transaction).
- `hint_reveals`: `user_id` FK users cascade, `problem_id` FK problems cascade, `level smallint` CHECK 1..4 (4 = solution), `revealed_at timestamptz default now()`. PK `(user_id, problem_id, level)`.
- **Never send unrevealed content to the client**: the problem page server component loads the user's reveals and passes only revealed levels' content; the problem DTO/serializer used by the page omits `hints`, `approach_md`, `complexity`, `reference_solutions` otherwise. `reference_solutions` is never selected by catalog/profile queries.

**API**
| Method | Path | Body | Behaviour |
|---|---|---|---|
| POST | `/api/problems/:slug/hints/reveal` | `{level: 1..4, confirm?: boolean}` | Check order from section 3. 409 if level > 1 and level−1 not revealed (for level 4: needs either an accepted submit, or level 3 revealed **and** `confirm: true`; else 409 with a message saying which). 409 "Hints are locked during an interview" when F3 is present and the user has an active session containing the problem. Idempotent: re-revealing returns the content again with 200 and no new row. Rate limit in-process `HINT_REVEAL_PER_MIN=30`. Body ≤ 1 KB. 200 `{level, hint}` for 1–3; `{level: 4, approach, complexity, solutions: {python, javascript}}` for 4. |

**Worker/judge changes**: none. `problems:verify` already proves the reference solutions are correct; add to it a check that every problem has a valid `hints.json` (reuses the Zod schema).

**Security/abuse**: content leaks are the main risk: covered by the "never send unrevealed content" rule and AC-F2-4. Markdown rendered with the existing `rehype-sanitize` pipeline. Reference code rendered as text in a code block, never as HTML.

**Content work (must be done in this branch)**
- Write `hints.json` for all 20 problems in `problems/` (60 hints, 20 approaches, 20 complexity pairs) following the rubric.
- Verification: (1) `pnpm problems:import` passes on all 20 (Zod rules above); (2) unit test `tests/unit/problem-hints.test.ts` loads every `problems/*/hints.json` and asserts the rules plus: hint 1 does not contain any of the words `hash map|hashmap|dictionary|stack|queue|heap|binary search|two pointers|sliding window|dynamic programming|dp|greedy|sort` (case-insensitive) as a crude spoiler guard; (3) the reviewer reads all 20 against the rubric and records a table `slug → hint1/2/3 OK, approach explains why, complexity matches solution.py/js` in the report, fixing any that fail. Expected complexity per problem must match what `solution.py` actually does (e.g. Two Sum O(n)/O(n); Edit Distance O(m·n) time).

**Acceptance criteria**
- **AC-F2-1** All 20 problems have `hints.json`; `pnpm problems:import` and `pnpm problems:verify` pass; removing one file makes import fail with the slug in the message and non-zero exit (unit/integration test with a temp dir).
- **AC-F2-2** Importer Zod rules covered by unit tests: 2 or 4 hints, short hint, code fence in hint 1, short approach, bad complexity string, extra keys → each rejected with a clear message.
- **AC-F2-3** After `pnpm db:seed`, every problem row has 3 hints, approach, complexity and both reference solutions equal to the files (integration test).
- **AC-F2-4** Leak test (integration): for a signed-in user with no reveals and for a guest, the HTML of `/problems/two-sum` (fetched via `fetch` against a running server or rendered RSC payload) does not contain any of the 3 hint strings, the approach text, or the reference code. After revealing level 1 only, it contains hint 1 and not hints 2–3.
- **AC-F2-5** API (integration): reveal 2 before 1 → 409; reveal 1, 2, 3 → 200 each with the right text; reveal 4 without accept and without confirm → 409; with confirm after level 3 → 200 with approach, complexity, both solutions; reveal 4 directly for a user with an accepted submit → 200; repeat reveal → 200 and still one row per level.
- **AC-F2-6** Negative cases (each writes nothing): 403 (Content-Type/Origin), 401, 400 (level 0, 5, string, extra key), 413 (body > 1 KB), 404 (unknown/unpublished slug), 429 after 30/min with `Retry-After`.
- **AC-F2-7** E2E: open Valid Parentheses → Hint 2 disabled → reveal Hint 1 → text appears → reload → still revealed → reveal 2, 3 → Solution → confirm dialog → approach, complexity Badges and code tabs shown; switching to JavaScript tab shows `solution.js` content.
- **AC-F2-8** E2E (guest): clicking "Reveal hint 1" redirects to login with `next` back to the problem.
- **AC-F2-9** Content review table for all 20 problems is in the implementer/reviewer report; the spoiler-guard unit test passes.
- **AC-F2-10** axe 0 serious/critical on `/problems/two-sum` with the accordion open, both themes; the accordion is keyboard operable (Tab/Enter/Space).

**Test plan**: unit (Zod, spoiler guard, serializer omits fields); integration (import, API, leak test); e2e (AC-F2-7/8); a11y.

**Size**: M (code S, content M: plan about half the effort for writing and checking 20 hint sets).

**How we will know it's useful**: pick three problems you have not solved (one easy, one medium, one hard), try them, and use hints only when stuck. Hint 1 should unblock you sometimes without giving the technique away; by hint 3 you should be able to write the code; the solution should explain *why*, not just show code. If hint 1 regularly gives the answer away, or hint 3 still leaves you lost, rewrite those hints.

---

### F3. Interview mode

**User story.** As someone preparing for interviews, I want a timed session on a random problem I have not seen, with difficulty, tags and all help hidden, and a short report at the end, so that I can practice under realistic pressure for free.

**Scope in**
- `/interview` setup, `/interview/[id]` session workspace with server-authoritative countdown, `/interview/[id]/report`, history list on `/interview`.
- 1 or 2 problems per session; difficulty choice; duration presets; random selection preferring unseen problems.
- Locks: hints/solution (F2), notes (F4), past submissions, difficulty and tags hidden while active.
- Report with per-problem outcome; "Practice later" adds unsolved problems to review (F1).

**Scope out (cut)**: AI interviewer, voice/think-aloud recording, peer sessions, global "hide difficulty" catalog setting, pausing, more than 2 problems, company-style question sets.

**UX flow**
1. *`/interview` (signed in; guest → login redirect).* Card "Start a mock interview": RadioGroup Problems (1 / 2); Select Difficulty (Easy, Medium, Hard, Mixed); duration Select with presets that depend on the choice (1 easy 20 min, 1 medium 35, 1 hard 50, 2 problems 45/60/75; any preset editable to 10–120 min in 5-min steps); Select default language (Python/JavaScript). Checkbox "Prefer problems I haven't tried" (default on). Primary Button "Start interview". Below: "Past interviews" Table (date, duration used, problems solved x/y, link to report); EmptyState "No interviews yet". If a session is active: Callout "You have an interview in progress" with Button "Resume" instead of the form.
2. *`/interview/[id]` (active).* Same split workspace component as the problem page, parameterised: title shown, difficulty Badge and tags hidden, Hints accordion, Notes tab, Submissions tab, and links to the normal problem page are not rendered. Top bar: countdown (mm:ss, `aria-live="polite"` announcements at 5 min and 1 min left), Tabs "Problem 1 / Problem 2" when 2 problems (each with a solved check icon when accepted), Button "Finish interview" (AlertDialog confirm). Run and Submit work normally, and submits carry the session id. Editor drafts keyed `interview:<id>:<slug>:<language>`.
3. *Time up.* When the countdown reaches 0 the client disables Run/Submit and navigates to the report; the server also rejects late submits (409). Reloading an expired session URL redirects to the report.
4. *Report `/interview/[id]/report`.* Summary Card: time used / allotted, solved x/y. Per-problem Card: title (link to the normal problem page), difficulty and tags now visible, outcome Badge (Solved in time / Not solved), time to first accepted (mm:ss from start), number of submits and wrong attempts, languages used, link to the accepted submission. For unsolved problems: Button "Practice later" (F1 grade `again`; shows "Added to review" after) and link "See hints" to the problem page. Only the owner can view (others 404).

**Problem selection (server, `src/server/interview/pick.ts`, injectable RNG)**: pool = published problems of the chosen difficulty (Mixed with 2 problems = one easy-or-medium plus one medium-or-hard; Mixed with 1 = any). With "prefer unseen": order buckets todo → attempted → solved, pick uniformly at random within the first non-empty bucket(s) until N chosen; exclude problems used in the user's last 3 sessions when the pool allows. Not enough problems → 409 "Not enough problems for this setup".

**Data model** (migration `00NN_f3_interview_mode.sql`)
- `interview_sessions`: `id uuid pk`, `user_id` FK cascade, `language language`, `duration_min smallint` CHECK 10..120, `difficulty text` CHECK in (easy, medium, hard, mixed), `started_at timestamptz not null default now()`, `ends_at timestamptz not null` (set by the server to `started_at + duration_min`), `finished_at timestamptz null`, `created_at`. Index `(user_id, started_at desc)`. Partial unique index `(user_id) WHERE finished_at IS NULL` enforces one open session per user (an expired-but-unfinished session is closed lazily: any read/start sets `finished_at = ends_at` when `now > ends_at`).
- `interview_problems`: `session_id` FK cascade, `problem_id` FK problems, `position smallint` (1..2). PK `(session_id, position)`, UNIQUE `(session_id, problem_id)`.
- `submissions`: add `interview_session_id uuid null FK interview_sessions ON DELETE SET NULL`; index `(interview_session_id) WHERE interview_session_id IS NOT NULL`. Interview submits are normal submits (they count for solved status, acceptance and history).
- Active = `finished_at IS NULL AND now() < ends_at`.

**API**
| Method | Path | Body | Behaviour |
|---|---|---|---|
| POST | `/api/interview` | `{problems: 1\|2, difficulty, durationMin, language, preferUnseen}` | Check order; 409 if an active session exists; in-process limit `INTERVIEW_START_PER_HOUR=10`; picks problems, inserts session + problems in one transaction under the user advisory lock. 201 `{id}`. |
| POST | `/api/interview/:id/finish` | `{}` | Owner only (else 404). Sets `finished_at = least(now, ends_at)` if null. Idempotent 200. |
| POST | `/api/problems/:slug/run`, `/submit` (existing) | add optional `interviewSessionId` (uuid) | If present: session must belong to the user (else 404), be active (else 409 "Interview is over"), and contain the problem (else 400). Stored in `submissions.interview_session_id`. Existing limits unchanged. |
| (F2) `/hints/reveal` | | | 409 when the user has an active session containing the problem (also when the request comes from the normal problem page: no side door). |
| (F4) notes PUT | | | Writes allowed, but the notes tab is hidden in the session UI; GET of a note is not exposed by API, so nothing to lock server-side beyond hiding. |
| (F1) grade | | | "Practice later" calls the existing grade endpoint with `again`. |

The session page is a server component; the countdown uses `ends_at` and the server's `now` passed as props (client computes the offset once; no polling needed). Session page and report are `dynamic = 'force-dynamic'`.

**Worker/judge changes**: none.

**Security/abuse**: lock enforcement is server-side (hint reveal 409, late submit 409). The normal problem page for a problem in an active session should show a Callout "This problem is part of your active interview" with a link back, and must not render hints either (same server check). Session ids are uuids and every query filters by owner. Hiding difficulty is client-only by nature (the user could open the catalog in another tab); that is accepted: this is self-practice, not proctoring.

**Acceptance criteria**
- **AC-F3-1** `pick()` unit tests with seeded RNG: respects difficulty; prefers todo over attempted over solved; Mixed with 2 gives one from {easy, medium} and one from {medium, hard} with no duplicate; avoids last-3-session problems when the pool allows; returns a "not enough" error correctly.
- **AC-F3-2** Integration: start session → 201; second start while active → 409; after `ends_at` passes (helper moves time via DB), start → 201 and the old session gets `finished_at = ends_at`; partial unique index rejects two open sessions at DB level.
- **AC-F3-3** Integration: submit with `interviewSessionId` for a problem in the session → 202 and row has the session id; problem not in session → 400; other user's session → 404; expired session → 409; no rows written on rejection.
- **AC-F3-4** Integration: with an active session containing two-sum, hint reveal for two-sum → 409; for another problem → 200; after finish → 200.
- **AC-F3-5** Negative cases on `/api/interview` and `/finish`: 403, 401, 400 (durationMin 5 or 125, problems 3, unknown difficulty, extra key), 413 (> 2 KB), 429 (11th start in an hour).
- **AC-F3-6** E2E: start 1 easy, 20 min, Python → session page has countdown, no difficulty Badge, no tags, no Hints accordion, no Notes/Submissions tabs (assert by role/testid absence) → solve → tab shows solved check → Finish → report shows Solved in time, time to accepted, submits = 1, difficulty now visible.
- **AC-F3-7** E2E: start a 10-min session, then use a test hook to set `ends_at` to 5 s from now → countdown reaches 0 → Run/Submit disabled → redirected to report; a direct API submit afterwards → 409.
- **AC-F3-8** E2E (with F1): report for an unsolved problem → "Practice later" → `/review` shows it due tomorrow at stage 1 of 7.
- **AC-F3-9** Report and session pages return 404 for another user; `/interview` for guest → login redirect; axe 0 serious/critical on `/interview`, session page and report in both themes; countdown has an accessible name and live-region announcements at 5 and 1 min (component test with fake timers).

**Test plan**: unit (pick, duration presets, countdown formatting with fake timers); integration (API, locks, lazy close, index); e2e (AC-F3-6/7/8); a11y.

**Size**: M.

**How we will know it's useful**: run one real 20-minute session on an easy problem and one 45-minute session with 2 problems. Check that you genuinely do not know the difficulty, that you are not tempted by any visible help, that the timer is calm but present, and that the report tells you something actionable (time to accepted, wrong attempts) and gets unsolved problems into review in one click.

---

### F4. Notes and export

**User story.** As a learner, I want a short private note per problem (my approach in two lines, the trap I fell into), visible when I come back to it, and a one-click export of all my notes and accepted code, so that my learning record is mine and portable.

**Scope in**: one Markdown note per (user, problem), autosaved; Notes tab on the problem page; note shown collapsed on the F1 review row; `/api/me/export` Markdown download; a "My notes" count on the profile is **out**.

**Scope out (cut)**: rich-text editor, multiple notes per problem, note search, tags on notes, ZIP/JSON export, import, GitHub sync, sharing notes.

**UX flow**
- Problem page right-hand panel (next to Testcase/Result/Submissions): Tab "Notes". Textarea (monospace, placeholder "Your approach, key insight, mistakes to avoid…"), Toggle "Edit / Preview" (preview uses the same sanitized Markdown renderer), counter "1.2 / 8 KB", status text "Saved" / "Saving…" / "Could not save, retrying" (`aria-live="polite"`). Autosave 1 s after the last keystroke and on blur; empty note deletes it. Guest: tab shows "Sign in to keep notes" with a link.
- Review mode (F1) and interview (F3): Notes tab collapsed/hidden as specified there.
- `/review` (F1) rows: if a note exists, a "Your note" disclosure (collapsed by default) under the row.
- Profile page `/u/[username]` (own profile only, i.e. viewer = owner): Button "Export my work (.md)" → downloads file. Also in the user menu: "Export my work".

**Export format** (`GET /api/me/export`, `Content-Type: text/markdown; charset=utf-8`, `Content-Disposition: attachment; filename="LemmaYard-<username>-<YYYY-MM-DD>.md"`, `Cache-Control: no-store`):
```
# LemmaYard export: <username>
Exported <ISO date>. Solved <n> problems.

## 1. Two Sum (easy) · array, hash-table
First solved: 2026-10-01 · Link: <AUTH_URL>/problems/two-sum

### My note
<note markdown or "_No note._">

### Python (accepted 2026-10-03, 48 ms)
````python
<code>
````
```
Order by problem number. Includes every problem that is solved or has a note. Code: the latest accepted submit per language. Code fences use a backtick run longer than the longest run inside the code (min 3). Total output capped at 5 MB; if exceeded, code blocks are dropped from the oldest problems first and a line "_Code omitted: export size limit_" is written.

**Data model** (migration `00NN_f4_notes.sql`)
- `problem_notes`: `user_id` FK cascade, `problem_id` FK cascade, `body_md text not null` CHECK `octet_length(body_md) BETWEEN 1 AND 8192`, `updated_at timestamptz not null default now()`. PK `(user_id, problem_id)`.

**API**
| Method | Path | Body | Behaviour |
|---|---|---|---|
| PUT | `/api/problems/:slug/note` | `{body}` | Check order; body ≤ 10 KB → else 413; `body` UTF-8 bytes ≤ 8192 → else 413; `\u0000` → 400; trimmed empty → delete the note (204). Upsert → 200 `{updatedAt}`. In-process limit `NOTE_WRITES_PER_MIN=60`. |
| GET | `/api/me/export` | — | Auth required (401). In-process limit `EXPORT_PER_MIN=5`. Two queries: notes + latest accepted submits per (problem, language) (`DISTINCT ON`). Streams or builds the string. |

The note is loaded server-side with the problem page for the signed-in user. GET with cookie is safe from CSRF reads (SameSite=Lax + attachment, no CORS).

**Worker/judge changes**: none.

**Security/abuse**: notes are private: never rendered on public profile or for other users (test). Preview uses the sanitized renderer (XSS tests from AC-M3-5 reused on the note preview). Export contains only the requester's data.

**Acceptance criteria**
- **AC-F4-1** Migration + integration: PK, CHECK on length (8193 bytes rejected by DB), cascade.
- **AC-F4-2** API integration: PUT creates, PUT updates (`updatedAt` changes), PUT with whitespace deletes (204, no row); negative cases 403, 401, 400 (missing body, `\u0000`, extra key), 413 (8193-byte body field; 11 KB request), 404 (unknown slug), 429 at 61st write per minute; rejected requests change nothing.
- **AC-F4-3** E2E: type a note → "Saved" appears within 3 s → reload → note restored; Preview renders `**bold**` as bold and does not execute `<img src=x onerror=alert(1)>` (no dialog, no `onerror` attribute in DOM).
- **AC-F4-4** Privacy: user B cannot see user A's note on any page (integration: render problem page for B, string absent) and `/u/A` contains no note text.
- **AC-F4-5** Export unit tests (pure formatter): fence length exceeds code backtick runs (code containing ```` ``` ```` and ```` ```` ````), ordering by number, "_No note._" placeholder, cap logic drops oldest code first.
- **AC-F4-6** Export integration: user with 2 solved problems (one with Python and JS accepted submits, one with a wrong submit after an accepted one) + 1 note on an unsolved problem → file contains 3 sections, latest accepted code per language only, correct headers and filename; guest → 401; 6th export in a minute → 429.
- **AC-F4-7** With F1 present: `/review` row shows a collapsed "Your note" disclosure when a note exists, absent otherwise.
- **AC-F4-8** Export Button visible only on the viewer's own profile; axe 0 serious/critical on the Notes tab in both themes.

**Test plan**: unit (formatter, fence helper); integration (API, privacy, export); e2e (AC-F4-3); a11y.

**Size**: S.

**How we will know it's useful**: write notes on 3 solved problems, revisit one via the review queue and check the note is one click away but not in your face; download the export and open it in a Markdown viewer and on GitHub: it should read like a tidy study log, code blocks intact.

---

### F5. Test-case workbench

**User story.** As a learner whose solution passes the samples but fails a hidden test, I want to keep my own test cases for a problem, run them all at once, see the correct expected output computed by the reference solution, and turn a failed hidden case into one of my tests, so that I can debug edge cases myself instead of guessing.

**Scope in**
- Saved custom cases per (user, problem), max 8, synced server-side.
- Run executes all samples (toggleable) plus all custom cases in one submission.
- Optional user-provided expected per case; if absent, expected comes from running the reference solution (F2 `reference_solutions`) in a separate sandbox container.
- "Add to my tests" on a Wrong Answer failed case and on any custom-run result.
- Clickable `line N` references in runtime/compile error text that jump the editor to that line.

**Scope out (cut)**: random/edge-case generators, case labels, drag reorder, per-case time stats beyond existing `timeMs`, tree/list visualization, stdin/file input, running hidden tests visibly, debugger.

**UX flow** (right-hand "Testcase" tab, replacing the single custom-input box from M5)
- Case chips row: "Sample 1..k" (read-only, can be toggled off as a group with a Checkbox "Include samples") and "Case 1..m" (user cases) with a "+" Button (disabled at 8 with Tooltip "Up to 8 cases"). Selecting a chip shows its editor: one labelled input per parameter (JSON value, validated live with the shared type validator, inline error under the field), and an optional "Expected output" field with helper text "Leave empty to compute it with the reference solution". Delete Button on user cases. Edits autosave (debounce 1 s) via PUT; status text "Saved"/"Saving…".
- Run (existing button/shortcut) sends samples (if included) + all valid user cases. If any user case is invalid, Run is disabled with a message naming the case.
- Result tab: per case row (Sample 2 / Case 3): status Badge (Passed / Failed / Error / Time limit / Not run), input, output, expected with a small source label ("from tests" / "your expected" / "reference solution"), and when the reference could not run: Callout "The reference solution failed on this input (it may be outside the problem's constraints): <short error>", case shown as "Output only". Summary line "Passed 5/6".
- Submit result for Wrong Answer: Button "Add to my tests" under the failed case (disabled with Tooltip if the case data was truncated or the list is full); clicking adds input + expected as a new user case and switches to the Testcase tab.
- Custom result rows: "Save expected" link copies the reference output into the case's expected field.
- Error text: occurrences of `line N` (Python traceback `File "solution.py", line N` and JS `solution.js:N`) render as links; click → editor reveals line N and places the cursor there. Only lines within the editor's line count are linked.

**Judge/worker changes**
- `submissions`: add `run_cases jsonb null`: array of `{ source: 'sample'|'custom', index: number, input, expected?: unknown }` (expected present for samples always, for custom only when user-provided). The old `custom_input` column is no longer written for new runs; existing `customInput` request field remains accepted and is mapped to one custom case without expected (keeps M5 tests valid).
- `CaseResult` (frozen contract) gets **additive optional** fields: `source?: 'sample'|'custom'`, `expectedSource?: 'test'|'user'|'reference'`, `referenceError?: string`. Existing consumers must keep working (unit test of the DTO with old and new shapes).
- Worker for `kind=run` with `run_cases`: (1) run the user's code on all case inputs in one container (existing protocol, `tests: [{input}]`); (2) if any custom case lacks expected, run the problem's `reference_solutions[language]` in a **separate** container (same image, same flags, same per-test limits) on only those inputs; started in parallel with step 1 (`Promise.all`), each with its own wall-clock budget; (3) compare user output with expected (test / user / reference) using the problem's comparator; reference `ok` → `expectedSource='reference'`; reference error/timeout → no expected, `referenceError` set (≤ 300 chars, filtered like normal errors), case status `passed` if the user's code ran without error (output only). Run verdict: same rules as sample runs (all compared cases passed → `accepted`, any mismatch → `wrong_answer`, errors per precedence).
- The reference code must never run in the same container as user code (user code could read it from memory). Reference output is shown; reference code is not.
- Worker `WORKER_CONCURRENCY` semantics unchanged (a job may use two containers concurrently); document in README that peak containers = 2 × concurrency.
- If `reference_solutions` is null for the problem (should not happen after F2), custom cases without expected become output-only and the UI shows "Expected unavailable".

**Data model** (migration `00NN_f5_testcase_workbench.sql`)
- `user_test_cases`: `id uuid pk`, `user_id` FK cascade, `problem_id` FK cascade, `position smallint` CHECK 0..7, `input jsonb not null`, `expected jsonb null`, `updated_at`. UNIQUE `(user_id, problem_id, position)`.
- `submissions.run_cases jsonb null` (above).

**API**
| Method | Path | Body | Behaviour |
|---|---|---|---|
| PUT | `/api/problems/:slug/testcases` | `{cases: [{input, expected?}]}` (0..8) | Replace the whole list in one transaction. Each `input` validated against `signature.params` and `expected` against `signature.returns` with the shared validator (M1) → 400 with `fieldErrors` keyed `cases.<i>.input.<param>`. Each case ≤ 4 KB serialized, request ≤ 40 KB → 413. In-process limit `TESTCASE_WRITES_PER_MIN=60`. 200 `{count}`. |
| POST | `/api/problems/:slug/run` (existing) | `{language, code, includeSamples: boolean (default true), cases?: [{input, expected?}] (0..8), customInput?}` | `cases` and `customInput` mutually exclusive (400). Same validation as above. At least one case must be run (samples included or cases non-empty) → else 400. Content-Length limit for this route raised from 70 KB to 110 KB (code 64 KB + cases 40 KB); code limit unchanged. Same active/rate limits as M5 (a Run with reference counts once). Cases are passed in the body (not read from DB) so unsaved edits run as shown. |

Saved cases are loaded server-side with the problem page.

**Security/abuse**: reference solution in a separate container with identical isolation; reference code never leaves the server or worker logs; outputs and errors size-capped like normal runs (16 KB DTO truncation applies); the "oracle" (expected for any input) reveals nothing beyond what F2 already shows after solving, and hidden test inputs are not exposed by this feature. Doubling containers per Run: keep `MAX_ACTIVE_PER_USER=2`, so worst case per user is 4 containers; document. Validator prevents type confusion before anything reaches the sandbox.

**Acceptance criteria**
- **AC-F5-1** Migration + integration: UNIQUE `(user, problem, position)`, CHECK position 0..7, cascade.
- **AC-F5-2** PUT testcases integration: save 3 cases → 200, reload page data shows 3; save 0 → list cleared; 9 cases → 400; wrong type in input (`"nums": "abc"` for Two Sum) → 400 with `fieldErrors["cases.0.input.nums"]`; expected of wrong type → 400; case > 4 KB → 413; negative 403/401/404/429; rejected requests change nothing.
- **AC-F5-3** Worker integration on real Docker, both languages: Run Two Sum with samples + 2 custom cases (one with correct user expected, one without) using a correct solution → `accepted`, `caseResults` has 5 entries, the custom-without-expected has `expectedSource: 'reference'` and the reference value; with a wrong solution → `wrong_answer` and the failing custom case shows expected from the reference.
- **AC-F5-4** Worker integration: on a test fixture problem (created via the DB factory, not a seed problem) whose `reference_solutions` raise for negative input, a custom case with a negative value → case `passed` as output-only with `referenceError` set; a reference that exceeds the time limit → same treatment, user verdict not affected.
- **AC-F5-5** Isolation test: two containers are created for a run that needs the reference (count `docker create` calls via an executor spy in a unit test, and in the Docker integration test assert both containers are removed afterwards: `docker ps -a --filter label=lemmayard.sandbox=1 -q` empty); user code that tries to print `globals()`/`sys.modules` content from the harness does not contain any reference solution text (Docker integration test with a marker comment in a fixture reference solution).
- **AC-F5-6** Backward compatibility: all M5 Run tests with `customInput` still pass unchanged; DTO unit test serializes old-shape and new-shape `caseResults`.
- **AC-F5-7** Run API negative cases: `cases` and `customInput` together → 400; `includeSamples: false` with no cases → 400; 9 cases → 400; request 111 KB → 413; no rows written.
- **AC-F5-8** E2E: Two Sum → Testcase tab → "+" → enter `nums=[3,3]`, `target=6` → Run → result row shows expected `[0,1]` labelled "reference solution" → reload → the case is still there.
- **AC-F5-9** E2E: submit a solution that fails a hidden case → Wrong Answer → "Add to my tests" → Testcase tab shows a new case with that input and expected → fix code → Run → that case passes.
- **AC-F5-10** E2E: code that raises on line 3 → Run → error text shows a link "line 3" → click → editor cursor on line 3 (assert via Monaco API in the page or `data-testid` cursor position readout).
- **AC-F5-11** p95 latency target (non-blocking, like AC-M7-5): Run Two Sum Python with 3 samples + 2 reference-backed custom cases < 6 s over 20 sequential runs; result attached to the report.
- **AC-F5-12** axe 0 serious/critical on the Testcase and Result tabs in both themes; case chips and fields are keyboard reachable and labelled.

**Test plan**: unit (case-merging, expected-source logic with a stub executor, line-link parser for Python/JS error formats, DTO); integration (API, worker with real Docker, isolation); e2e (AC-F5-8/9/10); performance note.

**Size**: M (upper end). What was cut to fit one milestone: generators, labels/reorder, visualizers, per-case stats, any change to Submit.

**How we will know it's useful**: take a problem with tricky edges (Longest Valid Parentheses, Merge Intervals), write a deliberately buggy solution, submit, and debug only with the workbench. You should get from "Wrong Answer" to a reproducible failing case in your list in one click, and the reference-computed expected should let you test your own edge-case ideas without working out answers by hand. If you still need to compute expected outputs manually, or the reference often fails on reasonable inputs, the feature is not done.

---

## 5. Summary of migrations and env additions

| Feature | Migration | New env (defaults) |
|---|---|---|
| F1 | `review_rating`, `review_state` enums; `review_items`; `review_logs` | `REVIEW_GRADE_PER_MIN=30` |
| F2 | `problems.hints/approach_md/complexity/reference_solutions`; `hint_reveals` | `HINT_REVEAL_PER_MIN=30` |
| F3 | `interview_sessions`; `interview_problems`; `submissions.interview_session_id` | `INTERVIEW_START_PER_HOUR=10` |
| F4 | `problem_notes` | `NOTE_WRITES_PER_MIN=60`, `EXPORT_PER_MIN=5` |
| F5 | `user_test_cases`; `submissions.run_cases` | `TESTCASE_WRITES_PER_MIN=60` |

Shared new helper (first feature that needs it creates it, F2 in the recommended order): `src/server/http/rate-limit.ts`.
