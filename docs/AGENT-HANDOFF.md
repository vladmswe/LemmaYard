# Agent handoff

Read this file first if you are an AI agent (or a new maintainer) picking up
work on LemmaYard. It records what exists, what the owner has decided, how work
is organised and verified, the traps that cost time before, and what is next.
It complements, and does not replace, `CLAUDE.md` (commands and code rules),
`AGENTS.md`, `PLAN.md` (original milestones), `DESIGN.md` (UI rules), the
root `README.md` (architecture) and the specs in `docs/specs/`.

State described here is as of 2026-10-18. It goes stale quickly: always confirm
with `git log --oneline -20 main`, `git branch -a` and `git worktree list`
before relying on the "In flight" and "Backlog" sections, and update them when
you finish a unit of work.

## 1. What LemmaYard is

A LeetCode-like practice platform for a small community: solve problems in the
browser with automatic judging, practise in private rooms with friends, learn
data structures from a guide. Owner-run hobby project, public repository, MIT
licence. The owner deploys it himself to his own Vercel + Supabase accounts.

Shipped on `main` (see the root `README.md` for details):

- Problem catalogue: 50 original problems (statements, reference solutions in
  Python and JavaScript, about 180-240 seeded generated tests each for the 30 newest),
  author ratings 1050-2150, tags, problem list, editor (Monaco), Run / Submit
  with per-test results.
- Judge: Docker sandbox per submission (default for dev/CI) and a Vercel Sandbox
  microVM executor for production (`JUDGE_EXECUTOR=vercel-sandbox`,
  `docs/specs/judge-prod.md`). Protocol: stdin JSON, nonce frames, verdict
  decided on the host, expected output never inside the sandbox.
- Auth (email + password, argon2, signed session cookie, rate limits), security
  headers and an enforced CSP.
- Guide: 5 data-structure lessons with visualisations (`src/content/learn/`).
- Rooms v2 (`docs/specs/rooms.md`, `docs/specs/rooms-v2.md`): private team rooms
  with invite links, timed sessions, lobby with draw modes (By rating / By
  difficulty / Manual), scoreboard matrix (participant x problem with solve
  times), live attempts, history, room presets and weekly schedule with `.ics`,
  per-room Elo rating (internal; optional self-reported LeetCode rating is only
  a seed and visible only to its owner).
- LeetCode in rooms: hand-picked links with honor-system results
  (`docs/specs/rooms-external-problems.md`) and automatic picks from a committed, offline LeetCode catalog
  (`docs/specs/leetcode-integration.md`, `src/server/leetcode/`: zerotrac MIT ratings + an overlay with
  estimated tags and difficulty overrides; kill switch `LEETCODE_CATALOG_ENABLED`). Refresh procedure below
  (section 8, "Maintenance").
- Design system v2 "Proof" (dark theme only for now: `src/lib/theme-config.ts`).
- Deploy tooling: `docs/DEPLOY.md`, generated `docs/supabase/schema.sql` and
  `docs/supabase/problems.sql` (+ split parts) that can be pasted into the
  Supabase SQL Editor without any credentials, `/api/health`.

## 2. Owner decisions (do not re-litigate)

Product:

- Name is **LemmaYard** (repo `vladmswe/LemmaYard`, MIT). Internal Postgres
  database/user names `leetcopy`, `leetcopy_test_*`, `leetcopy_e2e_*` are
  allowed; user-visible text and docs must say LemmaYard.
- Rooms: usually 4 problems but 1-8 are allowed; the scoreboard is a matrix
  (who solved which problem, when, with time from session start); rooms double
  as teams; default selection mode is "By rating"; rating is PER ROOM (one rating
  per member inside a room, everyone in the room gets the same problems and all
  members see all ratings); no LeetCode data is ever scraped or fetched by us. The owner allowed (2026-10-18)
  committing LeetCode problem FACTS (number, slug, title, contest position) and the MIT community ratings of
  zerotrac/leetcode_problem_rating with attribution; never statements, examples, hints, tests or premium content.
  Self-reported LeetCode solves never change Elo. Difficulty of catalog problems is derived from the rating
  (`src/lib/leetcode/difficulty.ts`) and labelled "estimated"; topic tags were estimated by an agent and live in
  `overlay.json` for the owner to correct.
