# Community: discussions, votes, interview experiences and study plans

Date: 2026-10-18. Status: **plan for owner review. Nothing here is implemented.** Base: `main` at 2748c36 (design v2
"Proof", dark only; auth with stateless JWT sessions; rooms v2 with per-room Elo; guide; 20 problems with author
ratings; deployed by the owner to Vercel + Supabase).
Mockups: [`docs/specs/community/`](community/) (8 PNGs, low-fi but built from the real tokens in `globals.css`. Every
name, company, number and post in them is example data).

This replaces the earlier rejection of "Public Discuss" (C23 in `features-f1-f5.md`). That rejection assumed a
single self-hosted instance with no audience. The product is now a public Vercel deployment, and the owner asked for
a community layer. The two original objections still apply, and this plan answers them: **moderation comes before
reach** (every phase that adds user content ships with reporting, hiding and limits, behind a feature flag), and
**the first thing we ship is useful at zero audience** (study plans, §D).

## 0. Owner summary

**What we build (5 phases, each one additive migration, each behind `COMMUNITY_ENABLED`):**

| Phase | What users get | Why this order |
|---|---|---|
| **C1** Problem discussion | A **Discussion** tab on every problem: comments with one level of replies, markdown with code blocks, ▲▼ votes, "Best/New" sort, solution spoilers hidden until you solve, ▲▼ on the problem itself, optional "easier / about right / harder" feedback after you solve. Report button, moderator hide/remove, rate limits, content policy pages. | The owner's item (1). Smallest UGC surface. Builds the shared parts: threads, markdown, votes, reports, limits. |
| **C2** Study plans | "My study plans": ordered problem lists with sections, ours plus external LeetCode links, your progress, private / link / public, duplicate, "Save as study plan" from a room session. | Useful to one person with no community. Almost no abuse surface. Owner's item (2), second half. |
| **C3** Interview experiences | A **Community** area: interview posts with a template (company, role, level, when, where, rounds, problems linked to ours or to LeetCode, outcome, optional anonymity), filters, search, votes, comments, **Add to my study plan**. Plus a general "Discussions" list. | Owner's item (2). Needs C1 (comments, votes, reports) and C2 (plans). |
| **C4** Moderation and notifications | Moderation queue, auto-hide after reports, suspensions, audit log, company review; in-app notifications (replies, mentions, moderator decisions) with a header bell; data export and account deletion. | C1–C3 ship with minimal tools. This phase makes moderation sustainable once traffic exists. |
| **C5** Profiles, search, guide | Community section on `/u/[username]` (non-anonymous posts, public plans), global search, comments on guide lessons, room session threads; later: community solution write-ups (after F2), badges (deferred). | Each piece is low value until C1–C3 have content. |

**Headline decisions (recommended, see §12 for the questions):**
1. **Votes:** ▲ and ▼, one vote per person per item, net score shown. ▼ needs an established account. "Best" sorts
   by the Wilson lower bound (stored as a generated column). "Hot" (forum) uses HN-style time decay.
2. **Comments:** two levels (comment + flat replies with @mention). A markdown subset is rendered on the server with
   the existing `react-markdown` + `rehype-sanitize` stack and a **stricter** schema. No images, no raw HTML. Code
   blocks are highlighted with the existing Shiki setup. **The CSP does not change.**
3. **Interview posts link, they never copy.** External problems are a LeetCode URL plus a title and a one-line note.
   The composer, the content policy and moderation enforce this. Anonymous posting is allowed: the public never sees
   the author, moderators can.
4. **Study plans** are private by default, can be shared by link or made public, and track progress per viewer. For
   our problems progress comes from accepted submissions. External items are ticked by hand.
5. **No public reputation and no badges in the MVP.** Internally there are two trust levels (new vs established)
   that gate ▼, links and rates. This keeps the "rigorous, calm, not gamified" tone of DESIGN.md.
6. **Difficulty feedback does not feed the Elo.** It is shown as "most solvers found it about right" and goes into a
   maintainer report. Ratings stay outcome-based (rooms v2 §6).
7. **Rate limits are counted in Postgres** (own rows in a time window, under a per-user advisory lock), not in
   memory. This works across Vercel instances.
8. **Build order:** C2 and C1 in parallel. If only one can go first, **C2**: best value for the effort, zero
   moderation risk.

---

## A. Research

Sources are public pages. I paraphrase them, and claims taken from user posts are marked as such. LeetCode pages
answer 403 to automated fetches, so LeetCode facts come from search snippets of its help center and official
forum posts, and they may be dated.

### A.1 What LeetCode has

