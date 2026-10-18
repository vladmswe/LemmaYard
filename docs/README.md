# docs/

Project documents that are not code. The repository overview and local setup
are in the root `README.md`; the milestone plan is `PLAN.md`, the UI rules are
`DESIGN.md`, agent conventions are `CLAUDE.md` / `AGENTS.md`.

| File | What it is |
| --- | --- |
| [`DEPLOY.md`](DEPLOY.md) | Owner guide for deploying the web app to Vercel with a Supabase Postgres: connection strings, `AUTH_SECRET`, Vercel environment variables, TLS, migrating and seeding from your machine, row level security, the SQL Editor alternative (schema.sql, then problems.sql, no credentials), region, health checks and security headers, judge-disabled mode and how to enable a judge with a worker host, troubleshooting. |
| [`specs/rooms.md`](specs/rooms.md) | Spec F6 "Rooms": private friend rooms with timed sessions, problem draw, scoring, live events and history. Shipped as R1–R5; the code follows it (`src/lib/rooms/`, `src/server/rooms/`). |
| [`specs/features-f1-f5.md`](specs/features-f1-f5.md) | Product decision and specs for the post-MVP features F1–F5 (ranked long-list, then one spec per feature, each allowed one additive migration). Not implemented yet. |
| [`img/`](img/) | Screenshots used by the root `README.md` (landing, problem workspace, guide lesson, live room session). PNG, 1440 px wide, each under 400 KB; test accounts only, no personal data. |
| [`supabase/schema.sql`](supabase/schema.sql) | Generated SQL for a fresh Supabase project (all tables, indexes, CHECKs, RLS on, migrations recorded). Do not edit by hand: regenerate with `pnpm db:export-sql` after adding a migration; `tests/unit/supabase-sql.test.ts` fails when it is stale. |
| [`supabase/problems.sql`](supabase/problems.sql) | Generated SQL that seeds the problem catalog (problems with author ratings, tags, all test cases including hidden ones) into a Supabase project after `schema.sql`, with no credentials: paste it into the SQL Editor. Idempotent (upsert by slug, one transaction), same rows as `pnpm problems:import`. Do not edit by hand: regenerate with `pnpm problems:export-sql` after changing `problems/`; `tests/unit/problems-sql.test.ts` fails when it is stale. |
| [`specs/community.md`](specs/community.md) | Plan for the community layer (not implemented): research on LeetCode and comparable products, product spec with AC-C-* criteria (problem discussions and votes, study plans, interview-experience posts with add-to-plan, moderation, notifications, privacy), technical design (tables, API, markdown sanitization, DB-counted rate limits) and phases C1–C5 with work packages and owner decisions. Mockups in [`specs/community/`](specs/community/). |
- [`specs/rooms-v2.md`](specs/rooms-v2.md): Rooms v2 (scoreboard matrix, room defaults and weekly schedule, per-room Elo rating and rating-based selection, live attempts) with the owner's decisions.
