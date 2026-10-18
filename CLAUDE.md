# LemmaYard — conventions for agents

Read `docs/AGENT-HANDOFF.md` first (current state, owner decisions, workflow,
verification gate, backlog), then `PLAN.md` before starting any milestone or feature. It is the
source of truth (with the specs in `docs/specs/`); do only what the current
task's acceptance criteria require. `README.md` describes the architecture,
the problem format and the language contract.

@AGENTS.md

## Commands

```bash
pnpm run setup                # install + compose up + sandbox:build + db:seed
                              # (`pnpm setup` without `run` is pnpm's built-in!)
pnpm install
docker compose up -d --wait   # Postgres 16 on localhost:5433
pnpm sandbox:build            # after any change in sandbox/ (Docker tests use the images)
pnpm db:seed                  # migrate + import problems/
pnpm dev                      # PORT from .env (default 3000)
pnpm worker                   # judge worker on the host; `pnpm dev:all` = web + worker
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration         # needs Postgres (+ Docker); own DB leetcopy_test_<worktree>
pnpm test:e2e                 # build + own DB leetcopy_e2e_<worktree> + web + worker (Docker)
pnpm test:e2e:judge-off       # JUDGE_ENABLED=0 suite; E2E_SKIP_BUILD=1 reuses .next
pnpm test:e2e:guide           # guide specs only, no worker
pnpm problems:verify          # all solutions × both languages must be accepted
pnpm problems:import [--prune]  # problems/ only; see note below
pnpm db:generate && pnpm db:export-sql  # after a schema change: migration + docs/supabase/schema.sql
```

`--prune` unpublishes every published problem not in `--dir` (pruned problems
keep their `number`). Never run it with `--dir` pointing anywhere but
`problems/` against the dev DB: it would unpublish the catalog.
Run `pnpm problems:verify` after changing anything in `problems/`.

## Structure

- `src/app` routes (App Router; pages in `(site)/` = header + footer, the
  full-height problem page in `(workspace)/`), `src/components` UI (`ui/` = shadcn/ui),
  `src/lib` shared code, `src/server` server-only code (`env.ts` = Zod env).
- `drizzle/` migrations, `problems/<slug>/` problem files, `sandbox/` images
  and harnesses, `worker/` judge worker, `scripts/` CLI scripts,
  `src/content/learn/` guide lessons, `docs/` deploy guide, specs, generated
  Supabase SQL. Tests: `tests/{unit,integration,e2e,e2e-judge-off}`, shared
  code in `tests/helpers` (Vitest) and `tests/e2e-support` (Playwright harness;
  e2e specs reach the DB only through `e2eDatabaseUrl()`).
- DB: Drizzle + `pg`, schema `src/server/db/schema.ts`, client `getDb()` in
  `src/server/db/index.ts`. Value types/validator: `src/lib/types`; problem
  file schemas: `src/lib/problems`; starter templates: `src/lib/templates`.
- Integration tests use `tests/helpers/db.ts` (factories, `resetTestDb()`);
  Docker sandbox tests use `tests/helpers/sandbox.ts`.
- Auth: `src/server/auth/`. `getCurrentUser()` / `requireUser(nextPath)` from
  `session.ts` are the only way to read the session (no middleware/proxy;
  `src/proxy.ts` only turns malformed `%` escapes in the path into a 404).
  Every mutating route handler starts with `assertSameOrigin(request)` and
  reads its body with `readJsonBody()` (`src/server/http/request.ts`).
  Redirect targets from `?next=` go through `safeRedirectPath()`.
- Judge: executor contract `worker/types.ts`, comparator + verdicts
  `worker/judge.ts`, Docker runner `worker/docker-executor.ts`, production
  runner `worker/vercel-sandbox-executor.ts` (`JUDGE_EXECUTOR=vercel-sandbox`,
  drained in-app by `src/server/judge-runner.ts`, `docs/specs/judge-prod.md`), harnesses
  `sandbox/harness.{py,js}`. Queue SQL and job/result mapping
  `worker/queue.ts`, slots + sweep `worker/loop.ts`, process `worker/index.ts`.
  Finalize only `WHERE status='running'`; never requeue; worker logs never
  contain user code or stdout. Sandbox containers carry `lemmayard.sandbox=1`
  and `lemmayard.ns=<SANDBOX_NAMESPACE>` (default: checkout dir + path hash);
  cleanup and leftover checks filter by both, never by the sandbox label alone.
- Rooms (`docs/specs/rooms.md`): pure, deterministic domain code in
  `src/lib/rooms/` (`types`, `selection`, `scoring`, `invite`, `session-state`,
  `events`, `rng`) with no DB or server imports, so the client can reuse it;
  inject randomness (`createSeededRng` in tests, `cryptoRng` in production).
  DB enums are built from its tuples. Server code in `src/server/rooms/`;
  every room read goes through `requireRoomMember` / `requireSessionInRoom`
  (null → 404). Test factories: `tests/helpers/rooms.ts`.
  Room events are written only by `appendRoomEvent` (`src/server/rooms/events.ts`)
  under the session lock `rs:<id>`; lock order is user → room → session, and a
  session-lock holder never takes another lock. Session submits are scored in
  `finalize()` (same transaction, `src/server/rooms/outcome.ts`).
- Import alias `@/` → `src/`.

## Rules

- UI must follow DESIGN.md (design v2 "Proof": tokens, components, motion,
  accessibility). The site is dark only for now: the switch is
  `THEME_TOGGLE_ENABLED` in `src/lib/theme-config.ts` (keep both themes
  working; theme-aware client code reads `useAppliedTheme()`).
- DB schema changes are additive migrations, one per feature spec (rooms, F-features,
  community phases, ...), with RLS enabled on new tables and
  `pnpm db:export-sql` regenerated. Migration numbers can clash between
  parallel branches; see `docs/AGENT-HANDOFF.md` section 6.
- User code runs only inside the sandbox (Docker; in production a Vercel
  Sandbox microVM), always, including in tests.
  Authored guide code samples in `src/content/learn/**/code/` are trusted repo code and may run on the host in unit tests; the Docker-only rule applies to untrusted user submissions.
- Zod validation on every boundary (env, request bodies, problem files, worker
  input/output). SQL only through Drizzle.
- No shell execution: use `execFile` / `spawn` with an argument array, never
  `exec` or shell strings. No env passed into sandbox containers.
- Read env only through `getEnv()` from `src/server/env.ts`; add new variables
  there and to `.env.example`.
- Next.js is newer than most training data: check `node_modules/next/dist/docs/`
  before using an API.
- Git: one branch per unit of work, `feature/<name>` (milestones
  `feature/<m#-name>`) or `fix/<name>`, merged after review and the verification gate in `docs/AGENT-HANDOFF.md`.
  `main` receives merges only, never direct commits. Never merge into `main`
  or push without the owner's explicit go-ahead.
