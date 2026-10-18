# LemmaYard

LemmaYard is a practice platform for algorithms and data structures: problems,
an in-browser editor, a sandboxed judge in Python and JavaScript, and guided
learning. Local-only pet project. See [PLAN.md](PLAN.md) for the full plan and
milestones.

> Naming: the project was renamed from its working title to LemmaYard. The
> Postgres user, password and database names in `docker-compose.yml` and
> `.env.example`, and the test-database prefix, still use the old name
> (`leetcopy`, `leetcopy_test_<suffix>`; brand-rename: keep). They are internal
> database names, kept so existing local volumes keep working; they can be
> renamed together with a fresh Postgres volume.

> Status: **M2 (authentication)** and **M4 (judge: sandbox, executor, queue,
> worker)** on top of M1 (database, types, problem pipeline). The catalog and
> editor still show placeholder pages until their milestone lands.

## Requirements

- Node.js 22+
- pnpm (version pinned in `package.json` → `packageManager`; `corepack enable` picks it up)
- Docker (Docker Desktop or compatible) for Postgres and the judge sandbox

## Run from scratch

```bash
cp .env.example .env          # then set AUTH_SECRET: openssl rand -base64 32
pnpm run setup                # install + Postgres + sandbox images + migrate/seed
pnpm dev:all                  # web (http://localhost:3000 or PORT) + judge worker
```

