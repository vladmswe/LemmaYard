# Deploying to Vercel + Supabase

This guide is for the owner, who types every secret himself. Never commit a
connection string, password or `AUTH_SECRET`, and never paste them into an
issue, a chat or a PR. Every value below is an example shape, not a real one.

What runs where:

| Part | Where | Notes |
| --- | --- | --- |
| Web app (Next.js pages + API routes) | Vercel Functions | Reads/writes Postgres through the Supabase transaction pooler. |
| Database | Supabase Postgres | Migrations and the problem import are run from your machine. |
| Judge worker (`pnpm worker`) | **Not deployed** | Needs Docker; see "What does not work yet". |

## 1. Supabase: which connection strings to copy

In the Supabase dashboard open the project, click **Connect** (top bar), and use
the **Connection string** tab, type **URI**. You need two of the strings shown
there:

| Dialog entry | Host / port / user | Use it as | Where |
| --- | --- | --- | --- |
| **Transaction pooler** | `aws-0-<region>.pooler.supabase.com`, port **6543**, user `postgres.<project-ref>` | `DATABASE_URL` | Vercel env vars |
| **Session pooler** | same pooler host, port **5432**, user `postgres.<project-ref>` | `DATABASE_URL_DIRECT` | Only in your local shell, for migrations and the import |

Do **not** use the **Direct connection** (`db.<project-ref>.supabase.co:5432`):
that host is IPv6-only unless the IPv4 add-on is enabled, and neither Vercel
Functions nor most home networks can reach it over IPv6. The session pooler
is IPv4-compatible and behaves like a direct connection (session features,
long transactions), which is what migrations need.

Example shapes (fake values):

```
DATABASE_URL=postgresql://postgres.abcdefghijklmnopqrst:<url-encoded-password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.abcdefghijklmnopqrst:<url-encoded-password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

The dialog shows `[YOUR-PASSWORD]` in place of the password: replace the whole
placeholder, brackets included. The password is the database password you set
when creating the project (reset it under Project Settings → Database if
needed).

**URL-encode special characters in the password.** An unencoded `#`, `/` or
`?` makes the URL invalid (the app then fails with `Invalid environment
variables: DATABASE_URL`), and an unencoded `@`, `:` or `%` can silently change
what is parsed as the password. Encode with:

```bash
node -e 'console.log(encodeURIComponent(process.argv[1]))' 'the-password'
```

(or choose a password of letters and digits only). You do not need to append
`?sslmode=...`: TLS is configured by the app (section 4). If the string has
`sslmode` anyway, it is removed from the URL and only used as a hint.

## 2. Generate the auth secret

```bash
openssl rand -base64 32
```

Use a new value for production; never reuse the one from your local `.env`.

## 3. Vercel environment variables

Vercel → Project → Settings → Environment Variables. Add them for the
**Production** environment (and Preview, if you use preview deployments; see
the `AUTH_URL` note):