- Problems are original work. Never copy LeetCode/Codeforces statements or tests.
  LeetCode problems may only be **linked** (see "In flight").
- More submission languages are wanted; Java first, then others (C++, Go,
  TypeScript are candidates). Adding one is a documented task
  (`docs/specs/judge-prod.md` "Adding a language", README "How to add a language").
- Community layer (comments, votes, study plans, interview forum) follows
  `docs/specs/community.md`. Owner answers so far: votes are up and down;
  anonymous interview posts are allowed (author visible only to moderators);
  the owner is the only moderator/admin at launch; C1 (comments + votes) and C2
  (study plans) are built in parallel, C2 may go live first. The remaining
  questions in section 12 of that spec default to the spec's recommendation
  unless the owner says otherwise.
- Open-source collaboration (issues voted with thumbs-up, AI agents that turn
  accepted issues into PRs): decided so far: Claude Code Action as the agent
  engine, DCO (not CLA), monthly agent budget about $50. Nothing is added to the
  repo or to GitHub settings yet; do not touch GitHub settings without the owner.

Technical:

- Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn on Base UI,
  Drizzle + `pg`, Postgres 16, Zod on every boundary, SQL only through Drizzle,
  no shell strings (`execFile`/`spawn` with arrays).
- Supabase: transaction pooler (6543) for `DATABASE_URL`, session pooler (5432)
  for `DATABASE_URL_DIRECT` (migrations, imports). RLS is enabled on every table
  with no policies; only the owner role the app connects with has access.
- When the database is unreachable the API answers 503 `service unavailable`
  (never a 500 with a stack); loading buttons use `ButtonSpinner`.
- Judge on Vercel is off unless `JUDGE_EXECUTOR=vercel-sandbox` is set; with the
  judge off the API answers 503 `judge_disabled`.

## 3. Working agreement

Branches and merging:

- One unit of work per branch: `feature/<name>`, `fix/<name>` or `update/<name>`.
  Use a separate git worktree per agent (`git worktree add`). Never commit
  directly to `main`.
- Merge a branch only after the verification gate below passes. Resolve
  conflicts by keeping both sides' intent; shared hot spots are listed in
  section 6.
- **Never push or merge into `main` without the owner's explicit go-ahead.** The
  owner's orchestrating session may hold a standing go-ahead to fast-forward
  `main` and `git push origin main` after verified merges; if you were not told
  so, do not push. Never force-push. Never push other branches or tags.
- Commits are small and explain why. Agent commits end with the attribution
  trailers the session gives you (a `Co-Authored-By:` line plus a session link).
- Keep changes minimal: only what the task's acceptance criteria need. No
  speculative code, no unrelated refactors.

Specs first for non-trivial features: write or update a spec under `docs/specs/`
with numbered acceptance criteria (`AC-<area>-<n>`), build to it, and list in
your report which ACs are covered. Update `docs/README.md` (index), the root
`README.md` and `docs/DEPLOY.md` (env table) when you add user-visible behaviour
or configuration. Everything in the repo, code and docs, is in English.

Reports: finish every task with a report that names the branch, commits, what
was verified (commands and results), the files in shared hot spots, the
migration file name, owner to-dos and known limits. Be honest about anything
not verified (for example code paths that need a real Vercel project).

## 4. Verification gate

Run from your worktree. Every gate must pass before a merge.

```bash
pnpm lint && pnpm typecheck && pnpm test          # unit (30 s timeout per test)
pnpm test:integration                              # needs Postgres (docker compose up -d --wait)
pnpm build
pnpm test:e2e                                      # ~5 min on an idle machine; builds, own DB, real worker
pnpm problems:verify                               # only when problems/ or sandbox/ changed
pnpm db:export-sql --check && pnpm problems:export-sql --check
```

- After a schema change: `pnpm db:generate`, then `pnpm db:export-sql`; the
  freshness unit tests fail when `docs/supabase/*.sql` is stale. After changing
  `problems/`: `pnpm problems:export-sql`.
- Accessibility: axe must report 0 serious/critical issues on every new page;
  no horizontal scroll at 320-1440 px; keyboard operable; reduced motion
  respected; the CSP walk (`tests/e2e/security/csp.spec.ts`) must stay at zero
  violations, so add new pages to it.
- Look at new UI in screenshots (headless Chrome via Playwright) at 1440 and
  390 px and compare with the mockups in `docs/specs/**` before calling it done.
