# leetcopy

A LeetCode-style practice site: problem catalog, in-browser editor, and a judge
that runs Python and JavaScript solutions in a Docker sandbox. Local-only pet
project. See [PLAN.md](PLAN.md) for the full plan and milestones.

> Status: **M1 (database, types, problem pipeline)**. Auth, UI, worker and
> sandbox scripts still print `not implemented yet (Mx)` and exit non-zero
> until their milestone lands.

## Requirements

- Node.js 22+
- pnpm (version pinned in `package.json` → `packageManager`; `corepack enable` picks it up)
- Docker (Docker Desktop or compatible) for Postgres and, later, the sandbox

## Run from scratch

```bash
pnpm install
cp .env.example .env          # then set AUTH_SECRET: openssl rand -base64 32
docker compose up -d --wait   # Postgres 16 on localhost:5433
pnpm db:seed                  # apply migrations + import problems/
pnpm dev                      # http://localhost:3000 (or PORT from .env)
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
| `worker`, `dev:all`, `problems:verify`, `setup` | M4 |
| `test:e2e` | M7 |

### Problems

Each problem is a directory `problems/<slug>/` with `meta.json`,
`description.md`, `tests.json`, `solution.py` and `solution.js` (format: PLAN.md
section 5; Zod schemas in `src/lib/problems/schema.ts`). `pnpm problems:import`
validates every problem first and writes nothing if any of them is invalid; then
it upserts by slug in one transaction (tags created, test cases replaced,
`published=true`). `--prune` unpublishes problems whose directory is gone.
`--dir` imports another directory, e.g. `tests/fixtures/problems`.

### Integration tests

`pnpm test:integration` creates (if missing) and migrates its own database
`leetcopy_test_<suffix>` on the `TEST_DATABASE_URL` server. The suffix is
`TEST_DB_SUFFIX` or, by default, the git worktree directory name, so parallel
worktrees never share a test database. Tables are truncated between tests.
Helpers and factories: `tests/helpers/db.ts`.

### Judge sandbox

User code runs only in Docker, one fresh container per job (`worker/docker-executor.ts`,
protocol in PLAN.md section 5): images `sandbox/Dockerfile.python` / `Dockerfile.node`
with the runner baked in at `/sandbox/`, no bind mounts, no environment passed in,
`--network none --read-only --cap-drop ALL --pids-limit 64`, user 65534, memory and
wall-clock limits. The runner gets inputs only; `worker/judge.ts` compares results
with the expected values on the host. The executor contract (`Executor`, `ExecJob`,
`ExecResult`) is in `worker/types.ts`.

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