| Name | Required | Example shape | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres` | Transaction pooler, port 6543. |
| `AUTH_SECRET` | yes | 44 random base64 characters | At least 32 characters, or every request that reads the session fails. The `.env.example` placeholder, values containing "change-me" and values with fewer than 12 distinct characters are rejected in production. |
| `AUTH_URL` | yes | `https://lemma-yard.vercel.app` | Must equal the origin the browser shows (scheme + host, no path). A trailing slash is fine. If it differs (e.g. you open the site on a custom domain or a preview URL), every POST (register, login, logout) answers **403**. |
| `DATABASE_SSL` | no | `no-verify` | `disable`, `require` or `no-verify`; see section 4. |
| `DATABASE_SSL_CA` | no | `-----BEGIN CERTIFICATE-----\n...` | PEM CA for verified TLS; see section 4. |
| `DATABASE_POOL_MAX` | no | `1` | Connections per function instance. Default 1 on Vercel (detected from Vercel's `VERCEL` system variable), 10 elsewhere. |
| `JUDGE_ENABLED` | no | `1` | Code execution (Run, Submit, room session start). Unset: **off on Vercel**, on everywhere else. Leave it unset on Vercel while no worker is deployed (section 7); set `1` only once a judge serves this database, `0` to switch it off anywhere. Only `0` and `1` are accepted. |

Do **not** set `DATABASE_URL_DIRECT` on Vercel; the web app never uses it.
Do not set `NODE_ENV` or `PORT` either; Vercel manages them. Do not set
`AUTH_RATE_LIMITS` (login/register limits; `0` is rejected on Vercel).

Changing an environment variable does not affect running deployments:
**redeploy** afterwards (Deployments → ⋯ on the latest → Redeploy). The build
itself does not need the database or any of these variables (all pages render
on demand), so a missing variable shows up only at run time.

**Region.** Put the Vercel Functions in the same region as the Supabase
project (Settings → Functions → Function Region; e.g. Frankfurt `fra1` for
Supabase `eu-central-1`). Every page makes several queries; a cross-Atlantic
round trip on each one makes pages slow and connection timeouts more likely.

## 4. TLS (`DATABASE_SSL`)

| Value | Meaning |
| --- | --- |
| `disable` | No TLS. Default for `localhost`, `127.0.0.1`, `::1` and the compose host `postgres`. |
| `no-verify` | TLS on, server certificate **not verified**. Default for every other host, so Supabase works out of the box. |
| `require` | TLS on, certificate verified against Node's CA store, or against `DATABASE_SSL_CA` when it is set. Default when `DATABASE_SSL_CA` is set. |

Why the default is `no-verify`: Supabase signs its database and pooler
certificates with its own root CA, which is not in Node's trusted store, so
full verification without that CA fails with `self-signed certificate in
certificate chain`. The trade-off: traffic is encrypted, but an attacker who
can intercept the network path between Vercel and Supabase could impersonate
the database. For a hobby project this is the common setting; to remove the
risk, supply the CA:

1. Supabase → Project Settings → Database → **SSL Configuration** → Download
   certificate (a `.crt` PEM file).
2. Put its content into `DATABASE_SSL_CA` on Vercel (multi-line value, or one
   line with `\n` between the lines). `DATABASE_SSL` then defaults to `require`.
3. Redeploy and check `/api/health`. If it reports `down` and the logs show a
   certificate error, remove `DATABASE_SSL_CA` (or set `DATABASE_SSL=no-verify`)
   and redeploy.

An explicit `DATABASE_SSL` always wins over `DATABASE_SSL_CA` and over any
`sslmode` in the URL. Without `DATABASE_SSL`, an `sslmode` in the URL is mapped
as `disable` → `disable`, `verify-ca`/`verify-full` → `require`, anything else
(`require`, `prefer`, ...) → `no-verify` (libpq semantics).

## 5. Migrate and seed Supabase from your machine

Run from the repository root with dependencies installed (`pnpm install`).
Type the session-pooler string in the shell; do not put it into `.env` or any
committed file. A leading space keeps the command out of zsh/bash history when
`HIST_IGNORE_SPACE` / `HISTCONTROL=ignorespace` is on.

```bash
 export DATABASE_URL_DIRECT='postgresql://postgres.<ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
pnpm db:migrate     # prints "Applying migrations to aws-0-<region>.pooler.supabase.com:5432/postgres"
pnpm problems:import
unset DATABASE_URL_DIRECT
```

(`pnpm db:seed` runs both steps.) Check the printed host before anything is
written: it must be the Supabase pooler, not `localhost`. The scripts also
read your local `.env` for the other required variables (`AUTH_SECRET`), so
keep a local `.env` (copied from `.env.example`). Variables typed in the shell
take precedence over `.env`.

Re-run both commands after pulling new migrations in `drizzle/` or changing
`problems/`. Do not run `problems:import --prune` against production unless
you mean to unpublish problems.

### Alternative: create the tables in the Supabase SQL Editor

If you do not want to run migrations from your machine, open
[`docs/supabase/schema.sql`](supabase/schema.sql) (generated from `drizzle/*.sql`
by `pnpm db:export-sql`), copy the whole file, then in Supabase go to
**SQL Editor → New query**, paste it and press **Run**. Use it on an EMPTY
project only: it refuses to run if the tables already exist. It creates all 13
tables, indexes and CHECKs, enables RLS on each table (no policies) and records
the 4 migrations in `drizzle.__drizzle_migrations`, so a later
`pnpm db:migrate` applies only migrations added after the file was generated.
The result shows each table with `rls = true`. The file creates no data: load the
20 problems afterwards with
`DATABASE_URL_DIRECT='<session pooler>' pnpm problems:import`. A unit test
(`tests/unit/supabase-sql.test.ts`) fails when the file is stale; regenerate it
with `pnpm db:export-sql` whenever a migration is added.

### Row level security

Row level security is on for all 13 application tables, **without any
policies**: migration `0002_enable_rls` covers `users`, `problems`, `tags`,
`problem_tags`, `test_cases` and `submissions`; migration `0003_rooms` creates
`rooms`, `room_members`, `room_sessions`, `room_session_problems`,
`room_session_participants`, `room_session_results` and `room_events` with RLS
enabled. Every table added later must enable it too
(`tests/integration/rls.test.ts` fails otherwise). Supabase exposes the `public` schema through its
REST API (with the public `anon` key); without RLS, anyone with that key could
read `users`, including password hashes. With RLS on and no policies, the
REST roles (`anon`, `authenticated`) see nothing. The app connects as
`postgres`, the owner of the tables, and owners bypass RLS, so the app is
unaffected.

After migrating, open Supabase → **Advisors → Security Advisor**: the
"RLS disabled in public" errors should be gone. "RLS enabled, no policy"
notices for these tables are expected and intended (deny by default). The
`drizzle` schema (migration bookkeeping) is not exposed through the API.

## 6. Check the deployment

1. `https://<production domain>/api/health` must answer
   `200 {"ok":true,"db":"up","judge":"disabled"}` (`judge` is the configured
   `JUDGE_ENABLED` mode, not a probe of a worker; it never changes the status).
   `503 {"ok":false,"db":"down",...}` means the app cannot reach or query the
   database; the reason is only in the logs (step 3), never in the response.
2. Open `/`: it shows the problem count and the "Start with these" table. If
   the database is down, the home page still renders, but without numbers,
   featured problems and the progress card.
3. Logs: Vercel → Project → **Logs** (runtime logs), filter by the time of the
   request or by the path. Database failures are logged as one JSON line, e.g.
   `{"level":"error","event":"landing.db_unavailable","error":{"code":"ECONNREFUSED","message":"..."}}`
   or `"event":"health.db_down"`. Connection strings and passwords are
   removed from these lines. Other pages that fail show "Something went wrong"
   with an **Error ID**; search the logs for that ID to find the stack trace.
4. Register an account and log in to check `AUTH_URL` and `AUTH_SECRET`.
5. Security headers: `curl -sI https://<production domain>/ | grep -iE
   'content-security|x-frame|x-content-type|referrer|permissions|cross-origin'`
   shows the CSP and the other headers of README "Security". The CSP allows
   only same-origin scripts, styles, fonts, images, connections and workers,
   and `frame-ancestors 'none'` forbids embedding the site in an iframe. Adding
   an external service (analytics, error tracking, a CDN for images) needs its
   origin in `src/server/http/security-headers.ts`, or the browser blocks it.
   Login/register limits are counted per function instance (README
   "Security"); for stronger protection, add a Vercel Firewall rate-limit rule
   for `/api/auth/*`.

## 7. What does not work yet in production

**Run and Submit need the judge worker**, which runs user code in Docker
containers on a long-lived host. Vercel has no Docker, so the app runs in
"judge disabled" mode there by default (`JUDGE_ENABLED` unset + Vercel's
`VERCEL` variable): Run and Submit are disabled on the problem page with a
note, the API answers `503 {"code":"judge_disabled"}` without queuing
anything, and room sessions can be set up but not started. Pages, accounts,
profiles, the guide and room lobbies work. The plan (PLAN.md §13) is a Vercel Sandbox executor behind the
existing `Executor` interface (isolated microVMs, started from Vercel
Functions), or alternatively a small VPS running only the worker.

### Enabling a judge with a worker host (not yet tried in production)

The worker is the same process as locally; it only needs Docker and the
database:

1. On a Linux host with Docker, Node 22 and pnpm: clone the repository,
   `pnpm install`, `cp .env.example .env`, then `pnpm sandbox:build`.
2. In that `.env` set `DATABASE_URL` to the Supabase **session pooler** string
   (port 5432; the worker is a long-lived process with its own pool) and
   `DATABASE_POOL_MAX` to a small value (e.g. `3`; it needs about
   `WORKER_CONCURRENCY` + 1 connections). `AUTH_SECRET` must be any value of at
   least 32 characters (the worker does not use it, but the env schema
   requires it).
3. Run `pnpm worker` under a process manager (systemd, pm2, ...). At start it
   checks Docker and both images and logs `worker started`.
4. On Vercel set `JUDGE_ENABLED=1` and redeploy; `/api/health` then reports
   `"judge":"enabled"`.

Every Run and Submit then waits in `submissions` until the worker claims it.
If the worker stops, the UI reports "Judge is unavailable, try again later"
after `QUEUED_TIMEOUT_MS`, but the rows stay `queued` and count against each
user's active-submission cap (`MAX_ACTIVE_PER_USER`) until a worker claims
them. When it comes back it judges them and its sweep marks rows left
`running` by a crash as `internal_error`. Set `JUDGE_ENABLED` back to unset or
`0` if the host goes away for good.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| 500 on `/` (before this release) or `/api/health` = `down` | `DATABASE_URL` missing (not set for Production, or added without a redeploy), invalid (unencoded password characters), wrong host (direct `db.<ref>.supabase.co` is IPv6-only: `ENOTFOUND`/`ENETUNREACH`), wrong password, or TLS (below) | Read the `landing.db_unavailable` / `health.db_down` log line; fix the variable; redeploy. |
| Logs: `Invalid environment variables: ...` | A required variable is missing or malformed (`DATABASE_URL`, `AUTH_SECRET` < 32 chars, `DATABASE_SSL` not one of the three values) | Fix it in Vercel; redeploy. |
| Logs: `AUTH_SECRET: is the .env.example placeholder` (or `contains "change-me"`, `has fewer than 12 distinct characters`) | The production `AUTH_SECRET` is a placeholder or too weak | Generate one with `openssl rand -base64 32`; set it in Vercel; redeploy. |
| 429 "Too many sign-in attempts" | 10 failed logins per address + email (or 30 per address) in 15 min | Wait for the time in the message (`Retry-After`). |
| 403 on register / login / logout | `AUTH_URL` is not the origin the browser uses (http vs https, `www`, custom domain, preview URL) | Set `AUTH_URL=https://<exact domain>`; redeploy. |
| `self-signed certificate in certificate chain` | Certificate verification on (`DATABASE_SSL=require` or `sslmode=verify-full`) without Supabase's CA | Add `DATABASE_SSL_CA`, or use `DATABASE_SSL=no-verify` / leave it unset. |
| `The server does not support SSL connections` | TLS on against a server without TLS (local Postgres with `sslmode=require` in the URL) | `DATABASE_SSL=disable` or remove `sslmode` from the URL. |
| `too many connections` / `Max client connections reached` / `MaxClientsInSessionMode` | Vercel is using the session pooler (5432) or the direct host, or `DATABASE_POOL_MAX` is large | Use the **transaction** pooler (6543) for `DATABASE_URL`; keep `DATABASE_POOL_MAX` small (1–3). |
| `prepared statement "..." already exists` / `does not exist` | Named prepared statements through a transaction pooler (the app does not use them), or a pooler URL used with a client that does | Use the transaction-pooler URL exactly as copied (port 6543); do not add `?pgbouncer=...` or other client options; report it if it persists. |
| `ENOTFOUND db.<ref>.supabase.co` or `ENETUNREACH` on migrate | Direct host is IPv6-only | Use the session pooler string for `DATABASE_URL_DIRECT`. |
| `password authentication failed for user "postgres"` | User must be `postgres.<project-ref>` on the pooler, or the password is wrong / not encoded | Copy the string from the Connect dialog again. |
| Pages slow, `timeout exceeded when trying to connect` | Functions and database in different regions, or the Supabase project is paused (free tier pauses after inactivity) | Same region (section 3); restore the project in Supabase. |
