# leetcopy

A LeetCode-style practice site: problem catalog, in-browser editor, and a judge
that runs Python and JavaScript solutions in a Docker sandbox. Local-only pet
project. See [PLAN.md](PLAN.md) for the full plan and milestones.

> Status: **M0 (scaffold)**. Only the app shell exists. Database, auth,
> problems, worker and sandbox scripts print `not implemented yet (Mx)` and
> exit with a non-zero code until their milestone lands.

## Requirements

- Node.js 22+
- pnpm (version pinned in `package.json` → `packageManager`; `corepack enable` picks it up)
- Docker (Docker Desktop or compatible) for Postgres and, later, the sandbox

## Run from scratch

```bash
pnpm install
cp .env.example .env          # then set AUTH_SECRET: openssl rand -base64 32
docker compose up -d --wait   # Postgres 16 on localhost:5433
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
| `lint`, `typecheck`, `test` (Vitest unit tests in `tests/unit`) | working |
| `db:generate`, `db:migrate`, `db:seed`, `problems:import`, `test:integration` | M1 |
| `worker`, `dev:all`, `problems:verify`, `sandbox:build`, `setup` | M4 |
| `test:e2e` | M7 |

## Configuration

All variables are listed in `.env.example` and validated with Zod in
`src/server/env.ts` (`getEnv()`); invalid or missing values fail with a list of
the offending variables.