- Brand check: user-visible text must say LemmaYard. Search for the old name
  `leetcopy` (case-insensitive) and keep only the allowed internal names listed
  in section 2.
- Unit tests that need no DB, integration tests that use an isolated database
  per worktree (`leetcopy_test_<worktree>`), e2e that uses
  `leetcopy_e2e_<worktree>`; drop scratch databases you create.

Known traps:

- The machine may be heavily loaded when several agents run; wall-clock timing
  tests and room-page e2e specs then time out. Re-run the failing file alone
  before concluding anything.
- Docker sandbox containers are labelled with a namespace
  (`lemmayard.ns=<SANDBOX_NAMESPACE>`, default checkout dir + path hash). Cleanup
  and leftover checks filter by namespace; never remove other worktrees'
  containers. Never `pkill` by pattern; stop processes by PID or port.
- `.env` must come from `.env.example`. `AUTH_RATE_LIMITS=1` is needed by the
  auth rate-limit tests; most other suites do not care.
- `pnpm setup` without `run` is pnpm's built-in command; use `pnpm run setup`.
- The sandbox images must be rebuilt (`pnpm sandbox:build`) after changes in
  `sandbox/`.

## 5. Security rules for agents

- Never use the owner's (or anyone's) Vercel, Supabase or GitHub accounts, CLIs
  or MCP integrations. The owner deploys and configures his own services. Put
  exact steps for him into `docs/DEPLOY.md` instead.
- Never enter, paste, log or commit secrets (passwords, tokens, API keys,
  `AUTH_SECRET`, database URLs with passwords). `.env` is git-ignored.
- No network requests to leetcode.com or other third-party sites from app code or
  tests. No scraping.
- User code runs only inside the sandbox. Logs never contain user code, program
  output, passwords or user-written text.
- User-supplied HTML is never rendered. Markdown goes through the sanitising
  renderer (see the community spec). The CSP stays enforced; do not loosen it
  for a feature.
- Do not create accounts, deploy, purchase anything or change external service
  settings. Destructive actions (dropping data, force pushes, deleting
  branches you did not create) need the owner's explicit approval.

## 6. Hot spots and merge notes

- **Migrations**: several branches can add a migration at the same time. Number
  clashes are resolved at merge time by the orchestrator: renumber the file
  (`drizzle/NNNN_*.sql`), fix `drizzle/meta/_journal.json` and the snapshot
  chain, regenerate `docs/supabase/schema.sql` with `pnpm db:export-sql`, and
  run the DB integration tests. Verify the result by applying the SQL script to
  a scratch database and comparing it with `pnpm db:migrate`. Keep migrations
  additive, with RLS enabled on every new table (same pattern as 0002).
- Files that most often conflict: `src/server/env.ts` and `.env.example`,
  `docs/README.md` and `README.md` tables, `src/components/rooms/room-page-slots.tsx`
  and `room-tabs.tsx`, the room page `src/app/(site)/rooms/[roomId]/page.tsx`,
  the problem page, the header navigation, `tests/e2e/security/csp.spec.ts`,
  `pnpm-lock.yaml` (take either side, then `pnpm install`), `package.json`.
- Rooms: pure domain code in `src/lib/rooms/` (no DB/server imports); events
  written only by `appendRoomEvent` under the session advisory lock `rs:<id>`;
  lock order user -> room -> session. Scoring happens in `finalize()`. A result
  query budget test exists: do not add queries to the results path casually.
- Selectors used by e2e specs (`data-testid` such as `new-session`,
  `open-session-card`, `scoreboard`, `start-session`) are part of the contract;
  change them together with the specs.
- Problem numbers are unique; importers renumber carefully (`NUMBER_PARK_OFFSET`
  logic in `src/server/problems/importer.ts`); the SQL export mirrors it.

## 7. In flight (check `git worktree list`)

Agents were working in parallel on these branches (unmerged when this was
written):

- `feature/lang-java`: Java as a third submission language (sandbox image,
  harness, templates, editor, `solution.java` for the 20 oldest problems; a
  problem offers a language only if a verified reference solution exists).