`pnpm run setup` is `pnpm install && docker compose up -d --wait && pnpm
sandbox:build && pnpm db:seed`. Type `run`: a bare `pnpm setup` is pnpm's own
built-in command (it sets up pnpm's home directory), not this script. The same
steps by hand:

```bash
pnpm install
docker compose up -d --wait   # Postgres 16 on localhost:5433
pnpm sandbox:build            # Python and Node sandbox images
pnpm db:seed                  # apply migrations + import problems/
pnpm dev                      # web only; `pnpm worker` in a second terminal
```

Stop the database with `docker compose down` (add `-v` to delete its data).

`pnpm dev` / `pnpm start` / `pnpm build` go through `scripts/next.mjs`, which
loads `.env` before starting Next.js so that `PORT` from `.env` is honored.
Variables already set in the shell win over `.env`.

## Scripts

| Script | Status |
|---|---|
| `dev`, `build`, `start` | working |
| `lint`, `typecheck`, `test` (Vitest unit tests in `tests/unit`, no DB) | working |
| `db:generate` (drizzle-kit, after editing `src/server/db/schema.ts`), `db:migrate`, `db:seed` | working |
| `problems:import [--dir <path>] [--prune]` | working |
| `test:integration` (Vitest, `tests/integration`, needs Postgres) | working |
| `sandbox:build` (builds both sandbox images; rerun after changing `sandbox/`) | working |
| `worker` (judge worker on the host), `dev:all` (web + worker via `concurrently`) | working |
| `problems:verify [--dir <path>] [--only <slug>]... [--concurrency <n>]` | working |
| `setup` (run it as `pnpm run setup`, see above) | working |
| `test:e2e`, `test:e2e:judge-off`, `test:e2e:guide`, `test:e2e:headed` (Playwright, see End-to-end tests) | working |

### Problems

Each problem is a directory `problems/<slug>/` with `meta.json`,
`description.md`, `tests.json`, `solution.py` and `solution.js` (format: PLAN.md
section 5; Zod schemas in `src/lib/problems/schema.ts`). `pnpm problems:import`
validates every problem first and writes nothing if any of them is invalid; then
it upserts by slug in one transaction (tags created, test cases replaced,
`published=true`). `--prune` unpublishes published problems that are not in
the imported directory; pruned problems keep their row and their `number`, so
that number stays taken. `--dir` imports another directory; never combine
`--dir <other>` with `--prune` against the dev database (`DATABASE_URL`): it
would unpublish the whole `problems/` catalog. Fixtures belong in the test
database (integration tests import them there).

### Integration tests

`pnpm test:integration` creates (if missing) and migrates its own database
`leetcopy_test_<suffix>` on the `TEST_DATABASE_URL` server. The suffix is
`TEST_DB_SUFFIX` or, by default, the git worktree directory name, so parallel
worktrees never share a test database. Tables are truncated between tests.
Helpers and factories: `tests/helpers/db.ts`.

### End-to-end tests

Playwright runs against a production build, an isolated database and the real
judge worker; the dev database from `.env` is never touched. Needs Postgres,
Docker and the sandbox images (`pnpm sandbox:build`).

| Command | What | Time (this machine) |
|---|---|---|
| `pnpm test:e2e` | every spec in `tests/e2e` incl. the judged ones (`@judge`) | ~3–3.5 min |
| `pnpm test:e2e:judge-off` | `tests/e2e-judge-off` with `JUDGE_ENABLED=0`, no worker | ~20 s |
| `pnpm test:e2e:guide` | `tests/e2e/guide` only, without the worker (`E2E_JUDGE=0`) | ~2.5 min |
| `pnpm test:e2e:headed` | `test:e2e` with visible browsers | |

Each run (global setup in `tests/e2e-support/harness.ts`): drops and recreates
`leetcopy_e2e_<suffix>` (`_off` for judge-off; suffix as for integration
tests) on the `TEST_DATABASE_URL` server, migrates it and imports `problems/`;
runs `pnpm build`; starts `next start` on `E2E_PORT` and, for the main suite,
`tsx worker/index.ts` (poll 100 ms, sandbox namespace `<default>-e2e`); waits
for `/api/health` and the worker's "worker started" line. Afterwards it stops
both by PID, removes leftover containers of its namespace and drops the
database. Server and worker logs: `node_modules/.cache/e2e/`. A busy port, a
missing Docker or a missing sandbox image fails the run at once.

| Variable | Default | Effect |
|---|---|---|
| `E2E_PORT` | `PORT` + 1177 (3000 → 4177) | main suite port; judge-off uses `E2E_PORT` + 1 |
| `E2E_SKIP_BUILD=1` | build | serve the existing `.next` build (e.g. judge-off right after `test:e2e`) |
| `E2E_JUDGE=0` | judge on | no worker; `@judge` specs are skipped |
| `E2E_REUSE_SERVER=1` | off | use a server already on `E2E_PORT` (no DB reset, build or worker; it must use the e2e database) |
| `E2E_KEEP_DB=1` | drop | keep the e2e database after the run for inspection |
| `E2E_WORKERS` | 2 | Playwright workers (the `judge` project is capped at 2) |
| `E2E_WORKER_CONCURRENCY`, `E2E_WORKER_POLL_MS` | 2, 100 | judge worker slots and poll interval |

Specs that read or write rows directly use `e2eDatabaseUrl()`
(`tests/e2e-support/db.ts`), which refuses any database but `leetcopy_e2e_*`.
The judged flows (sign up → Two Sum in Python and JavaScript → Run → Submit →
Accepted → profile; Wrong Answer; compile and runtime errors; history) are in
`tests/e2e/flows/`; code goes into Monaco as a synthetic paste
(`tests/e2e-support/workspace.ts`), since `keyboard.insertText` is auto-indented.

### Authentication

Email + password accounts (`/register`, `/login`). Passwords are hashed with
argon2id (`@node-rs/argon2`); the session is an HS256 JWT signed with
`AUTH_SECRET` in the httpOnly cookie `lemmayard_session` (`SameSite=Lax`,
`Secure` in production, 7 days). The user row is re-read from the database on
every request, so a token of a deleted user means "guest". Logout only clears
the cookie (tokens are stateless). Mutating API routes require
`Content-Type: application/json` and, when an `Origin` header is sent, the
origin of `AUTH_URL` (otherwise 403), so set `AUTH_URL` to the URL you open in
the browser.

### Judge sandbox

User code runs only in Docker, one fresh container per job (`worker/docker-executor.ts`,
protocol in PLAN.md section 5): images `sandbox/Dockerfile.python` / `Dockerfile.node`
with the runner baked in at `/sandbox/`, no bind mounts, no environment passed in,
`--network none --read-only --cap-drop ALL --pids-limit 64`, user 65534, memory and
wall-clock limits. The runner gets inputs only; `worker/judge.ts` compares results
with the expected values on the host. The executor contract (`Executor`, `ExecJob`,
`ExecResult`) is in `worker/types.ts`.

User-controlled text in a result (printed output, error messages, returned
values) is stored with U+0000 and unpaired surrogates replaced by U+FFFD
(Postgres `text`/`jsonb` cannot hold them), after the comparison; returned
values nested deeper than 64 levels are stored as `"[nested too deep]"`.

`pnpm problems:verify` is the quality gate for problem data: it runs every
problem's `solution.py` and `solution.js` through the real executor on all of its
tests (no stop at the first failure, the problem's own limits), prints a table
problem × language × verdict × time and exits non-zero with the failing cases
unless every run is `accepted`. It needs Docker and the images, not the database,
and never removes containers (safe while a worker is running).

### Worker

`pnpm worker` runs on the host (it needs the Docker CLI; it is not part of
docker compose). At start it removes orphaned sandbox containers of its own
namespace (labels `lemmayard.sandbox=1` and `lemmayard.ns=<SANDBOX_NAMESPACE>`;
the namespace defaults to the checkout's directory name plus a hash of its
path, so workers of other worktrees and runs keep their containers) and checks both images, exiting non-zero with a clear
message if Docker or an image is missing. It then runs `WORKER_CONCURRENCY`
slots that poll every `WORKER_POLL_MS` and claim the oldest `queued`
submission atomically (`UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED
LIMIT 1)`), judge it in Docker and write the result only while the row is still
`running`. A sweep at start and every 30 s marks `running` rows older than
`STALE_RUNNING_MIN` minutes as `internal_error` ("worker crashed or timed out";
never requeued) and deletes `kind=run` rows older than 24 h. A failure while
processing one submission makes it `internal_error`; the worker keeps going.
Logs are JSON lines (submission id, kind, language, verdict, duration), never
user code or output. SIGINT/SIGTERM: stop claiming, wait up to 10 s for running
jobs, then mark the rest `internal_error` and remove this worker's containers
(label `lemmayard.worker=<id>`); a second signal skips the wait. Code:
`worker/index.ts` (process), `worker/loop.ts` (slots, sweep timer),
`worker/queue.ts` (SQL and job/result mapping).

Containers created before the namespace label existed (no `lemmayard.ns`) are
never removed automatically. One-time cleanup, with no worker or
`problems:verify` running anywhere on the machine:
`docker ps -aq --filter label=lemmayard.sandbox=1 | xargs docker rm -f`.
List containers per namespace with
`docker ps -a --filter label=lemmayard.sandbox=1 --format '{{.ID}} {{.Label "lemmayard.ns"}}'`.

### Run / Submit API

`POST /api/problems/:slug/run` (`{language, code, customInput?}`) and
`/submit` (`{language, code}`) answer `202 {id}`; `GET /api/submissions/:id`
returns the submission DTO to its owner (404 for anyone else). Handlers:
`src/server/submissions/` (checks in the PLAN section 6 order; the
active-submission cap and the per-minute rates are counted and the row is
inserted in one transaction under `pg_advisory_xact_lock(hashtext(user_id))`;
429 carries `Retry-After`). Types shared with the UI: `src/lib/submission-dto.ts`;
browser client with polling: `src/lib/submission-client.ts`. The polling
timeouts (`QUEUED_TIMEOUT_MS`, `WALL_CAP_MS` + 30 s) reach the client as a prop:
a server component calls `getPollingConfig()` (`src/server/submissions/config.ts`)
and passes the result to `pollSubmission()`.

**Judge disabled mode.** `JUDGE_ENABLED` (`0`/`1`) switches code execution off
for deployments without a worker; unset, it is on everywhere except on Vercel
(`VERCEL` set). When off, Run / Submit (also with `roomSessionId`) and room
session start answer `503 {"error": …, "code": "judge_disabled"}` right after
the Origin and session checks, before rate limits or any row; the problem page
disables Run / Submit with a note (editing and drafts still work) and the room
lobby disables Start. `GET /api/health` reports `"judge": "enabled"|"disabled"`.
Local dev and the worker are unaffected. Code: `src/server/judge.ts`,
`isJudgeEnabled()` in `src/server/env.ts`, copy in `src/lib/judge-availability.ts`.

Docker integration tests (`tests/integration/sandbox-*.test.ts`) need Docker and
`pnpm sandbox:build`; they run with `pnpm test:integration` (whose global setup
also needs Postgres) and do not touch the database.

### Submission history and profile

`/submissions` lists the signed-in user's **submit** rows (never runs), newest
first, `PAGE_SIZE` per page, `?page=` and `?problem=<slug>` in the URL (an
unknown slug shows an empty state). `/submissions/[id]` shows one of the
user's own submits with the code in a read-only Monaco; another user's id, a
Run id (including the console's "Taking longer than expected" link after a
Run), an unknown and a malformed id all give the same 404. "Submit again"
writes the submission's code into the problem's local editor draft for that
language and opens the problem. The problem page's Submissions tab shows the
latest 20 submits for that problem and is re-rendered by the `router.refresh()`
after each finished Submit. Queries: `src/server/submissions/history.ts`.

`/u/[username]` is public: solved problems by difficulty against the published
totals, submissions, acceptance and the 10 most recently solved problems
(date of the first accepted submit), never code. The counting rules are in
`summarizeUserStats` (`src/lib/progress.ts`): only submits on published
problems count, a problem is solved once however many accepted submits it
has, and `internal_error` / `queued` / `running` are left out of both the
submission count and acceptance. The landing progress card uses the same
helper (`getUserStats`, `src/server/progress.ts`). Browser test (inserts
finished rows into `DATABASE_URL`, no judge needed):
`pnpm exec playwright test tests/e2e/history`.

### Rooms (in progress)

Private friend rooms with timed sessions, spec `docs/specs/rooms.md`. Tables
`rooms`, `room_members`, `room_sessions`, `room_session_problems`,
`room_session_participants`, `room_session_results`, `room_events` and the
nullable `submissions.room_session_id` come from migration `0003_rooms`. The
selection, scoring, invite, state-machine and event logic is pure TypeScript in
`src/lib/rooms/`; the membership gate is `src/server/rooms/access.ts`.

Rooms, invites and membership (R2): pages `/rooms`, `/rooms/[roomId]` and
`/rooms/join`, API under `/api/rooms/**` (handlers in
`src/server/rooms/membership.ts`). Invite links are `/rooms/join#<token>`: the
token lives in the URL fragment, is sent only in POST bodies, and only its
sha256 is stored; it is shown to the owner once. Join and rotation limits are
in-process (`src/server/http/rate-limit.ts`, per instance), room creation is
counted in the DB. E2E: `pnpm exec playwright test tests/e2e/rooms` (users
`*@example.test`).

Sessions (R3, backend only; the session screens are R4, history R5): API under
`/api/rooms/[roomId]/sessions/**` (handlers in `src/server/rooms/sessions.ts`
and `state.ts`). A session goes lobby → live → finished (or lobby →
cancelled); the lobby draw uses the pure selection core with inputs from
`src/server/rooms/draw.ts`. Expiry (`ends_at`) and stale lobbies (7 days) are
closed lazily by any request that touches the session and by the worker's
periodic sweep. A Submit counts for a session only with an explicit
`roomSessionId` (validated in `src/server/rooms/submit-context.ts`, re-checked
inside the insert transaction). `finalize()` in `worker/queue.ts` applies the
session outcome (`src/server/rooms/outcome.ts`) in the same transaction under
the session's advisory lock, so every executor must finalize through it. The
live UI polls `GET …/sessions/[sessionId]/state?after=<cursor>` through
`createPollingEventSource()` (`src/lib/rooms/event-source.ts`).

History (R5): the room page's Sessions tab lists finished and cancelled
sessions (`?page=`, 20 per page) and the Leaderboard tab ranks members over
`?range=4w|3m|all` with the room's difficulty profile. Results of a finished
session are at `/rooms/[roomId]/sessions/[sessionId]/results` (lobby/live
redirect to the session screen), accepted code at
`…/solutions/[username]/[position]` (and
`GET /api/rooms/[roomId]/sessions/[sessionId]/solutions/[userId]/[position]`),
a member's timeline at `/rooms/[roomId]/members/[username]`. Code is shown only
after the session finished, to members, when the room shares solutions and the
author has not opted out (authors always see their own). Reads are in
`src/server/rooms/{history,results}.ts`, pure helpers in
`src/lib/rooms/history.ts`. E2E: `pnpm exec playwright test tests/e2e/rooms`.

Live UI (R4): the session screen `/rooms/[roomId]/sessions/[sessionId]` shows
the lobby (host settings, calibration panel, draw/re-roll/pin, join, start),
the live screen (server-synced countdown, problem cards, scoreboard, Activity
feed) and the finished/cancelled states; the room page shows the open session
card. On a problem page a session banner appears for `?session=<id>` (or,
automatically, for a live session the viewer has joined that contains the
problem); while it is shown, Submit (never Run) sends `roomSessionId` and the
console says the submission counts. Other people's events toast there;
notification prefs (pop-ups, sound, failed attempts, browser notifications
opted in by a click) live in `localStorage` under
`lemmayard:room-notifications:v1`. Notifications work only while the tab is
open; on iPhone/iPad system notifications need the site added to the Home
Screen. Data reads: `src/server/rooms/session-page.ts`. The e2e
`tests/e2e/rooms/live-session.spec.ts` submits the problem's reference
solution and is judged by the real worker of the e2e harness (`@judge`).

Known, accepted property: user code can read the **inputs** of hidden tests inside
the container (never the expected outputs). The per-run frame nonce only stops
accidental or naive forging; code in the same process can find it, which is harmless
because verdicts are computed on the host against expected values the container
never sees.

### Learn (Data Structures guide)

Routes: `/learn` (roadmap), `/learn/<slug>` (lesson), `/learn/glossary`. Each
lesson lives in its own folder `src/content/learn/<slug>/`: `lesson.mdx` (prose
plus the components `Viz`, `CodeTabs`, `Quiz`, `ComplexityTable`, `Callout`,
`PracticeLinks`, `Term`), `meta.ts` (title, summary, track, order,
prerequisites, practice problems, `status`), `quiz.ts`, `complexity.ts`,
`glossary.ts` and `code/<name>.py|.js|.cases.json`. The registry
`src/content/learn/index.ts` imports every lesson statically. A lesson is
hidden from the roadmap, prev/next and the glossary (and is `noindex`) until its
`meta.ts` says `status: "published"`. The pipeline fixture lesson
(`src/content/learn/_fixture/`) renders at `/learn/dev-fixtures/lesson` only with
`GUIDE_FIXTURES=1`.

Code samples mark the lines a player highlights with `# @line some.id`
(Python) or `// @line some.id` (JS) at the end of a line; the markers are
stripped and the listing is highlighted with Shiki on the server.
`tests/unit/guide/content/code-samples.test.ts` runs every `*.cases.json`
against both listings on the host through `tests/helpers/guide/driver.{py,mjs}`,
so `pnpm test` needs `python3` >= 3.10 (it fails, not skips, without it).
`lesson-files.test.ts` checks folders, metadata, headings, word counts and
component references. Progress (visited, quiz answers, completion) stays in the
browser's localStorage (`lemmayard.learn.progress.v1`). Browser tests:
`pnpm test:e2e:guide`.

### Design system

The UI follows `DESIGN.md` (design v2 "Proof": Instrument Serif / Instrument
Sans / JetBrains Mono, cobalt and night blocks, the ∎ tombstone, proof
gutters and test squares). Tokens for both themes live in
`src/app/globals.css`; `tests/unit/contrast.test.ts` checks every text and UI
pair of both themes and the Monaco colours. The site is dark only for now:
`THEME_TOGGLE_ENABLED` in `src/lib/theme-config.ts` brings back the
light/dark/system toggle. Browser checks of the landing, auth and 404 pages
(axe, overflow, forced theme, reduced motion, focus):
`pnpm exec playwright test tests/e2e/site`.

## Configuration

All variables are listed in `.env.example` and validated with Zod in
`src/server/env.ts` (`getEnv()`); invalid or missing values fail with a list of
the offending variables.

## Security

**Response headers** (`src/server/http/security-headers.ts`, applied to every
route by `headers()` in `next.config.ts`; tests
`tests/unit/security-headers.test.ts` and `tests/e2e/security/csp.spec.ts`):

| Header | Value |
| --- | --- |
| `Content-Security-Policy` (enforced) | `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:` (`next dev` adds `'unsafe-eval'` to `script-src`) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin`; `no-referrer` on `/rooms/join` (invite token) |
| `Permissions-Policy` | camera, microphone, geolocation, payment, USB, serial, HID, MIDI, sensors, display capture, WebAuthn get and Topics disabled. Notifications (rooms), clipboard and autoplay stay allowed. |
| `Cross-Origin-Opener-Policy` | `same-origin` |

`script-src 'unsafe-inline'` is needed because the App Router streams inline
bootstrap scripts into every page and the app has no nonces yet. Everything
else is same-origin: fonts are self-hosted by `next/font`, Monaco and its
editor worker are bundled. Zod runs `jitless` in the browser
(`src/instrumentation-client.ts`), otherwise its `Function("")` probe is
reported as a CSP violation. `tests/e2e/security/csp.spec.ts` walks landing,
login/register, 404, catalog, the problem page (typing in Monaco, editor
worker), submissions, profile, guide index and a lesson with a player, rooms
list/room/lobby/live/results, and fails on any `securitypolicyviolation`
event or CSP console error. HSTS is added by Vercel on its domains.

**Login and registration limits** (`src/server/auth/rate-limit.ts`), checked
after body validation and before the DB lookup and argon2:

| Route | Limit | Counts |
| --- | --- | --- |
| `POST /api/auth/login` | 10 per 15 min per client address + email; 30 per 15 min per address | failed logins only (unknown email and wrong password alike) |
| `POST /api/auth/register` | 3 per hour per address + email; 5 per hour per address | every valid attempt, a 409 included |

Over the limit: `429` with `Retry-After` (seconds) and a generic message, the
same for existing and unknown emails. The address is the first
`X-Forwarded-For` hop (on Vercel set by the platform), else `X-Real-IP`, else
one shared bucket. **Limitation:** the counters are in memory per server
instance (like the rooms join/rotate limits), so several Vercel instances
multiply the limits and a cold start resets them; outside Vercel a client can
spoof `X-Forwarded-For`. At most 2 argon2 computations run at once per
process (a semaphore in `src/server/auth/password.ts`), so a flood queues
instead of exhausting CPU, memory and libuv's thread pool.
`AUTH_RATE_LIMITS=0` turns the limits off for local Playwright runs (many
registrations from one address); it is rejected on Vercel.

**Accounts and sessions.** argon2id with 19 MiB memory, 2 iterations, 1 lane
(OWASP); passwords 8–128 characters; a login for an unknown email verifies a
dummy hash so timing does not reveal registered emails. Session: HS256 JWT in
the `lemmayard_session` cookie, `HttpOnly`, `SameSite=Lax`, `Secure` in
production, 7 days, user re-read on every request. Mutating routes check
`Content-Type: application/json` and `Origin` against `AUTH_URL`.
`AUTH_SECRET` must be at least 32 characters; in production (on Vercel, or
`NODE_ENV=production` with a non-localhost `AUTH_URL`) the `.env.example`
placeholder, anything containing "change-me" and values with fewer than 12
distinct characters are rejected (the error names the variable, never the
value).

**Database.** Row level security is enabled without policies on every table
(migrations `0002_enable_rls`, `0003_rooms`), so Supabase's REST roles see
nothing; the app connects as the table owner. SQL only through Drizzle.

**Logs.** User code, program output and passwords are never logged
(AC-M7-4): `tests/integration/no-secrets-in-logs.test.ts` runs the auth and
run/submit handlers and the worker with a marker in the password and code and
checks every console/stdout/stderr line; `tests/unit/no-sensitive-logging.test.ts`
checks the arguments of every logging call. Database failures in those
handlers are logged with the driver's message only (Drizzle's own message
contains the SQL parameters) and answered with 500.

**Accepted properties.** Sandbox: see "Rooms" above (user code can read the
inputs of hidden tests; the frame nonce only stops naive forging). Register
answers 409 "already registered", which reveals that an email has an account
(rate-limited, see above).

**Dependency audit** (2026-10-18, `pnpm audit --prod` and `pnpm audit`):
`shadcn` moved to `devDependencies` (only the build reads its CSS), which
removes the high `braces` finding from the production tree. Remaining
findings, accepted:

| Package | Severity | Path | Why accepted |
| --- | --- | --- | --- |
| `dompurify` 3.4.15 (2 advisories, fixed in 3.4.16) | low | `monaco-editor` | prod tree. Monaco ships its own copy inside its ESM build (`esm/vs/base/browser/dompurify/`), so a `pnpm.overrides` entry would change only the unused npm package, not the bundled code; Monaco sanitizes only its own hover/markdown content (no user HTML) and does not use `IN_PLACE`. Re-check on the next Monaco release. |
| `braces` ≤ 3.0.3 (no patched release) | high | `shadcn` CLI, `eslint-config-next` (dev only) | build/lint tools, never in the deployed functions and never fed untrusted patterns; no fixed version exists to override to. |
| `esbuild` < 0.25 | moderate | `drizzle-kit` (dev only) | concerns esbuild's dev server, which is never started; `drizzle-kit` runs only from the developer machine. |

**Reporting a vulnerability.** Contact: _to be added before publishing_
(until then, contact the repository owner privately; do not open a public
issue).

**Not covered yet:** DB-backed (cross-instance) rate limits (need a
migration), a nonce-based CSP without `'unsafe-inline'`, MFA, email
verification and password reset, account lockout notifications, CSP violation
reporting (`report-to`).
