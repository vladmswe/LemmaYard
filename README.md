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
> editor still show placeholder pages, and `test:e2e` prints
> `not implemented yet (M7)`, until their milestone lands.

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
| `test:e2e` | M7 |

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
docker compose). At start it removes orphaned sandbox containers (label
`lemmayard.sandbox=1`) and checks both images, exiting non-zero with a clear
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

Docker integration tests (`tests/integration/sandbox-*.test.ts`) need Docker and
`pnpm sandbox:build`; they run with `pnpm test:integration` (whose global setup
also needs Postgres) and do not touch the database.

Known, accepted property: user code can read the **inputs** of hidden tests inside
the container (never the expected outputs). The per-run frame nonce only stops
accidental or naive forging; code in the same process can find it, which is harmless
because verdicts are computed on the host against expected values the container
never sees.

## Configuration

All variables are listed in `.env.example` and validated with Zod in
`src/server/env.ts` (`getEnv()`); invalid or missing values fail with a list of
the offending variables.