- `feature/rooms-external-problems`: LeetCode problems in rooms. Room Settings
  has a "LeetCode problems" bank (slug + title + optional difficulty/rating);
  the lobby can add external slots; results are honor-system (participant marks
  solved, time is server time since start), marked as self-reported in the
  matrix, excluded from Elo; nothing is fetched from leetcode.com.
- `feature/community-c1`: community phase C1 (comments + votes + minimal
  moderation + legal pages), behind `COMMUNITY_ENABLED`; owns the markdown
  renderer, the DB-counted rate-limit helper and the roles/CLI.
- `feature/community-c2-plans`: study plans, behind `PLANS_ENABLED`.

When they merge, move the surviving facts into the README/specs and delete the
entries here.

## 8. Backlog (rough priority)

1. Finish and merge the in-flight branches; renumber migrations; re-run the full
   gate including e2e on an idle machine.
2. First real deployment checklist (owner actions, see `docs/DEPLOY.md`):
   Vercel env vars (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`,
   `JUDGE_EXECUTOR=vercel-sandbox`), run `schema.sql` then the problem SQL
   files in the Supabase SQL Editor, function region near the database, check
   `/api/health`. The Vercel Sandbox executor has never run against a real
   project: watch OIDC auth inside `after()`, VM start time and time limits.
3. Community: C3 interview-experience forum with "add to my study plan" (plan in
   `docs/specs/community.md`), C4 full moderation + notifications + data
   export/account deletion, C5 profiles/search/lesson comments/room discussion.
4. Review the 30 newer problems: some statements include algorithm hints in
   Notes (`smallest-task-order`, `best-hub-town`), large tests are smaller than
   the stated limits so quadratic solutions often pass, `ladder-word-routes`
   never exercises its modulo. Optionally link new problems from guide lessons.
5. Guide lessons 6-15 (more data-structure lessons in the style of the existing
   five in `src/content/learn/`, with visualisations and runnable code samples).
6. Features F1-F5 (`docs/specs/features-f1-f5.md`), one additive migration each.
7. More languages after Java (C++, Go, TypeScript): custom Vercel Sandbox images
   need `vercel vcr build` by the owner; measure start-up time first.
8. Rooms v2 leftovers: problem stats line ("solved by N% of M attempts"),
   "last rating change" next to ratings, lobby head "Planned for ..." from the
   schedule, "Open the lobby now" currently shown to every member.
9. Open-source setup (after the owner confirms): CONTRIBUTING with DCO,
   issue/PR templates, Claude Code Action workflow with a monthly budget cap,
   thumbs-up voting convention, labels. Drafts exist outside the repo; ask the
   owner for them or regenerate from `docs/specs/community.md` principles.
10. Housekeeping: rename the checkout directory `leet-copy` to `LemmaYard`,
    a nonce-based CSP, DB-backed
    rate limits for the auth routes (current limiter is in memory per instance),
    row-level policies if the app ever uses Supabase client access.

### Maintenance: refreshing the LeetCode catalog

When the owner wants newer contests (monthly is plenty): follow `src/server/leetcode/NOTICE.md` → "Refreshing the
catalog" (anonymous `git ls-remote` + download of zerotrac's `data.json` at a commit, then
`pnpm leetcode:catalog --input <path> --commit <sha>`, review the diff, `pnpm test`, commit `catalog.json` and
`NOTICE.md` on a branch). Never fetch anything from leetcode.com; never edit `catalog.json` by hand; tags and
overrides go into `overlay.json`.

## 9. How to brief a sub-agent

A good brief states: the goal in one paragraph, the files to read first
(`CLAUDE.md`, `AGENTS.md`, this file, the relevant spec), the branch name and
the "never push / never touch main" rule, the scope and explicit non-goals, the
owner decisions that override defaults, other agents working concurrently and
which files are shared, the verification commands and the brand check, the
security rules from section 5, and the report format from section 3. Agents
cannot see the conversation: anything not written down is lost.

## 10. Glossary

- **Slot**: one problem position in a room session (1-8).
- **Matrix / scoreboard**: participant x problem grid with times.
- **Draw modes**: how slots are filled (By rating, By difficulty, Manual).
- **Preset**: saved session settings of a room; **schedule**: weekly recurring
  session time of a room.
- **Executor**: the thing that runs a job in a sandbox (`worker/types.ts`).
- **Drain**: processing the submission queue inside a web function
  (`src/server/judge-runner.ts`) instead of a separate worker.
