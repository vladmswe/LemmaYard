# LemmaYard — conventions for agents

Read `PLAN.md` in full before starting any milestone. It is the source of truth;
do only what the current milestone's acceptance criteria require.

@AGENTS.md

## Commands

```bash
pnpm run setup                # install + compose up + sandbox:build + db:seed
                              # (`pnpm setup` without `run` is pnpm's built-in!)
pnpm install
docker compose up -d --wait   # Postgres 16 on localhost:5433
pnpm db:seed                  # migrate + import problems/
pnpm dev                      # PORT from .env (default 3000)
pnpm worker                   # judge worker on the host; `pnpm dev:all` = web + worker
pnpm problems:verify          # all solutions × both languages must be accepted
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration         # needs Postgres; own DB leetcopy_test_<worktree>
pnpm problems:import [--prune]  # problems/ only; see note below
pnpm sandbox:build            # after any change in sandbox/ (Docker tests use the images)
```

`--prune` unpublishes every published problem not in `--dir` (pruned problems
keep their `number`). Never run it with `--dir` pointing anywhere but
`problems/` against the dev DB: it would unpublish the catalog.

Scripts for later milestones are stubs that exit non-zero with
`not implemented yet (Mx)`; replace the stub when you implement it.
Run `pnpm problems:verify` after changing anything in `problems/`.

## Structure

- `src/app` routes (App Router; pages in `(site)/` = header + footer, the
  full-height problem page in `(workspace)/`), `src/components` UI (`ui/` = shadcn/ui),
  `src/lib` shared code, `src/server` server-only code (`env.ts` = Zod env).
- `drizzle/` migrations, `problems/<slug>/` problem files, `sandbox/` images
  and harnesses, `worker/` judge worker, `scripts/` CLI scripts,
  `tests/{unit,integration,e2e,helpers}`.
- DB: Drizzle + `pg`, schema `src/server/db/schema.ts`, client `getDb()` in
  `src/server/db/index.ts`. Value types/validator: `src/lib/types`; problem
  file schemas: `src/lib/problems`; starter templates: `src/lib/templates`.
- Integration tests use `tests/helpers/db.ts` (factories, `resetTestDb()`);
  Docker sandbox tests use `tests/helpers/sandbox.ts`.
- Auth: `src/server/auth/`. `getCurrentUser()` / `requireUser(nextPath)` from
  `session.ts` are the only way to read the session (no middleware/proxy).
  Every mutating route handler starts with `assertSameOrigin(request)` and
  reads its body with `readJsonBody()` (`src/server/http/request.ts`).
  Redirect targets from `?next=` go through `safeRedirectPath()`.
- Judge: executor contract `worker/types.ts`, comparator + verdicts
  `worker/judge.ts`, Docker runner `worker/docker-executor.ts`, harnesses
  `sandbox/harness.{py,js}`. Queue SQL and job/result mapping
  `worker/queue.ts`, slots + sweep `worker/loop.ts`, process `worker/index.ts`.
  Finalize only `WHERE status='running'`; never requeue; worker logs never
  contain user code or stdout.
- Import alias `@/` → `src/`.

## Rules

- UI must follow DESIGN.md (tokens, components, motion, accessibility).
- DB schema changes only in M1. Later milestones must not change the schema.
- User code runs only inside the Docker sandbox, always, including in tests.
  Authored guide code samples in `src/content/learn/**/code/` are trusted repo code and may run on the host in unit tests; the Docker-only rule applies to untrusted user submissions.
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
