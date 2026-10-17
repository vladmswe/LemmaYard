# leetcopy — conventions for agents

Read `PLAN.md` in full before starting any milestone. It is the source of truth;
do only what the current milestone's acceptance criteria require.

@AGENTS.md

## Commands

```bash
pnpm install
docker compose up -d --wait   # Postgres 16 on localhost:5433
pnpm db:seed                  # migrate + import problems/
pnpm dev                      # PORT from .env (default 3000)
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration         # needs Postgres; own DB leetcopy_test_<worktree>
pnpm problems:import --dir tests/fixtures/problems [--prune]
```

Scripts for later milestones are stubs that exit non-zero with
`not implemented yet (Mx)`; replace the stub when you implement it.

## Structure

- `src/app` routes (App Router), `src/components` UI (`ui/` = shadcn/ui),
  `src/lib` shared code, `src/server` server-only code (`env.ts` = Zod env).
- `drizzle/` migrations, `problems/<slug>/` problem files, `sandbox/` images
  and harnesses, `worker/` judge worker, `scripts/` CLI scripts,
  `tests/{unit,integration,e2e,helpers}`.
- DB: Drizzle + `pg`, schema `src/server/db/schema.ts`, client `getDb()` in
  `src/server/db/index.ts`. Value types/validator: `src/lib/types`; problem
  file schemas: `src/lib/problems`; starter templates: `src/lib/templates`.
- Integration tests use `tests/helpers/db.ts` (factories, `resetTestDb()`).
- Import alias `@/` → `src/`.

## Rules

- DB schema changes only in M1. Later milestones must not change the schema.
- User code runs only inside the Docker sandbox, always, including in tests.
- Zod validation on every boundary (env, request bodies, problem files, worker
  input/output). SQL only through Drizzle.
- No shell execution: use `execFile` / `spawn` with an argument array, never
  `exec` or shell strings. No env passed into sandbox containers.
- Read env only through `getEnv()` from `src/server/env.ts`; add new variables
  there and to `.env.example`.
- Next.js is newer than most training data: check `node_modules/next/dist/docs/`
  before using an API.
- Git: one branch per milestone, `feature/<m#-name>` (e.g. `feature/m1-db`).
  No direct commits to `main` after the scaffold commit. Never merge or push
  without the owner's explicit go-ahead.