| Area | What it does (paraphrased) | Source |
|---|---|---|
| Per-problem discussion | Every problem has its own discussion where users post their own write-ups, which readers can sort by votes. Users say the official "Solution/Editorial" is written by LeetCode and partly Premium, while community write-ups are free, with uneven quality. | [Codeforces feature request comparing to LeetCode](https://codeforces.com/topic/77845/en1), [LeetCode user post on Discussion vs Solution](https://leetcode.com/discuss/study-guide/1569998/solutions-to-coding-problems-the-discussion-section-or-the-solution-section) |
| Discuss forum | Its help center describes Discuss as the place for interview questions, interview experiences, career topics and study-plan talk. | [LeetCode QuickStart Guide](https://support.leetcode.com/hc/en-us/articles/360012067053-LeetCode-QuickStart-Guide) |
| Interview posts | An official guide asks authors to tag the company and to title posts as company, stage (phone / onsite / OA) and question. Popular posts follow the pattern company, level, location, date and collect votes. | [How to write an Interview Question post](https://leetcode.com/discuss/post/126698/how-to-write-an-interview-question-post-uw7bk/), [Best posts of 2019](https://leetcode.com/discuss/general-discussion/459286/best-posts-of-2019) |
| Votes and anti-abuse | After vote manipulation (revenge downvotes, alternate accounts), LeetCode required a minimum reputation to downvote, charged reputation per downvote, capped daily votes by reputation, made votes final after a few minutes, and said it runs internal detection of unusual voting. | [LeetCode Community Rules, voting policy of March 2022](https://leetcode.com/discuss/general-discussion/324861/LeetCode-Community-Rules) |
| Lists / favorites | A default "Favorite" list plus custom lists. Lists start private. A public list can be opened by anyone with its link. Logged-in users can clone a list (an editable copy) or watch it (follow updates). Name, cover and description can be edited. | [How to use My List](https://support.leetcode.com/hc/en-us/articles/360011883774-How-to-use-My-List-feature-to-organize-LeetCode-questions-and-manage-my-practice-progress) |
| Study plans | Curated, ordered plans such as "Top Interview 150" with progress and a completion badge. | [Top Interview 150](https://leetcode.com/studyplan/top-interview-150/) |
| Badges | Badges for solving on many days of a year, and contest badges tied to contest rating percentiles. | [2023 Annual Badge](https://leetcode.com/discuss/general-discussion/4392424/2023-Annual-Badge-Record-Your-Effort-and-Journey-of-Growth%21/), [Contest badge](https://leetcode.com/discuss/general-discussion/934706/The-new-contest-badge-is-here) |
| Company frequency | Company tags on problems with "frequency" (Premium). | search snippet of the problem list, see C16 in `features-f1-f5.md` |

Not verified (no public page found): LeetCode's report flow, notification types, and profile activity details. The
plan does not depend on them.

### A.2 Comparable products

| Product | Relevant mechanism | Source |
|---|---|---|
| Codeforces | Blogs with comments and ▲▼. User reports (not official) say comment downvotes stay hidden until a threshold to limit herd voting, that votes feed a "contribution" score, and that older content counts less. Editorials are blog posts linked from the problem page, and users have asked for per-problem comments. | [contribution discussion](https://codeforces.com/topic/129927/en1), [request for per-problem comments](https://codeforces.com/blog/ximo) |
| Stack Overflow | Reputation unlocks privileges. Network users get a starting bonus that lifts new-user limits. New users get stricter limits on some sites (few links, no images). | [Reputation help (Teams)](https://stackoverflowteams.com/help/whats-reputation), [protected questions](https://stackoverflow.blog/2014/04/08/changes-and-guidelines-for-the-protected-question-status/) |
| Discourse | Trust levels: new users (TL0) get a small link cap, and they are promoted automatically after reading a little. All of it is configurable. | [summary of trust levels](https://forums.classicpress.net/t/understanding-trust-levels/966) |
| Hacker News | Ranking divides votes by age raised to a "gravity" exponent, so stories decay. There are penalties and periodic re-ranking. | [How HN ranking works (Shirriff)](https://www.righto.com/2013/11/how-hacker-news-ranking-really-works.html) |
| Reddit / Lemmy | Reddit fuzzes displayed vote counts to frustrate bots (only user-level explanations available). Lemmy publishes its formula: log of the score divided by age raised to a gravity of 1.8, with a cut-off after a week. | [Lemmy ranking docs](https://git.join-lemmy.org/LemmyNet/lemmy/raw/commit/2e9164584bb1fda100e00b0f4e43973297ab4701/docs/src/about_ranking.md), [Daily Dot on Reddit vote counts](https://dailydot.com/news/reddit-vote-count-percent-like/) |
| Ranking with few votes | Sort by the lower bound of the Wilson score interval, not by net score or average. | [Evan Miller, How Not To Sort By Average Rating](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html) |
| NeetCode / roadmaps | Topic-grouped ordered lists (75/150) with per-topic progress. Many community trackers copy that shape. | [Educative on the NeetCode roadmap](https://www.educative.io/blog/neetcode-roadmap) |
| AtCoder Problems | A community tool: progress filters, and virtual contests built from chosen or random problems in a difficulty range. | [AtCoder Problems virtual contests](https://kenkoooo.com/atcoder/book/en/virtual_contest.html) |
| Legal baseline | EU DSA Art. 16: every hosting provider, whatever its size, needs an easy electronic channel for anyone to report illegal content. US DMCA §512 safe harbor needs a designated agent registered with the Copyright Office (renewed every 3 years). | [DSA Art. 16 text](https://www.springlex.eu/en/packages/dsa/dsa-regulation/article-16/), [DMCA Designated Agent Directory](https://www.copyright.gov/dmca-directory) |

### A.3 Where community belongs in LemmaYard (per surface)

| Surface | Feature | Value | Cost | When |
|---|---|---|---|---|
| Problem page | Discussion tab (comments, replies, ▲▼, spoilers) | High: the most-used community feature on LeetCode, and it answers "why does this work" | M | **C1** |
| Problem page | ▲▼ on the problem ("liked by 94 %") | Medium: quality signal for the catalog and for problem authors | S | **C1** |
| Problem page | "Easier / about right / harder" after solving | Medium: a calibration signal for author ratings, cheap | S | **C1** (display after n ≥ 10) |
| Problem page | "Asked in N interview posts" + link | High once C3 has posts | S | C3 |
| Problem page | Community solution write-ups (a separate tab, long posts) | Medium. It overlaps F2 (official approach + reference solution) and invites copy-paste | M | Later (after F2), C5+ |
| Problem page | Community hints | Low: hints need careful levels (F2 rubric). Better as GitHub PRs to `hints.json` | — | No (route to GitHub) |
| Catalog / problem page | "Add to study plan" menu | High | S | **C2** |
| Rooms | Session results → "Save problems as a study plan" | High for teams: "what we did on Saturday" | S | **C2** |
| Rooms | Post-session thread (members only) | Medium: the room is private, so moderation load is low | S (reuses threads) | C5 |
| Rooms | Start a lobby from a study plan (pin its problems) | Medium | M (touches the rooms draw) | Later |
| Guide lessons | Questions/comments per lesson | Medium: lessons are long and people get stuck | S (reuses threads) | C5 |
| Profiles | Community tab: posts (non-anonymous), public plans, comment count | Medium | S | C5 |
| Forum home `/community` | Interview experiences (template, filters, add-to-plan) | High: the owner's ask, and different from LeetCode because posts link problems you can solve right here | L | **C3** |
| Forum home | General discussions (questions, study tips) | Medium | S once C3 exists | C3 |
| Forum home | Public study plan gallery | Medium | S | C3 (C2 has link sharing only) |
| Everywhere | In-app notifications | High once replies exist | M | C4 (C1 shows replies inline) |
| Everywhere | Reputation points, badges, leaderboards of posters | Low here, with a risk of gaming and a tone mismatch | M | Deferred |
| Contests | Contest discussion | — | — | No public contests exist (rooms are private) |

---

## B. Product spec

### B.1 Features and user stories

- **US-C1 (discussion).** As a learner on a problem, I want to ask why a solution works and read the best answers
  without being spoiled, so that I understand the idea, not just the code.
- **US-C2 (votes).** As a reader, I want the most useful comments and posts first, so that I do not read 50 "thanks".
- **US-C3 (problem feedback).** As a solver, I want to say a problem was harder than its label, so that the catalog
  improves.
- **US-C4 (interview post).** As a candidate after an interview, I want to share the rounds and problems quickly
  (optionally anonymously), so that others can prepare. I do not want to break my NDA.
- **US-C5 (add to plan).** As a candidate before an interview at company X, I want to put all problems from recent X
  posts into my plan in two clicks, and see my progress.
- **US-C6 (study plan).** As a learner, I want ordered lists with sections, mixing our problems and LeetCode links,
  private or shared, so that I can follow a plan (mine, a friend's or the room's).
- **US-C7 (room → plan).** As a room member after a session, I want to save that session's problems as a plan, so
  that I can redo the ones I missed.
- **US-C8 (safety).** As any visitor, I want to report spam, abuse, copyright or NDA problems, and see it acted on.
- **US-C9 (moderation).** As the owner or a moderator, I want a queue, one-click hide/remove with a reason, and an
  audit log, so that I can moderate in minutes a day.
- **US-C10 (notifications).** As an author, I want to know when someone replies, mentions me or a moderator acts on
  my content.
- **US-C11 (privacy).** As a user, I want to export everything I wrote and delete my account, and anonymous posts
  must stay anonymous to the public.

### B.2 Information architecture

```
Header nav: Problems · Guide · Rooms (signed in) · Community            [bell (C4)] [avatar]
Avatar menu: Profile · Submissions · My study plans (C2) · Moderation (moderators, C1+)

/problems/[slug]                 workspace; left tabs: Description | Discussion (n) | Submissions
/problems/[slug]/discuss         full discussion page (site layout): sort, pagination, composer
/plans                           my plans + saved plans (C2)
/plans/[id]                      plan page (owner edits; others read by visibility)
/community                       = /community/interviews (C3)
/community/interviews/new        composer with template
/community/discussions           general posts (C3)
/community/plans                 public plan gallery (C3)
/community/companies/[slug]      posts for one company (C3)
/community/posts/[id]            one post (interview or discussion) + comments
/mod                             moderation: reports, auto-hidden, companies, audit log, users (C1 minimal, C4 full)
/legal/content-policy · /legal/terms · /legal/privacy · /legal/report   (C1; drafts for the owner)
Footer: new column "Community": Interviews · Study plans · Content policy · Report content / copyright
```

### B.3 Key screens (mockups)

| File | Screen | What to look at |
|---|---|---|
| [`01-problem-discussion.png`](community/01-problem-discussion.png) | Problem workspace, Discussion tab | Problem ▲▼ with "% liked", difficulty feedback (only after solving), composer with "Contains a solution", reply level, spoiler card, "Open the full discussion". |
| [`02-community-home.png`](community/02-community-home.png) | `/community`, interviews list, notifications open | Filters (company, role, year, outcome, topic), Hot/New/Top, post cards with outcome chips, anonymous author, "Most asked here" with add-to-plan. |
| [`03-interview-post.png`](community/03-interview-post.png) | Interview post | Facts row, the problems list (ours vs LeetCode link vs no-link design round), Add to my study plan, comments. |
| [`04-interview-composer.png`](community/04-interview-composer.png) | Share an interview | Template sections (§ 01–04), rounds with problem search or LeetCode link, "Link, do not paste" warning, anonymity switch with an honest explanation. |
| [`05-add-to-plan-dialog.png`](community/05-add-to-plan-dialog.png) | Add to a study plan dialog | New or existing plan, per-problem checkboxes (solved and no-link items unchecked), section name. |
| [`06-study-plan.png`](community/06-study-plan.png) | Study plan page | Sections with origin, solved / attempted / not started status (shape + word), "Mark done" for external items, progress card, visibility. |
| [`07-moderation-queue.png`](community/07-moderation-queue.png) | `/mod` reports | Reason chips, report counts, auto-hidden, anonymous author shown only to moderators, actions with reasons. |
| [`08-discuss-mobile-390.png`](community/08-discuss-mobile-390.png) | `/problems/[slug]/discuss` at 390 px | Reply indentation, deleted placeholder, spoiler, composer at the end. |

Mockup source (HTML + build/screenshot scripts) stays in the session scratchpad. It is not committed: it is
throw-away, and the PNGs are the reference, not golden images.

### B.4 Voting model

- **Targets:** comments (C1), problems (C1), posts (C3). Study plans have no votes (use "saves" as the signal).
- **Values:** ▲ = +1, ▼ = −1, 0 = remove. One row per (target, user), enforced by the primary key. Changing a vote is
  allowed. Rate limits (§B.11) make flip-flopping useless.
- **Who:** signed-in users only. ▼ needs **trust level 1** (§B.10). No voting on your own content (409). No voting on
  deleted, removed or hidden content (409).
- **Display:** the net score (▲ − ▼) on comments and posts. Problems show the like count and "% liked" once there are
  ≥ 10 votes. Your own vote is highlighted (`aria-pressed`). Separate ▼ counts are not shown (they invite pile-ons).
  Who voted is never shown, except to moderators in a vote audit (C4).
- **Ranking:**
  - *Best* (comments, default): Wilson lower bound at 95 % (z = 1.96) over (▲, ▼), stored in a generated column
    `rank_best`. Ties → newer first. This handles few votes correctly ([Miller](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html)).
  - *New*: `created_at` descending.
  - *Hot* (forum lists): `max(score, 0) + 1` raised to 0.8, divided by `(age_hours + 2)` raised to 1.8 (HN shape),
    only for posts younger than 30 days. Older posts appear under Top/New only.
  - *Top* (forum): net score within a period (week / month / year / all).
  - Replies are always oldest first (they are a conversation).
- **Anti-brigading (MVP):** ▼ gated by trust level; daily caps; no self-votes; votes on content older than 180 days
  are allowed but do not move "Hot" (age cut-off). Detection queries in C4: "one user voted on more than 15 items of
  the same author in 24 h" and "more than 5 accounts younger than 3 days voted on the same item" are listed in the
  mod "Vote audit" tab. A moderator can void the votes of a user (deleting them recomputes the counters). No vote
  weighting and no fuzzing in the MVP: both are opaque and hard to test. Revisit if abuse appears.

### B.5 Comments

- **Where:** a comment belongs to a *thread*. Thread kinds: `problem` (C1), `post` (C3), `lesson` (C5),
  `room_session` (C5, members only). Threads are created lazily on the first comment.
- **Shape:** top-level comments plus one level of replies. Replying to a reply attaches the new comment to the same
  top-level parent and prefills `@username`. This keeps mobile readable (no deep indentation) and keeps queries
  bounded.
- **Body:** markdown subset (§C.4), 1–10 000 characters after trimming. At most 8 fenced code blocks of ≤ 200 lines
  each. Language tag from an allowlist (`python`, `javascript`, `typescript`, `java`, `cpp`, `c`, `go`, `rust`,
  `kotlin`, `swift`, `csharp`, `sql`, `text`). An unknown tag renders as plain text. No images. No raw HTML. Links
  are auto-linked and get `rel="ugc nofollow noopener noreferrer"`.
- **Spoilers:** a "Contains a solution" checkbox (`has_spoiler`). For a viewer without an accepted submission on that
  problem, the body is replaced by the spoiler card ("Hidden until you solve it · Show anyway"). The body is **not
  sent** until "Show anyway" (a GET with `?reveal=1` for that comment). This is a UX courtesy, not access control:
  anyone can click. Moderators may set the flag on a comment that clearly contains code.
- **Edit:** the author can edit for **24 h**. After 5 minutes an "edited" mark is shown. The previous body goes into
  `content_revisions` (moderators only, kept 90 days). Edits re-run every write check (limits, links, duplicates).
- **Delete (author):** soft delete. With replies, the comment stays as a placeholder "This comment was deleted by its
  author", the body is cleared, and the author is hidden. Without replies, it disappears. Votes are kept for counters
  but no longer shown.
- **Remove (moderator):** `status = removed` with a reason. The placeholder reads "Removed by a moderator: <reason>".
  The body is kept 90 days for appeals, then purged. The author is notified (C4; before C4 the author sees a banner on
  their own comment).
- **Mentions:** `@username` (max 5 per comment) links to the profile and, in C4, notifies (only users who can see
  the thread).
- **Lock:** a moderator can lock a thread (no new comments). Room threads close 30 days after the session.

### B.6 Interview-experience posts (C3)

| Field | Rule |
|---|---|
| Company | Required. Typeahead over `companies` (approved). "Add new company" creates a `pending` company: the post is visible, the company page appears only after a moderator approves it or merges it into an existing one. Text name only, **no logos** (trademark). |
| Role | Required. Enum: Software engineer, Frontend, Backend, Full-stack, Mobile, Data / ML, SRE / DevOps, Security, Intern, New grad, Other. |
| Level | Optional free text ≤ 40 ("L4", "Senior"). |
| When | Required year (2000 … current), optional month. Future dates rejected. |
| Location | Optional ≤ 60, or "Remote". |
| Outcome | Optional: Offer / Rejected / Waiting / Withdrew / Rather not say. |
| Title | Required 10–150 characters. Suggested automatically: "<stages>: <topics>". |
| Rounds | 1–10 rounds. Kind: Online assessment, Phone screen, Coding, System design, Behavioral, Take-home, Other. Optional title ≤ 60. |
| Problems | 0–20 per post, each in a round: **our problem** (search by title/number) **or an external link** (`https://leetcode.com/problems/<slug>/`, normalized to that canonical form, title ≤ 120 taken from the user, not fetched) **or no link** (a short own-words name such as "Design a rate limiter"). Optional note ≤ 280. |
| Story | Markdown ≤ 20 000, prefilled with the template headings (process, each round, what they cared about, what to prepare). |
| Topics | 0–5 of our existing tags (no user-created tags). |
| Anonymity | Switch "Post anonymously" (see §B.14). |

- **No statements:** the composer warns against pasting statements. On submit, a body with a long block that looks
  like a statement (> 600 characters inside one blockquote or code block next to the words "Example 1" /
  "Constraints") gets a confirmation step. It is not blocked: we cannot detect copying reliably, so moderation
  handles it.
- **NDA:** the composer shows a short caution. The content policy forbids interviewer names, internal rubrics and
  verbatim confidential material.
- **Drafts:** saved locally in the browser (localStorage, like the editor drafts). No server drafts in C3.
- **Discussion posts** (`kind = discussion`): title + body + topics. They share the same table, votes, comments and
  moderation.

### B.7 Tagging, search and filters

- Filters on `/community/interviews`: company, role, year (current, previous, older), outcome, topic, "has problems
  on LemmaYard". All in the URL (`?company=northwind&year=2026`), bookmarkable, like the catalog filters
  (`src/lib/catalog/filters.ts` pattern).
- Search box: Postgres full-text over title (weight A) and body (weight B), `websearch_to_tsquery('english', q)`,
  ranked by `ts_rank` and then recency. Comments are not searched in C3 (C5 adds a global search).
- Problem page shows "Asked in N interview posts" (from `post_problems.problem_id`) with a link to the filtered list
  (`?problem=two-sum`).

### B.8 Study plans (C2)

- **Plan:** title (1–80), description (markdown ≤ 2 000), visibility `private` (default) / `unlisted` (anyone with the
  link, signed in or not, can read) / `public` (also listed in `/community/plans` from C3). Limits: 50 plans per
  user, 20 sections and 300 items per plan.
- **Sections:** optional, ordered, title ≤ 80. Items without a section come first, under "Problems".
- **Items:** our problem **or** an external LeetCode link (same normalization as C3) with a title, optional note
  ≤ 280. A problem appears at most once per plan (unique). Drag to reorder (keyboard: "Move up / Move down" buttons,
  no drag-only interaction).
- **Progress (per viewer):** our problems are solved / attempted / not started from that viewer's submissions (the
  same rule as the catalog status). External items are ticked by the viewer ("Mark done"), stored per viewer. A
  viewer of somebody else's plan sees **their own** progress, never the owner's.
- **Actions:** Duplicate (a private copy with `forked_from` and credit "Based on <plan> by <user>" if the source is
  public or unlisted). Save (follow a public or unlisted plan into "Saved plans"; it updates when the owner edits).
  Share (copy link). Delete (soft delete, 30 days, then purged).
- **Import sources:** "Add to plan" on a problem page, a catalog row, an interview post (dialog, mockup 05), a room
  session's results ("Save as study plan", members only, after the session is finished; it creates a private plan
  named "<room name> · <date>"). Duplicates are skipped and the dialog says how many.
- **Not in scope:** schedules and reminders per plan (F1 review queue covers spaced repetition), plan comments,
  official curated plans (they can come later as a seed file in the repo, reviewed via PR, not as user content).

### B.9 Reputation and badges: deferred

There are no public points, badges or poster leaderboards in C1–C5. Reasons: DESIGN.md calls the tone "not
gamified". With a small audience, points mostly measure who arrived first. Points invite farming (LeetCode had to add
downvote costs and caps). And everything points would gate is covered by two computed trust levels plus roles.
Revisit when the community has more than ~200 weekly active posters. Then the cheapest first step is a profile
"helpful answers" count (comments with score ≥ 5), not points.

### B.10 Roles and trust levels

- **Roles** (`users.role`): `user` (default), `moderator`, `admin`. The owner is `admin`. Roles are set only by a CLI
  script `pnpm users:set-role <username> <role>` that uses `DATABASE_URL`. There is no UI to grant admin. Moderators
  act on content and suspend users for up to 30 days. Admins also manage moderators (CLI), ban without a time limit
  and approve or merge companies.
- **Trust level** (computed per request from `users.created_at` and submissions, never stored):
  - **TL0 "new"**: account younger than 72 h **or** no accepted submission yet.
  - **TL1 "established"**: everything else.
- **Suspension** (`users.community_suspended_until`): a suspended user can read, but cannot write comments, posts,
  votes or reports in community surfaces. Practice, rooms and plans keep working.

### B.11 Rate limits and spam

All write limits are counted in Postgres: the user's own rows in a window, checked inside the write transaction
after `pg_advisory_xact_lock(hashtext('community:' || user_id))`. Exceeding a limit → 429 with `Retry-After`.

| Action | TL0 | TL1 | Moderators |
|---|---|---|---|
| Comments | 3 / 10 min, 10 / day | 10 / 10 min, 100 / day | no limit |
| Posts (C3) | 1 / day | 5 / day | no limit |
| Edits | 10 / hour | 30 / hour | — |
| Votes (all targets) | 30 / hour, ▲ only | 120 / hour, 500 / day (▼ ≤ 50 / day) | — |
| Reports | 5 / day | 20 / day | — |
| Study plan writes (C2) | 120 / hour | 300 / hour | — |
| New companies (C3) | 0 (pick existing or "Other") | 3 / day | — |

- **Links:** TL0: at most 1 link per comment/post outside the allowlist (our own domain, `leetcode.com`,
  `github.com`, `developer.mozilla.org`, `docs.python.org`, `en.wikipedia.org`). TL1: at most 10. URL shorteners
  (a small blocklist) are rejected for everyone. A TL0 post with a non-allowlisted link is **held for review**
  (`hidden_pending`) instead of rejected.
- **Duplicates:** `body_hash` = sha256 of the normalized body (lowercase, collapsed whitespace). Same author + same
  hash within 24 h → 409 "You already posted this". The same hash from ≥ 3 different authors within 24 h → later
  copies are held for review (a spam wave).
- **New-account caution:** for 72 h after sign-up, the first 3 comments of a TL0 account that contain any link are
  held for review.
- **Auto-hide:** 3 distinct reports by TL1 users (or 1 by a moderator) → `hidden_pending`. The author still sees it
  with a banner. It stays hidden until a moderator decides.
- **Emergency switch:** `COMMUNITY_READ_ONLY=1` makes every community write answer 503, and the UI shows a banner.

### B.12 Content policy (summary, full text on `/legal/content-policy`)

Allowed: questions, explanations, approaches, short code. Spoilers must be marked. Interview experiences in your own
words, with links.
Not allowed: spam and ads; harassment, hate, threats; personal data of others (including interviewer names);
material covered by an NDA or confidential documents; **copied problem statements or editorials from other sites**
(link instead); plagiarized solutions presented as your own; cheating requests (live assessments); malware or
phishing links; fabricated interview reports; AI-generated posts presented as a personal experience.
Enforcement: hide → remove with a reason → suspension (1, 7, 30 days) → ban. Each step is in the audit log and is
notified to the author with the reason. An appeal goes to the contact email.

### B.13 Legal (to confirm with the owner; this is not legal advice)

- **Pages (C1):** Terms of use (UGC license: users keep copyright and give LemmaYard a non-exclusive license to host
  and display it; the MIT license of the repository does **not** cover user content), Privacy notice (what is stored,
  §B.14), Content policy, "Report content / copyright" page with a contact email (`CONTACT_EMAIL`) and what a notice
  must contain (URL, reason, contact, good-faith statement). This matches DSA Art. 16 for anyone, including people
  without an account.
- **Footer:** add the column "Community" with Content policy, Report content / copyright, Terms, Privacy.
- **Copyright:** posts and comments may **link** to LeetCode and other sites and name a problem. They may not paste
  statements, editorials or premium content. Our own problems are original (README). Takedowns are handled within
  72 h by hiding first, then deciding.
- **DMCA agent:** registering a designated agent with the US Copyright Office is what §512 safe harbor needs. It is
  cheap, but it is a formal step with a public address. Owner decision (Q7).
- **Interview NDAs:** a policy line plus the composer caution. Moderators remove on report (reason "NDA or
  confidential").
- **Company names:** used as plain text to describe facts. No logos, no "official" claims. A company can ask for a
  correction through the contact email.

### B.14 Privacy

- **Stored:** content (body, title, metadata), the author id (also for anonymous posts), votes (user, target, value,
  time), reports (reporter, target, reason, details), moderation actions (actor, target, reason), notifications,
  plans and external-item ticks. **No IP addresses and no user agents are stored** (the current auth limiter keeps
  addresses only in memory, and community limits are per user).
- **Public:** usernames on non-anonymous content, net scores, comment counts, public and unlisted plans (titles,
  items, owner username).
- **Never public:** who voted, who reported (the reported user never learns the reporter), anonymous authors, the
  email address.
- **Anonymous posting:** the API and HTML never contain `author_id`, username or avatar for an anonymous post, and
  the post is not listed on the profile or in "my posts" for other viewers. Moderators see the author. The author's
  export includes it. Comments are never anonymous (in a thread the "Author" chip would reveal the anonymous poster,
  so for anonymous posts that chip is shown as "Original poster"). Caution in the composer: writing style and
  details can identify you.
- **Export (C4):** `GET /api/me/export` → JSON with the profile, submissions metadata, comments, posts (including
  anonymous ones), votes, plans, reports filed and notifications.
- **Account deletion (C4):** see Q8. Recommended: delete votes, reports filed, plans, ticks and notifications;
  anonymize comments and posts (author → null, shown as "deleted user"); an optional checkbox "also delete everything
  I wrote" soft-deletes all bodies.
- **Retention:** removed bodies and revisions purged after 90 days; moderation actions kept 1 year; notifications
  90 days; soft-deleted plans 30 days. A purge runs from a protected cron route (`/api/cron/community-purge` with
  `CRON_SECRET`, Vercel Cron daily) or from `pnpm community:purge`.

### B.15 Accessibility and i18n

- Threads are nested `<ol>` lists. Each comment is an `<article>` labelled "Comment by <name>, <time>". Replies have
  `aria-label="Replies to <name>"`.
- Vote controls are buttons with `aria-pressed` and full names ("Upvote comment by mkowal"), plus a polite live
  region "Score 25". Status is never shown by color alone (arrow shape + number; outcome chips have an icon and a
  word; plan status has a shape and an sr-only word, as in the catalog).
- The composer has a visible label, a character counter linked by `aria-describedby`, and errors in `FieldError`.
  After posting, focus moves to the new comment. Escape does not discard the text.
- The spoiler card is a real button that toggles `aria-expanded`. Revealed code is a focusable scroll region (like
  guide code).
- User headings are mapped below the page's own (`#`/`##` → `h3`, deeper → `h4`), so every page keeps one `h1`.
- Every new page meets the DESIGN.md §15 checklist, gets axe in the e2e list, and its new text pairs go into
  `contrast.test.ts`.
- **i18n:** the UI stays English. User content may be any language: render with `dir="auto"` and `lang` unset. Search
  uses the `english` configuration (other languages still match whole words via `simple` fallback). Relative times
  ("2 days ago") with an absolute `<time datetime>` and a tooltip.

### B.16 Acceptance criteria

Numbering: `AC-C-<area>-<n>`. Every AC names a test or a browser scenario, as in the other specs.

**Flags and shared**
- AC-C-GEN-1 `COMMUNITY_ENABLED` unset or `0`: no community UI (tabs, nav item, footer column, buttons) and every
  community route answers 404. Unit test on the env schema plus an e2e smoke with the flag off.
- AC-C-GEN-2 `COMMUNITY_READ_ONLY=1`: every community write → 503 `{"code":"community_read_only"}`, reads work, a
  banner is shown.
- AC-C-GEN-3 Every mutating community route follows the check order of `features-f1-f5.md` §3: same-origin 403 →
  auth 401 → size 413 / Zod 400 → target 404 → role/suspension 403 → state 409 → rate 429 → write. Integration test
  matrix per route. Rejected requests write nothing.
- AC-C-GEN-4 Every new table has RLS enabled (`rls.test.ts` table list extended), and `docs/supabase/schema.sql` is
  regenerated (`supabase-sql.test.ts` green).

**Comments (C1)**
- AC-C-CM-1 Signed-in users post a top-level comment and a reply. A reply to a reply attaches to the top-level parent
  (DB never has depth > 1, checked by integration test and a CHECK on `depth`).
- AC-C-CM-2 Body limits: 0 or > 10 000 characters → 400; `\u0000` → 400; > 8 code blocks or a block > 200 lines → 400
  with a field message.
- AC-C-CM-3 Edit within 24 h works and stores a revision. After 24 h → 409. After 5 min the "edited" mark shows.
- AC-C-CM-4 Author delete with replies leaves a placeholder without body or author. Without replies the comment is
  gone from lists. Counters (`comment_count`, `reply_count`) stay consistent (recount test).
- AC-C-CM-5 Spoiler comment: a viewer without an accepted submission gets no body in the HTML or JSON until
  `reveal=1`. A solver gets the body directly.
- AC-C-CM-6 Sort Best orders by `rank_best` and then newer; New by time; replies oldest first. Cursor pagination
  returns no duplicates and no gaps for a static dataset of 55 comments, page size 20.
- AC-C-CM-7 Problem page: the Discussion tab shows the count and the top 5 comments (Best) streamed in a Suspense
  boundary. The page's first byte does not wait for comments (the query count of the description render is
  unchanged, integration test). "Open the full discussion" goes to `/problems/[slug]/discuss`.
- AC-C-CM-8 Query budget: the `/problems/[slug]/discuss` page uses ≤ 5 queries (thread, page of top-level comments
  with first 3 replies each in one query, my votes, my solved status, user lookups joined). Integration test with a
  query counter.

**Markdown and security (C1)**
- AC-C-MD-1 The XSS corpus (≥ 80 payloads: script tags, event handlers, `javascript:`/`data:`/`vbscript:` URLs incl.
  encoded forms, SVG/MathML, `<img>`, iframes, style injection, DOM clobbering ids/names, markdown link tricks,
  autolink edge cases, mXSS strings, giant nesting) renders to HTML without any active content. A unit snapshot plus
  an e2e page that renders the corpus fails on any `dialog`, `pageerror` or CSP violation.
- AC-C-MD-2 No `<img>` in output (an image becomes a link with its alt text). External links have
  `rel="ugc nofollow noopener noreferrer"`. User ids get the `user-content-` prefix.
- AC-C-MD-3 Code blocks with an allowlisted language are highlighted by Shiki on the server. An unknown language
  renders as escaped text. Highlighting a 200-line block takes < 30 ms after warm-up (unit benchmark, not a gate).
- AC-C-MD-4 `tests/e2e/security/csp.spec.ts` covers the new pages with zero violations. `security-headers.ts` is
  unchanged.

**Votes (C1, C3)**
- AC-C-VT-1 One vote per (user, target): 50 concurrent PUTs by one user end with one row and correct counters. 50
  users voting concurrently → `up_count`/`down_count` equal a recount.
- AC-C-VT-2 Self-vote → 409. ▼ by TL0 → 403 `{"code":"trust_required"}`. Vote on removed/deleted → 409.
- AC-C-VT-3 `rank_best` equals the TypeScript `wilsonLowerBound(up, down)` within 1e-9 for a table of cases (0/0,
  1/0, 0/1, 5/5, 100/1, 1000/10) — SQL and TS parity test.
- AC-C-VT-4 Problem like %: hidden below 10 votes, shown as an integer percent at ≥ 10.
- AC-C-VT-5 Difficulty feedback is only accepted after an accepted submission (403 otherwise). The summary ("Most
  found it harder") shows only at ≥ 10 answers. It never changes `problems.rating_adjust` or room ratings (test).

**Reports and moderation (C1 minimal, C4 full)**
- AC-C-RP-1 A signed-in user reports a comment/post/plan once (second report → 409). Reasons are an enum. Details
  ≤ 1 000.
- AC-C-RP-2 Three distinct TL1 reporters → `hidden_pending`. The author still sees it with a banner; others see
  nothing (not even a placeholder).
- AC-C-RP-3 Moderator actions (hide, restore, remove, lock, unlock, suspend, unsuspend, set spoiler, approve/merge
  company) require a reason, write `moderation_actions`, and resolve open reports on that target. Non-moderators →
  403.
- AC-C-RP-4 The `/mod` page lists open reports oldest first with the target excerpt, reasons and counts, and shows
  the author of anonymous posts only there.
- AC-C-RP-5 A suspended user gets 403 `{"code":"suspended","until":…}` on every community write and can still
  submit code and use rooms and plans.

**Rate limits and spam (C1)**
- AC-C-RL-1 Limits from §B.11 hold across two separate DB pools (simulating two Vercel instances): the 11th TL0
  comment of the day → 429 with `Retry-After`.
- AC-C-RL-2 Duplicate body by the same author within 24 h → 409. The third author with the same hash in 24 h → the
  content is created as `hidden_pending`.
- AC-C-RL-3 Link limits: TL0 with 2 non-allowlisted links → 400. A shortener → 400 for everyone. A TL0 post with one
  external link → `hidden_pending`.

**Study plans (C2)**
- AC-C-SP-1 CRUD for plans, sections and items with the limits from §B.8 (51st plan → 409, 301st item → 409).
- AC-C-SP-2 Visibility: private → 404 for others (not 403), unlisted → readable by link including guests, public →
  readable and (C3) listed. Non-owners cannot write (404 for private, 403 otherwise).
- AC-C-SP-3 Progress per viewer: our items follow the viewer's submissions (solved > attempted > not started).
  External ticks are per viewer. The owner's progress never leaks to other viewers (JSON snapshot).
- AC-C-SP-4 External URLs normalize: `http://leetcode.com/problems/two-sum/description/?x=1` →
  `https://leetcode.com/problems/two-sum/`. Other hosts → 400 (only LeetCode links in C2/C3).
- AC-C-SP-5 Duplicate creates a private copy with `forked_from_id`. Save/unsave works for public and unlisted plans.
  A saved plan whose source became private disappears from "Saved".
- AC-C-SP-6 Room results "Save as study plan" (members only, finished sessions only) creates a private plan with the
  session problems in session order. A non-member → 404. A lobby or live session → 409.
- AC-C-SP-7 Plan page query budget ≤ 4 queries for 300 items.

**Interview posts and forum (C3)**
- AC-C-IV-1 The composer validates the §B.6 fields (Zod, shared client/server). Year in the future → 400. More than
  20 problems or 10 rounds → 400.
- AC-C-IV-2 Anonymous post: no response body or HTML of any non-moderator page contains the author's id, username
  or avatar initials (integration test greps all community GET responses and rendered pages for them).
- AC-C-IV-3 A new company is `pending`: the post shows the name, the company page 404s until approved. Merge moves
  posts to the target company.
- AC-C-IV-4 "Add to my study plan" adds the selected items to a new or existing plan, skips duplicates and reports
  "Added 4, skipped 1". Items of kind "no link" cannot be added.
- AC-C-IV-5 Filters and search are URL-driven. Search uses the GIN index (an `EXPLAIN` test shows an index scan on
  10 000 seeded posts). The list query budget is ≤ 3.
- AC-C-IV-6 The problem page shows "Asked in N interview posts" when N ≥ 1, counting visible posts only.
- AC-C-IV-7 Hot order matches the TS `hotScore` for a fixed `now` (parity test). Posts older than 30 days are absent
  from Hot.

**Notifications (C4)**
- AC-C-NT-1 A reply to my comment, a comment on my post, an @mention (only if I can see the thread), and a moderator
  action on my content each create one notification. My own actions never notify me. A deleted source removes the
  unread notification.
- AC-C-NT-2 The bell shows the unread count (capped "9+") from one indexed query on page render. Opening the panel
  marks the shown items read. No polling.
- AC-C-NT-3 Notifications older than 90 days are purged by the purge job (integration test with a fixed clock).

**Privacy (C4)**
- AC-C-PR-1 The export contains every row the user authored, including anonymous posts, and nothing of other users
  except usernames of threads' parents.
- AC-C-PR-2 Account deletion follows the Q8 decision. Integration test: after deletion no row references the user
  except anonymized content with `author_id = null`.

**Accessibility (all phases)**
- AC-C-A11Y-1 axe: 0 serious/critical on every new page and on the problem page with the Discussion tab open
  (dark, plus light with the flag flipped locally, per DESIGN.md §6.5).
- AC-C-A11Y-2 Keyboard only: post a comment, reply, vote, reveal a spoiler, report, reorder plan items (Move
  up/down), open and close the add-to-plan dialog with focus returning to the trigger.
- AC-C-A11Y-3 No horizontal scroll at 390 px on any new page.

---

## C. Technical design

### C.1 Data model

One additive migration per phase (`drizzle/00NN_community_c1.sql` … `_c5.sql`). **Numbering stays open:** 0005 is
being added concurrently by other work; each WP runs `pnpm db:generate` on top of the current `integration` and
renames to the next free number. Every table: `.enableRLS()` (no policies, as in 0002–0004). Every text column has a
length CHECK and a "no control characters" CHECK like `rooms.description`. Timestamps are `timestamptz`.

**C1**
```ts
// enums
userRole            = pgEnum("user_role", ["user", "moderator", "admin"]);
threadKind          = pgEnum("thread_kind", ["problem", "lesson", "post", "room_session"]);
contentStatus       = pgEnum("content_status", ["visible", "hidden_pending", "removed", "deleted"]);
reportTarget        = pgEnum("report_target", ["comment", "post", "study_plan", "company", "user"]);
reportReason        = pgEnum("report_reason", ["spam", "harassment", "hate", "personal_data", "nda_confidential",
                                               "copyright", "unmarked_spoiler", "off_topic", "malware", "other"]);
reportStatus        = pgEnum("report_status", ["open", "actioned", "dismissed"]);
modAction           = pgEnum("mod_action", ["hide", "restore", "remove", "lock", "unlock", "set_spoiler",
                                            "suspend", "unsuspend", "void_votes", "approve_company", "merge_company"]);

// users: two new columns (additive)
role: userRole("role").notNull().default("user"),
communitySuspendedUntil: timestamp("community_suspended_until", { withTimezone: true }),

// problems: two counters (additive)
likeCount: integer("like_count").notNull().default(0),       // CHECK >= 0
dislikeCount: integer("dislike_count").notNull().default(0), // CHECK >= 0

discussion_threads(
  id uuid pk, kind thread_kind not null,
  problem_id uuid null → problems ON DELETE CASCADE,
  lesson_slug text null (CHECK slug format; validated in code against published lessons),
  post_id uuid null (FK added in C3), room_session_id uuid null (FK added in C5),
  comment_count int not null default 0, locked_at timestamptz null, created_at,
  CHECK (num_nonnulls(problem_id, lesson_slug, post_id, room_session_id) = 1),
  CHECK kind matches the non-null column,
  UNIQUE (problem_id) / (lesson_slug) / (post_id) / (room_session_id)   -- nulls are distinct, so one per target
)

comments(
  id uuid pk, thread_id → discussion_threads CASCADE, parent_id uuid null → comments,
  depth smallint not null CHECK (depth IN (0,1)), CHECK ((parent_id IS NULL) = (depth = 0)),
  author_id uuid null → users ON DELETE SET NULL,
  body_md text not null CHECK (char_length(body_md) <= 10000), body_hash text not null,
  has_spoiler boolean not null default false,
  up_count int not null default 0, down_count int not null default 0, reply_count int not null default 0,
  score int GENERATED ALWAYS AS (up_count - down_count) STORED,
  rank_best double precision GENERATED ALWAYS AS (<wilson(up_count, down_count)>) STORED,
  status content_status not null default 'visible',
  edited_at, deleted_at, removed_at, removed_reason text null (≤ 200), created_at,
  INDEX (thread_id, depth, rank_best DESC, created_at DESC, id) WHERE status = 'visible',
  INDEX (thread_id, depth, created_at DESC, id) WHERE status = 'visible',
  INDEX (parent_id, created_at, id),
  INDEX (author_id, created_at DESC),            -- rate limits, export, profile
  INDEX (body_hash, created_at DESC)             -- duplicate detection
)

comment_votes(comment_id → comments CASCADE, user_id → users CASCADE, value smallint CHECK (value IN (-1, 1)),
              created_at, updated_at, PRIMARY KEY (comment_id, user_id), INDEX (user_id, updated_at DESC))
problem_votes(problem_id → problems CASCADE, user_id → users CASCADE, value smallint ±1, created_at, updated_at,
              PRIMARY KEY (problem_id, user_id), INDEX (user_id, updated_at DESC))
problem_difficulty_feedback(problem_id, user_id, value smallint CHECK (value IN (-1, 0, 1)), created_at, updated_at,
              PRIMARY KEY (problem_id, user_id))

reports(id, reporter_id → users CASCADE, target_type report_target, target_id uuid, reason report_reason,
        details text null (≤ 1000), status report_status default 'open', resolved_by → users SET NULL,
        resolved_at, resolution_note (≤ 500), created_at,
        UNIQUE (reporter_id, target_type, target_id), INDEX (status, created_at), INDEX (target_type, target_id))
moderation_actions(id, actor_id → users SET NULL, action mod_action, target_type report_target, target_id uuid,
        reason text not null (1–500), meta jsonb null (CHECK octet_length ≤ 2048), created_at,
        INDEX (target_type, target_id, created_at DESC), INDEX (created_at DESC))
content_revisions(id, target_type report_target, target_id uuid, title text null, body_md text, edited_by → users
        SET NULL, created_at, INDEX (target_type, target_id, created_at DESC))   -- append-only, purged at 90 days
```
Wilson in SQL (immutable, so it can be a stored generated column; `n = u + d`, `z = 1.96`):
`CASE WHEN u + d = 0 THEN 0 ELSE ((u/n) + z²/(2n) − z·sqrt(((u/n)(1 − u/n) + z²/(4n))/n)) / (1 + z²/n) END`
with `u`, `d`, `n` cast to `double precision`. The same function lives in `src/lib/community/ranking.ts`, and a
parity test keeps both in step (AC-C-VT-3). Polymorphic `reports` / `moderation_actions` / `content_revisions` have no
FK on `target_id` on purpose: they are audit records that must outlive the target. The server validates the target
on insert.

**C2**
```ts
planVisibility = pgEnum("plan_visibility", ["private", "unlisted", "public"]);
planSource     = pgEnum("plan_source", ["manual", "interview_post", "room_session", "clone"]);

study_plans(id uuid pk (random v4 = the unlisted link capability), owner_id → users CASCADE, title (1–80),
  description_md (≤ 2000) null, visibility default 'private', source plan_source default 'manual', source_id uuid null,
  forked_from_id → study_plans SET NULL, item_count int default 0 (CHECK 0–300), save_count int default 0,
  deleted_at, created_at, updated_at,
  INDEX (owner_id, updated_at DESC) WHERE deleted_at IS NULL,
  INDEX (visibility, save_count DESC, updated_at DESC) WHERE visibility = 'public' AND deleted_at IS NULL)
study_plan_sections(id, plan_id → study_plans CASCADE, position int, title (1–80), INDEX (plan_id, position))
study_plan_items(id, plan_id → study_plans CASCADE, section_id → study_plan_sections SET NULL, position int,
  problem_id → problems (RESTRICT; problems are unpublished, never deleted) null,
  external_url text null CHECK (external_url ~ '^https://leetcode\.com/problems/[a-z0-9-]{1,100}/$'),
  external_title text null (1–120), note text null (≤ 280), created_at,
  CHECK (num_nonnulls(problem_id, external_url) = 1), CHECK ((external_url IS NULL) = (external_title IS NULL)),
  UNIQUE (plan_id, problem_id), UNIQUE (plan_id, external_url), INDEX (plan_id, section_id, position))
study_plan_ticks(user_id → users CASCADE, item_id → study_plan_items CASCADE, done_at, PRIMARY KEY (user_id, item_id))
study_plan_saves(user_id → users CASCADE, plan_id → study_plans CASCADE, created_at, PRIMARY KEY (user_id, plan_id))
```
Progress for our problems is **computed**, never stored: one query aggregates the viewer's submissions for the plan's
`problem_id`s (`bool_or(verdict = 'accepted' AND kind = 'submit')`, existence of any submit), the same rule as the
catalog status.

**C3**
```ts
postKind    = pgEnum("post_kind", ["interview", "discussion"]);
postRole    = pgEnum("post_role", ["swe", "frontend", "backend", "fullstack", "mobile", "data_ml", "sre_devops",
                                   "security", "intern", "new_grad", "other"]);
postOutcome = pgEnum("post_outcome", ["offer", "rejected", "waiting", "withdrew", "undisclosed"]);
companyStatus = pgEnum("company_status", ["pending", "approved", "merged"]);

companies(id, slug unique CHECK '^[a-z0-9-]{2,60}$', name (2–80), status default 'pending',
  merged_into_id → companies null, created_by → users SET NULL, created_at, INDEX (status, slug text_pattern_ops))
posts(id, kind post_kind, author_id → users SET NULL, is_anonymous boolean default false,
  title (10–150), body_md (≤ 20000), body_hash,
  company_id → companies null, role post_role null, level text null (≤ 40), interview_year smallint null
  CHECK 2000–2100, interview_month smallint null CHECK 1–12, location text null (≤ 60), outcome post_outcome null,
  rounds jsonb not null default '[]' (CHECK jsonb_array_length ≤ 10 and octet_length ≤ 4096; Zod on write),
  CHECK (kind = 'discussion' OR (company_id IS NOT NULL AND role IS NOT NULL AND interview_year IS NOT NULL)),
  up_count, down_count, score GENERATED, rank_best GENERATED, status content_status default 'visible',
  search_tsv tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', title), 'A') ||
                                          setweight(to_tsvector('english', body_md), 'B')) STORED,
  edited_at, deleted_at, removed_at, removed_reason, created_at,
  INDEX (kind, created_at DESC, id) WHERE status = 'visible',
  INDEX (company_id, created_at DESC) WHERE status = 'visible',
  INDEX USING GIN (search_tsv), INDEX (author_id, created_at DESC), INDEX (body_hash, created_at DESC))
post_problems(id, post_id → posts CASCADE, round_index smallint (0–9), position smallint,
  problem_id → problems null, external_url null (same CHECK as plans), title text null (1–120), note (≤ 280),
  CHECK (problem_id IS NOT NULL OR title IS NOT NULL), CHECK (external_url IS NULL OR problem_id IS NULL),
  INDEX (post_id, round_index, position), INDEX (problem_id) WHERE problem_id IS NOT NULL)
post_tags(post_id → posts CASCADE, tag_id → tags CASCADE, PRIMARY KEY (post_id, tag_id), INDEX (tag_id))
post_votes(post_id → posts CASCADE, user_id → users CASCADE, value ±1, created_at, updated_at, PK (post_id, user_id),
  INDEX (user_id, updated_at DESC))
discussion_threads: ADD FOREIGN KEY (post_id) → posts CASCADE
```

**C4**
```ts
notificationKind = pgEnum("notification_kind", ["reply", "post_comment", "mention", "mod_action", "company_review"]);
notifications(id, user_id → users CASCADE, kind, actor_id → users SET NULL, comment_id → comments CASCADE null,
  post_id → posts CASCADE null, thread_id → discussion_threads CASCADE null, data jsonb null (≤ 1024),
  read_at, created_at, INDEX (user_id, created_at DESC), INDEX (user_id) WHERE read_at IS NULL)
```
Account deletion needs the current `ON DELETE` rules to be right: submissions and room tables already cascade or set
null per their specs. C4 adds an integration test over all FKs to `users`.

**C5:** `discussion_threads.room_session_id` FK → `room_sessions` CASCADE. There is no other schema change: lesson
threads use `lesson_slug` from C1, and profile sections read existing tables.

**Counters vs computed:** vote counters (`up_count`, `down_count`, `like_count`, `dislike_count`), `reply_count`,
`comment_count`, `item_count`, `save_count` are maintained in the same transaction as the write
(`UPDATE … SET up_count = up_count + $delta`), so lists never aggregate votes. `pnpm community:recount` recomputes
them all (it runs in the integration suite after concurrency tests, and the owner can run it after manual SQL).
Plan progress, trust levels and "asked in N posts" are computed (cheap, indexed, always correct).

### C.2 API routes

All JSON, `Cache-Control: no-store`, check order as in AC-C-GEN-3. Zod schemas live in `src/lib/community/schemas.ts`
(shared with client forms).

| Phase | Method + path | Purpose |
|---|---|---|
| C1 | `GET /api/comments?target=problem:<slug>\|post:<id>\|lesson:<slug>\|session:<id>&sort=best\|new&cursor=` | Top-level page with up to 3 replies each, my votes, spoiler masking |
| C1 | `GET /api/comments/[id]/replies?cursor=` · `GET /api/comments/[id]?reveal=1` | More replies · reveal a spoiler body |
| C1 | `POST /api/comments` `{target, parentId?, body, hasSpoiler}` | Create (thread lazily) |
| C1 | `PATCH /api/comments/[id]` · `DELETE /api/comments/[id]` | Edit (24 h) · author delete |
| C1 | `PUT /api/comments/[id]/vote` `{value: 1\|-1\|0}` | Vote |
| C1 | `PUT /api/problems/[slug]/vote` · `PUT /api/problems/[slug]/difficulty-feedback` | Problem ▲▼ · feedback |
| C1 | `POST /api/reports` `{targetType, targetId, reason, details?}` | Report |
| C1 | `POST /api/mod/actions` `{action, targetType, targetId, reason, until?}` | Moderator action |
| C1 | `POST /api/community/preview`: **not added**. The preview renders on the client with the same component (§C.4) | — |
| C2 | `GET/POST /api/plans` · `GET/PATCH/DELETE /api/plans/[id]` | Plans |
| C2 | `POST /api/plans/[id]/items` (batch ≤ 50) · `PATCH /api/plans/[id]/items` (reorder) · `PATCH/DELETE /api/plans/[id]/items/[itemId]` | Items |
| C2 | `POST/PATCH/DELETE /api/plans/[id]/sections[/sectionId]` | Sections |
| C2 | `PUT /api/plans/[id]/items/[itemId]/tick` `{done}` · `PUT /api/plans/[id]/save` `{saved}` · `POST /api/plans/[id]/duplicate` | Ticks, save, duplicate |
| C2 | `POST /api/plans/import` `{source: "room_session", sessionId}` | Room → plan (C3 adds `{source: "post", postId, problemIds, planId?, section}`) |
| C3 | `GET/POST /api/posts` · `GET/PATCH/DELETE /api/posts/[id]` · `PUT /api/posts/[id]/vote` | Posts |
| C3 | `GET /api/companies?q=` · `POST /api/companies` | Typeahead · propose company |
| C4 | `GET /api/notifications?cursor=` · `POST /api/notifications/read` `{ids \| all}` | Notifications |
| C4 | `GET /api/mod/reports` · `GET /api/mod/votes?targetType&targetId` · `POST /api/mod/users/[id]/suspend` | Moderation |
| C4 | `GET /api/me/export` · `DELETE /api/me` `{confirmUsername, deleteContent}` | Privacy |
| C4 | `POST /api/cron/community-purge` (header `Authorization: Bearer CRON_SECRET`) | Retention |

Pages render server-side and call the server modules directly (no fetch to our own API), as the rest of the app
does. The API serves client components (composer, vote buttons, dialogs) and "load more".

### C.3 Server modules and layout

```
src/lib/community/        pure, client-safe (no DB/server imports — same rule as src/lib/rooms)
  schemas.ts              Zod: bodies, targets, post fields, plan fields, cursor
  ranking.ts              wilsonLowerBound, hotScore (mirrors SQL; parity tests)
  trust.ts                trustLevel({createdAt, hasAccepted}, now) → 0 | 1
  links.ts                extractLinks, isAllowlisted, normalizeLeetCodeUrl, SHORTENER_HOSTS
  body.ts                 normalizeForHash, countCodeBlocks, mentions (≤ 5)
  cursor.ts               encode/decode base64url {k, id} with Zod
  markdown-schema.ts      the rehype-sanitize schema (exported so tests and both renderers share it)
src/server/community/
  access.ts               getCommunityUser (user + role + trust + suspension in ONE query), requireModerator,
                          assertCommunityEnabled / assertWritable
  limits.ts               withCommunityLock(tx, userId) + countSince(table, userId, since) + LIMITS table
  threads.ts              resolveTarget (problem slug / post / lesson / session with access checks), ensureThread
  comments.ts             list (best/new, cursor), replies, create, edit, delete, reveal
  votes.ts                setVote(kind, targetId, userId, value) — upsert + counter delta in one tx
  reports.ts · moderation.ts · revisions.ts
  posts.ts · companies.ts · search.ts            (C3)
  notifications.ts · export.ts · purge.ts         (C4)
src/server/plans/         plans.ts, items.ts, progress.ts, import.ts   (C2)
src/components/community/ user-markdown.tsx (server), user-markdown-preview.tsx (client, lazy), composer.tsx,
                          comment-thread.tsx, comment.tsx, vote-control.tsx, spoiler.tsx, report-dialog.tsx,
                          post-card.tsx, post-facts.tsx, interview-form/*, notifications-bell.tsx (C4)
src/components/plans/     plan-list.tsx, plan-items.tsx, add-to-plan-menu.tsx, add-to-plan-dialog.tsx
scripts/                  users-set-role.ts, community-recount.ts, community-purge.ts, difficulty-report.ts
```
Lock order: `community:<user>` is a user-level lock. It is taken first and never while holding a room or session
lock (CLAUDE.md lock order user → room → session).

### C.4 Markdown sanitization

- **Renderer:** reuse the stack already in `dependencies`: `react-markdown` + `remark-gfm` + `rehype-sanitize`, as
  in `src/components/problem/markdown.tsx`. No new markdown dependency. **No `rehype-raw`, ever.**
- **Schema:** start from `defaultSchema` and remove `img`, `picture`, `source`, `video`, `audio`, `iframe`, `input`
  (task lists render as text), `details/summary`, `sup/sub`, footnotes, `h1`/`h2` (mapped to `h3`/`h4`, the rest to
  `h4`). Protocols: `http`, `https`, `mailto` for `href`. Keep `clobberPrefix: "user-content-"`. Keep `className`
  only as `language-*` on `code` (validated against the allowlist).
- **Links:** a small rehype plugin after sanitize adds `rel="ugc nofollow noopener noreferrer"` to every external
  `a`. Links stay in the same tab (no `target`).
- **Code highlighting:** a rehype step after sanitize turns `pre > code.language-x` into Shiki HAST through the
  existing `createHighlighterCore` + JS regex engine (`src/server/guide/highlight.ts` pattern), with the theme as CSS
  variables. Shiki escapes the code itself, so its output is safe. Its inline `style` attributes are allowed by the
  current `style-src 'unsafe-inline'`. Languages load lazily per allowlisted language. A process-local LRU (500
  entries) is keyed by `sha256(lang + code)`.
- **Server-only rendering** for display: comment lists are server components, so no markdown code ships for reading.
  The composer preview lazy-loads a client `UserMarkdownPreview` with the **same sanitize schema** and no Shiki
  (plain code blocks). The bundle cost is paid only when "Preview" is clicked.
- **Storage:** markdown only. No cached HTML, so a sanitizer fix applies to old content immediately. Render cost is
  bounded by the 8-block / 200-line rule and the page size.
- **CSP:** unchanged (`img-src 'self' data: blob:` would block external images anyway, and the schema drops them
  first). The e2e CSP walk gains the new pages and a page that renders the XSS corpus.

### C.5 Pagination and cursors

- Keyset cursors: `base64url(JSON {k: [sortKey...], id})` validated by Zod. Best: `(rank_best, created_at, id)`.
  New: `(created_at, id)`. Replies: `(created_at, id)` ascending. Page size 20 (top-level) and 3 (inline replies),
  then 20 per "show more".
- Known trade-off: `rank_best` changes when votes arrive, so a reader paging "Best" during voting can see a comment
  twice or miss one. That is acceptable for discussions and documented. "New" is exact.
- Forum "Hot": offset pagination over the ≤ 30-day window, max 10 pages (time-dependent order cannot be keyset
  paginated). "Top"/"New": keyset.
- The pages use links (`?cursor=`) on full pages (`/discuss`, forum lists), so they work without JS. The workspace
  tab shows the top 5 plus a link.

### C.6 Caching on Vercel and query budgets

- Every community page reads the session (`cookies()`), so it renders dynamically like the rest of the app. Add
  `export const dynamic = "force-dynamic"` where a page would otherwise be inferred static (as `/rooms` does). No CDN
  caching of personalized HTML. API responses are `no-store`.
- The cost is held down with denormalized counters, covering partial indexes and hard query budgets, tested with a
  query counter as in `catalog.test.ts` / `rooms-sessions-api.test.ts`:

| Page / endpoint | Budget |
|---|---|
| Problem page (description render) | unchanged. The Discussion tab adds ≤ 3 in its own Suspense boundary |
| `/problems/[slug]/discuss` | ≤ 5 |
| `GET /api/comments` | ≤ 4 |
| Vote / comment write | ≤ 6 statements in one transaction (lock, limit count, insert, counter update, thread update, read-back) |
| `/community/interviews` list | ≤ 3 (posts + company + problem counts in one query, my votes, facets from a 60 s in-process cache) |
| `/community/posts/[id]` | ≤ 5 |
| `/plans/[id]` | ≤ 4 |
| Header bell (C4) | 1 (unread count, partial index) |

- **Later, if traffic needs it:** guest-only cached fragments ("Most asked here", facet counts) with
  `unstable_cache` / tags revalidated on writes. Check `node_modules/next/dist/docs/` for the Next 16 API before
  using it.

### C.7 Rate limiting

The current limiters are in memory (`src/server/http/rate-limit.ts`, per instance, a soft cap on Vercel). Community
writes do **not** use them. Instead `limits.ts`:
1. `SELECT pg_advisory_xact_lock(hashtext('community:' || $userId))` serializes one user's community writes (cheap,
   per user).
2. Counts the user's own rows in the window from the content table (`comments.author_id, created_at`,
   `*_votes.user_id, updated_at`, `reports.reporter_id, created_at`, …). Every one has a `(user, time)` index.
3. Answers 429 with `Retry-After` = oldest row in window + window − now.

No new table and no token-bucket state: the content is the log. This is the pattern Run/Submit already uses
("counted in the database"). Votes that are changed (upsert) count by `updated_at`, so toggling still counts.
Guest-facing reads are not limited in the MVP (they are cheap and indexed). Vercel's firewall/WAF is the escape
hatch for read floods (owner setting, not code).

### C.8 Moderation tooling

- **C1 (minimum to launch):** report dialog; auto-hide at 3 TL1 reports; `/mod` with the open reports list and the
  actions hide / restore / remove / lock / set spoiler / suspend (7 or 30 days); audit log list; the CLI for roles.
  The owner gets a daily count of open reports through the `/mod` badge in the avatar menu (no email: the app sends
  no email).
- **C4:** tabs Auto-hidden, Resolved, Companies to review, Vote audit, Users (search, suspensions, last removals),
  notifications to authors, purge job, recount script, an appeals note template.
- **Process (content policy page):** response target 72 h for reports, 24 h for copyright and personal data. The
  owner can turn on `COMMUNITY_READ_ONLY` during an incident.

### C.9 Search

Postgres full-text in C3 (generated `search_tsv` + GIN, `websearch_to_tsquery('english', $q)`), no extensions, so it
works on Supabase and local Postgres 16 alike. Company typeahead: prefix `ILIKE` on `slug` with a
`text_pattern_ops` index (no `pg_trgm` needed). C5 adds comment search (same approach, a generated column on
`comments`) and a combined `/search` page. Revisit trigram or external search only beyond ~100 k posts.

### C.10 Fit with the Elo ratings

- Rooms v2 ratings are **outcome-based and per room** (owner decision D2). Votes and feedback are opinions,
  gameable, and global. They must not move `rating_adjust` or member ratings (AC-C-VT-5).
- What the feedback does: (a) on the problem page, once n ≥ 10, a line such as "Most solvers found it harder than
  its rating (n = 23)"; (b) `pnpm community:difficulty-report` prints, per problem, the feedback distribution next to
  `author_rating`, the observed `rating_adjust` and the solve rates, so a maintainer can propose a `meta.json`
  `rating` change in a PR (reviewed, `problems:verify`, `problems:export-sql`).
- Interview data can inform *which new problems to write* (most-asked external problems without an original
  equivalent), never ratings.

### C.11 Fit with rooms

- C2: results page action "Save as study plan" (members only; finished sessions; the problem titles are public after
  the session, as in v1 results).
- C5: a members-only thread per session (thread kind `room_session`; every read goes through
  `requireSessionInRoom`, null → 404; no reports UI needed because the room owner can delete comments in their room,
  though reports still work). It closes 30 days after the session.
- Later: "Start a lobby from a plan" pins up to 8 plan problems into a lobby (touches `drawSlots` pinned slots; a
  separate spec).
- Rooms stay private: nothing from a room appears in public community surfaces, and votes or comments never affect
  room scoring.

### C.12 Fit with the open-source / AI-contribution workflow

- All community code, the content policy and the moderation rules are in the public repo. Secrets stay in env.
  Spam heuristics are simple and public, so they are tuned by limits rather than by secret rules.
- Contributions that are *content* (hints, new problems, curated plans, rating changes) go through GitHub PRs into
  `problems/` or a future `plans/` seed folder, not through the community UI. The problem page gets a "Suggest an
  improvement" link to a GitHub issue template (C5).
- The project never seeds fake users or AI-written "experiences". Demo data exists only in local seeds and e2e
  fixtures, clearly fake (example companies like those in the mockups).
- Each WP below is sized for one Opus agent. The agent reads `CLAUDE.md`, `PLAN.md`, `DESIGN.md`, this spec and the
  files it touches, works on `feature/community-<wp>`, PRs into `integration`, and the owner merges.

### C.13 Env additions

| Variable | Default | Phase | Notes |
|---|---|---|---|
| `COMMUNITY_ENABLED` | `0` | C1 | Master switch (UI + routes). Owner flips it on Vercel after the C1 gate. |
| `COMMUNITY_READ_ONLY` | `0` | C1 | Incident switch. |
| `PLANS_ENABLED` | `0` | C2 | Only if Q10 = (a): study plans on their own switch. |
| `CONTACT_EMAIL` | none | C1 | Shown on legal and report pages. **Required in production when community is enabled** (env validation fails otherwise). |
| `CRON_SECRET` | none | C4 | Protects the purge route; Vercel Cron sends it. |

All of them go into `src/server/env.ts`, `.env.example` and `docs/DEPLOY.md` (`env-docs.test.ts` checks this).

### C.14 Migration plan

- C1: `ALTER TABLE users ADD COLUMN role … DEFAULT 'user'`, `ADD COLUMN community_suspended_until`;
  `ALTER TABLE problems ADD COLUMN like_count/dislike_count … DEFAULT 0` (constant defaults, no table rewrite); create
  enums and tables; `ENABLE ROW LEVEL SECURITY` on each. Integration test like `rooms-v2-migration.test.ts`
  (columns, CHECKs, RLS, generated columns compute).
- C2, C3, C4, C5: new tables or FKs only.
- Each phase: `pnpm db:generate`, rename to the next free number after whatever `integration` has (0005 is being
  taken now), `pnpm db:export-sql`, update `tests/helpers/db.ts` `resetTestDb()` TRUNCATE list and the `rls.test.ts`
  table list. Apply on Supabase with `DATABASE_URL_DIRECT` (DEPLOY.md) **only after the owner's go-ahead**, or via the
  regenerated `schema.sql` for fresh projects.
- Rollback: each migration is additive; turning the flag off hides everything without dropping data.

---

## D. Delivery plan

### D.1 Phases and gates

| Phase | Gate (all must pass before the flag goes on in production) |
|---|---|
| **C1** discussion + safety | AC-C-GEN-*, CM-*, MD-*, VT-1…5, RP-1…3 + RP-5, RL-*, A11Y-*; legal pages drafted and approved by the owner; `CONTACT_EMAIL` set; the owner has the admin role; XSS corpus and CSP walk green; a 1-hour owner dogfood on a preview deployment. |
| **C2** study plans | AC-C-SP-*; it can ship with `COMMUNITY_ENABLED` because plans are private by default. Optionally a separate `PLANS_ENABLED` (Q10). |
| **C3** interviews | AC-C-IV-*, VT for posts, anonymity leak test (IV-2), composer a11y; content policy updated for interview posts. |
| **C4** moderation + notifications | AC-C-RP-4, NT-*, PR-*; purge job scheduled; export and delete tested on a copy of production data shape. |
| **C5** profiles / search / guide / room threads | ACs written at the start of C5 (small); same test pattern. |

### D.2 Work packages (one Opus agent each)

| WP | Branch | Content | Depends | Size | Shared files (conflict hot spots) |
|---|---|---|---|---|---|
| C1-A | `feature/community-c1-core` | C1 migration + schema, `src/lib/community/*` (schemas, ranking, trust, links, body, cursor), `access.ts`, `limits.ts`, `threads.ts`, `comments.ts`, `votes.ts`, `reports.ts`, `moderation.ts`, API routes, env vars, CLI `users:set-role`, `community:recount`, integration tests (check order matrix, concurrency, limits across pools) | — | L | `schema.ts`, `drizzle/meta`, `env.ts`, `.env.example`, `DEPLOY.md`, `tests/helpers/db.ts`, `rls.test.ts`, `schema.sql` |
| C1-B | `feature/community-c1-markdown` | `markdown-schema.ts`, `user-markdown.tsx` (server, Shiki step), preview component, XSS corpus (unit + e2e page), CSP walk additions | — (parallel with C1-A) | M | `csp.spec.ts`, `globals.css` (code block tokens), `highlight.ts` (generalize languages) |
| C1-C | `feature/community-c1-ui` | Discussion tab (Suspense), `/problems/[slug]/discuss`, composer, vote control, spoiler, report dialog, problem ▲▼ and feedback, `/mod` minimal, nav/footer/avatar menu items, legal pages (owner text), e2e + axe | C1-A, C1-B | L | `workspace.tsx`, `(workspace)/problems/[slug]/page.tsx`, `problem-page.ts`, `nav-links.ts`, `site-footer.tsx`, `user-menu.tsx`, a11y e2e list, `DESIGN.md` §13 |
| C2-A | `feature/community-c2-plans` | C2 migration, `src/server/plans/*`, plan APIs, progress query, integration tests | C1-A merged (migration order only; no code dependency) | M | `schema.ts`, `drizzle/meta`, `tests/helpers/db.ts` |
| C2-B | `feature/community-c2-plans-ui` | `/plans`, `/plans/[id]`, add-to-plan menu (problem page, catalog row), room results "Save as study plan", reorder with buttons, e2e + axe | C2-A | M | `catalog` row component, rooms results page, `workspace.tsx` header actions |
| C3-A | `feature/community-c3-posts` | C3 migration, posts/companies/search modules, APIs, anonymity leak test, Hot/Top parity tests | C1-A, C2-A | L | `schema.ts`, `drizzle/meta`, `comments.ts` (post threads) |
| C3-B | `feature/community-c3-forum-ui` | `/community/*` pages, composer with template, filters, post page, add-to-plan dialog, "Asked in N posts" on the problem page, e2e + axe | C3-A, C2-B, C1-C | L | `nav-links.ts`, problem page, `DESIGN.md` |
| C4-A | `feature/community-c4-moderation` | `/mod` tabs, vote audit, suspensions UI, company review, purge job + cron route, retention tests | C3-A | M | `/mod` pages, `env.ts` (`CRON_SECRET`) |
| C4-B | `feature/community-c4-notifications` | C4 migration (notifications), hooks in comments/posts/moderation, bell + panel, mentions | C3-A | M | `site-header.tsx`, `comments.ts`, `posts.ts`, `moderation.ts` |
| C4-C | `feature/community-c4-privacy` | Export, account deletion (Q8), FK audit test, settings UI for delete/export | C4-B | M | `users.ts`, auth routes, profile page |
| C5-x | `feature/community-c5-*` | Profiles section, lesson threads, room session threads, global search, "Suggest an improvement" link | C4 | S each | profile page, lesson layout, rooms results |

Parallelism: C1-A ∥ C1-B ∥ (C2-A after C1-A's migration lands) → C1-C ∥ C2-B → C3-A → C3-B ∥ C4-A ∥ C4-B → C4-C →
C5. **Migrations are the main conflict:** only one WP with a migration may be open at a time. The orchestrator
serializes C1-A → C2-A → C3-A → C4-B and rebases the next one on `integration` before `pnpm db:generate`.

### D.3 Test plan (estimate)

| Layer | Content | Rough count |
|---|---|---|
| Unit (Vitest) | Zod schemas, ranking parity tables, trust, link normalization (30 URL cases), body hash/mentions, cursor round-trip, sanitize schema + XSS corpus snapshot (≥ 80 payloads), markdown heading mapping, plan progress reducer | ~150 cases |
| Integration (real Postgres) | migrations/RLS/generated columns; check-order matrix per route; concurrency (votes, counters, limits across two pools); spoiler masking; anonymity leak grep; plan visibility matrix; room → plan; moderation actions + audit; purge; export; deletion FK audit; query budgets | ~120 tests |
| E2E (Playwright, judge for "solve to unlock spoiler") | comment/reply/edit/delete; vote; spoiler reveal before/after solving; report → auto-hide → mod restore; plan CRUD + add from problem + progress after an accepted submit; interview post → add to plan; room results → plan; flag off → 404 | ~25 specs |
| A11y | axe on every new page and dialog (dark; light locally), keyboard paths of AC-C-A11Y-2 | in the a11y list |
| Security | CSP walk extended; XSS corpus page in the browser; `no-sensitive-logging` extended (never log bodies); `no-shell` unchanged | — |

### D.4 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| No audience: empty discussions look dead | Medium | Ship C2 (single-player value) first; show discussion only as a tab, with an empty state that invites the first question; never fake content. |
| Spam / SEO link farms once public | High | TL0 limits, link caps, `nofollow ugc`, holds for review, duplicate detection, read-only switch, flag off by default. |
| One-person moderation burden | High | Auto-hide, a queue with one-click actions, clear policy, response targets, the option to keep C3 posting TL1-only (Q9). |
| Copyright (pasted LeetCode statements) and NDA leaks | High (legal) | Link-only design, composer warning and confirmation step, report reasons, takedown process and contact, ToS. |
| Defamation of companies or interviewers | Medium | Policy forbids personal data, moderators remove, company correction channel, no logos. |
| XSS through markdown | High | No raw HTML, a strict schema, server rendering, corpus tests, CSP unchanged as a second layer. |
| Vote manipulation (friend groups from rooms, alts) | Medium | ▼ gated, caps, vote audit, void votes, no reputation to farm. |
| Anonymity broken by a bug | High (trust) | A single serializer for authors with an explicit `isAnonymous` branch and a leak test over all routes. |
| Supabase free-tier load | Medium | Counters, partial indexes, budgets, no polling; bell computed on render only. |
| Scope creep (badges, solutions tab, contests) | Medium | Deferred list in §A.3 and §B.9; each needs a new spec. |
| Overlap with F2 (official hints/solutions) | Low | Community solutions wait for F2; spoiler flag in C1 meanwhile. |
| Concurrent migration numbering with other work (0005) | Low | Numbering open; serialize migration WPs; regenerate `schema.sql` each time. |
| Accessibility regressions in dense threads | Medium | Two-level threads, axe in CI, keyboard ACs. |

### D.5 Recommendation

Start **C2 (study plans) and C1 (problem discussion) in parallel**: C1-A + C1-B with two agents, and C2-A once
C1-A's migration is merged. C2 is the best value for the effort: it is useful on day one with zero community, has
almost no abuse surface, and becomes the "landing place" for C3's add-to-plan and for rooms. C1 is the owner's first
ask and builds every shared piece (threads, markdown, votes, reports, limits) that C3 needs. Keep
`COMMUNITY_ENABLED=0` in production until the C1 gate passes. Then C3, then C4 before any promotion of the site, then
C5.

---

## 12. Decisions for the owner

Each question has a recommended option (★).

1. **Q1 What ships first?**
   (a) C1 discussion first, then C2 · (b) C2 study plans first, then C1 · **(c) ★ C1 and C2 in parallel, C2 can go
   live first** · (d) C3 interview forum first.
2. **Q2 Votes on comments and posts?**
   **(a) ★ ▲ and ▼, net score, ▼ only for established accounts** · (b) ▲ only (like/"helpful") · (c) no votes on
   comments.
3. **Q3 Votes on problems?**
   **(a) ★ ▲▼ with "% liked" shown from 10 votes** · (b) ▲ only with a count · (c) none.
4. **Q4 Difficulty feedback and ratings?**
   **(a) ★ Show it and use it in a maintainer report; never change ratings automatically** · (b) let it nudge
   `rating_adjust` automatically · (c) do not collect it.
5. **Q5 Anonymous interview posts?**
   **(a) ★ Allowed: hidden from the public, visible to moderators, in the author's export** · (b) not allowed ·
   (c) fully anonymous with no stored author (not recommended: no moderation or deletion possible).
6. **Q6 Reputation and badges?**
   **(a) ★ None public in C1–C5, only internal trust levels** · (b) a public contribution score · (c) badges in C5.
7. **Q7 Legal setup at launch of C1?** (Get legal advice; options describe scope.)
   **(a) ★ ToS, privacy notice, content policy and a report/copyright page with `CONTACT_EMAIL`; register a DMCA
   agent when US traffic becomes meaningful** · (b) the same plus register a DMCA agent now · (c) launch without legal
   pages (not recommended).
   And: which email address goes into `CONTACT_EMAIL`?
8. **Q8 When a user deletes their account, their comments and posts…**
   **(a) ★ are anonymized by default ("deleted user"), with an opt-in "also delete everything I wrote"** · (b) are
   always deleted (threads lose context) · (c) stay attributed (not acceptable for privacy).
9. **Q9 Who may post interview experiences?**
   **(a) ★ Any established (TL1) account; new accounts can comment only** · (b) any account · (c) only accounts with
   ≥ 5 accepted submissions.
10. **Q10 Study plans and the flag?**
    **(a) ★ Plans ship under their own `PLANS_ENABLED` flag (on as soon as C2 passes), independent of
    `COMMUNITY_ENABLED`** · (b) one flag for everything.
11. **Q11 Spoilers in problem discussions?**
    **(a) ★ "Contains a solution" flag; hidden until solved, with "Show anyway"** · (b) no gating · (c) the whole
    discussion is visible only after solving.
12. **Q12 Moderators at launch?**
    **(a) ★ The owner as the only admin; add moderators from trusted room members later via the CLI** · (b) appoint 1–2
    moderators before C1 goes live.
