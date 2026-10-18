# docs/

Project documents that are not code. The repository overview and local setup
are in the root `README.md`; the milestone plan is `PLAN.md`, the UI rules are
`DESIGN.md`, agent conventions are `CLAUDE.md` / `AGENTS.md`.

| File | What it is |
| --- | --- |
| [`DEPLOY.md`](DEPLOY.md) | Owner guide for deploying the web app to Vercel with a Supabase Postgres: connection strings, `AUTH_SECRET`, Vercel environment variables, TLS, migrating and seeding from your machine, row level security, the SQL Editor alternative, region, health checks and security headers, judge-disabled mode and how to enable a judge with a worker host, troubleshooting. |
| [`specs/rooms.md`](specs/rooms.md) | Spec F6 "Rooms": private friend rooms with timed sessions, problem draw, scoring, live events and history. Shipped as R1–R5; the code follows it (`src/lib/rooms/`, `src/server/rooms/`). |
| [`specs/features-f1-f5.md`](specs/features-f1-f5.md) | Product decision and specs for the post-MVP features F1–F5 (ranked long-list, then one spec per feature, each allowed one additive migration). Not implemented yet. |
| [`img/`](img/) | Screenshots used by the root `README.md` (landing, problem workspace, guide lesson, live room session). PNG, 1440 px wide, each under 400 KB; test accounts only, no personal data. |
| [`supabase/schema.sql`](supabase/schema.sql) | Generated SQL for a fresh Supabase project (all tables, indexes, CHECKs, RLS on, migrations recorded). Do not edit by hand: regenerate with `pnpm db:export-sql` after adding a migration; `tests/unit/supabase-sql.test.ts` fails when it is stale. |
