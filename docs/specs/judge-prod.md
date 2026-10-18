# Production judge (PLAN.md §13)

Status: implemented on `feature/judge-prod` (decision 2026-10-18), not yet
tried on a real Vercel project. Owner setup: [`docs/DEPLOY.md`](../DEPLOY.md)
section 7.

## Problem

On Vercel the judge is off (`JUDGE_ENABLED` unset + `VERCEL` → 503
`judge_disabled`), because the only executor needs Docker on the machine that
runs `pnpm worker`. The owner wants Run and Submit to work in production for a
learning project with a few dozen users, without becoming a server admin.

Requirement added during the decision: the platform must grow beyond Python
and JavaScript, to at least **Java, C++ and Go**, later TypeScript, Rust, C#
and Kotlin. Languages are not implemented now, but the production executor
must not block them and adding one must be a well-defined task (section
"Adding a language").

## Options compared

Facts from the Vercel docs as of 2026-10 (Sandbox pricing page updated
2026-09-10, images 2026-08-11, Container Registry limits 2026-09-22,
Functions limits 2026-08-24).

| Criterion | (a) Vercel Sandbox | (b) Docker worker on a small VPS | (c1) Hosted judges (Judge0 on RapidAPI, Piston) | (c2) Other microVM APIs (E2B, Modal, Fly Machines) |
| --- | --- | --- | --- | --- |
| Isolation of untrusted code | One Firecracker microVM per job, `networkPolicy: "deny-all"` blocks all egress incl. DNS, VM discarded after the job (`persistent: false`). Stronger than a container. | Today's hardened container (`--network none`, read-only, cap-drop, pids, cgroup memory), but on a host the owner must patch and watch; a kernel escape owns the host and the DB credentials on it. | A third party runs the code; their sandbox config and logging are outside our control. | microVMs, comparable to (a). |
| Python + JavaScript today | Managed images `vercel/sandbox/python:3.14`, `vercel/sandbox/node:22`. Harness and all 20 problem solutions verified on Python 3.14 (`pnpm problems:verify`, 40/40 accepted). | The local images (Python 3.12, Node 22). | Yes. | Yes. |
| More languages (Java, C++, Go, Rust, C#, Kotlin, TypeScript) | **Custom images** from Vercel Container Registry (VCR, available on Hobby: 10 repositories per project, $0.10/GB-month): the same `sandbox/Dockerfile.<lang>` as local Docker, pushed once with `vercel vcr build`. Installing a toolchain at run time (`apt-get` in each VM) is not viable (tens of seconds per job). TypeScript needs no new image (Node 22.6+ strips types; Node 24 by default). | One image per language on the host (`pnpm sandbox:build`). Most direct. | 40–60 languages out of the box (their main strength), but each with their own versions, limits and output format; our typed-signature harness and host-side verdict would have to be rebuilt on top. | Custom images too (per vendor). |
| Compile step | Runs inside the VM (javac, g++, go build, rustc): billed as active CPU, a few seconds at most; counted in the wall budget via `compileAllowanceMs`. | Same, inside the container. | Provider-side. | Same as (a). |
| Cost for this project | Hobby: free within 5,000 sandbox creations, 5 h active CPU, 420 GB-h memory per month (then creation pauses until the next cycle, no charge). One Run/Submit = one creation and ~0.03 GB-h (1 vCPU = 2 GB, billed per started minute). A 2 s compile adds 2 s of active CPU. Pro: about $0.0008–0.001 per judgement, inside the $20 credit. VCR: a JDK image ~0.3 GB ≈ $0.03/month. | A 2–4 GB VPS €4–8/month (compilers want RAM), plus the owner's time. | Free tiers rate limited (Piston's public API is allow-list only); paid plans ~$10–30/month. | Another account and API key; usage billing. |
| Owner effort | Today: set one env var on Vercel. Per new language: one `vercel vcr build … --push` command (or a GitHub Action with Vercel's OIDC login) and one env var. No server. | Server setup, SSH, Docker, OS and image updates, monitoring, forever. Per language: rebuild images on the host. | New account, API key, executor rewrite. | New account, API key secret. |
| Latency | VM start ~1–2 s (custom images: to be measured; VCR prepares an optimized amd64 image) plus compile and run. No queue hop. | Lowest per run (container start ~0.3 s) plus up to `WORKER_POLL_MS`. | Network round trip; queueing on shared free tiers. | Similar to (a). |
| Fit with `Executor`, queue, finalize | A new `Executor`; claim/lease, `finalize()` with rooms outcome and ratings unchanged; per-language data in one table (`VM_LANGUAGES`). | No code change; only packaging. | Executor rewrite; nonce-frame protocol replaced. | Like (a), plus a vendor. |

Rejected:

- **(b) VPS worker.** Scales to many languages just as well (one image per
  language either way: that work is identical in (a) and (b)), but turns the
  owner into an operator: OS updates, Docker, disk, a long-lived machine
  holding the DB password; a stopped VPS silently leaves submissions queued.
  It remains a supported fallback with zero code changes
  (`JUDGE_EXECUTOR=docker`, DEPLOY.md "Alternative"), e.g. if custom-image
  boot latency on Vercel turns out to be bad for JVM languages.
- **(c1) Judge0 / Piston.** The language list is tempting, but it means third
  party trust and rate limits, and rebuilding our typed signatures, nonce
  frames and host-side verdict around their API (expected outputs must never
  leave our host).
- **(c2) E2B / Modal / Fly.** Same shape as (a), another vendor and secret.

## Decision

**(a) Vercel Sandbox, behind the existing `Executor` interface,** selected by
`JUDGE_EXECUTOR=vercel-sandbox`. Python and JavaScript use Vercel's managed
images; every future language uses a custom VCR image built from the same
`sandbox/Dockerfile.<lang>` that local Docker uses, so one Dockerfile serves
both executors. Local development, CI and every existing test keep
`JUDGE_EXECUTOR=docker` (the default).

## Design

```
POST /api/problems/:slug/{run,submit}   → insert queued row → 202 → after(): drainQueue
GET  /api/submissions/:id (poll, 1 s)   → row queued ≥ 3 s / running past the stale limit → after(): drainQueue
drainQueue = sweep (throttled) → loop { claimNext (FOR UPDATE SKIP LOCKED) → buildJob → executor → finalize }
executor   = VercelSandboxExecutor: create microVM (image per language) → upload harness + payload
             → VM_LANGUAGES[lang].command → frames → decideVerdict → stop VM
```

- **Executor** (`worker/vercel-sandbox-executor.ts`): language-agnostic
  except for one table, `VM_LANGUAGES: Record<Language, VmLanguage>` (harness
  file, launcher command, compile allowance), plus `images: Record<Language,
  string>` in its config. Same protocol as Docker: the payload is built by the
  shared `buildSandboxPayload` (inputs, limits, nonce; never `expected`),
  frames are parsed by `FrameParser` with the per-run nonce, the Submit stop
  on the first wrong answer, the wall clock (`3000 + min(n × limit,
  WALL_CAP_MS) + compileAllowanceMs`) and the 1 MB output cap are enforced on
  our side, and `decideVerdict` decides. Platform failures (quota, API errors)
  become `internal_error` with a one-line reason.
- **Inside the VM**: no shell, an argument array. A fixed, trusted launcher
  (Python `-c` / Node `-e`) opens the payload file as stdin, deletes it and
  starts the unchanged harness. Memory: the VM has 2 GB and no per-job
  cgroup, so Python gets `RLIMIT_AS` = the problem limit (MemoryError →
  `memory_limit`) and Node the same V8 heap flag as in Docker (heap abort,
  exit 134 → `memory_limit`).
- **SDK client** (`worker/vercel-sandbox-client.ts`, `@vercel/sandbox`
  3.5.1, pinned): `Sandbox.create({ image, resources: { vcpus: 1 }, timeout,
  networkPolicy: "deny-all", persistent: false })`, no `env`. The command runs
  detached with a platform `timeoutMs` (SIGKILL backstop); its log stream is
  read to the end before the exit code, so no frame is lost. `stop()` always
  runs in `finally`.
- **Drain** (`drainQueue` in `worker/loop.ts`, scheduled by
  `src/server/judge-runner.ts`): the same claim → process → finalize path as a
  worker slot, so no double judging (atomic claim), finalize only
  `WHERE status='running'`, never requeue, room session outcome + ratings in
  `finalize()`. New claims stop after 120 s; one job needs at most ~45 s
  (plus a compile allowance), far inside the 300 s function limit (Hobby and
  Pro default). At most `WORKER_CONCURRENCY` drains per function instance.
  The sweep (stale `running` → `internal_error`, old Runs deleted, room
  sessions closed) runs at most every 30 s per instance.
- **Crash safety**: a function killed mid-job (deploy, timeout) leaves the row
  `running`; the next poll of that submission after `STALE_RUNNING_MIN`
  forces a sweep and the row becomes `internal_error` ("worker crashed or
  timed out"), exactly like a crashed worker. A queued row is retried by the
  owner's poll every second (after 3 s), so nothing waits for a cron.
- **Config** (`src/server/env.ts`): `JUDGE_EXECUTOR=docker|vercel-sandbox`
  (default `docker`), `VERCEL_SANDBOX_IMAGE_PYTHON`,
  `VERCEL_SANDBOX_IMAGE_NODE`. `JUDGE_ENABLED`: an explicit `0`/`1` wins;
  unset = on, except on Vercel with the docker executor.
- **Files**: `next.config.ts` traces `sandbox/harness.*` into the API
  functions (`outputFileTracingIncludes`).
- **Logs**: unchanged `processSubmission` lines (ids, verdict, counts, the
  executor's own failure reason); never code, stdout or user error text.

## Adding a language

What exists per language today, and what a new one (example: Java) needs.
The wire protocol does not change: one JSON line on stdin
(`{language, code, signature, tests: [{input}], timeLimitMs, stopOnError,
nonce}`), `@@<nonce>@@{frame}` lines on stdout (`compile_error`, `fatal`,
`test`, `done`), the verdict and the comparison with `expected` on our side
(`worker/judge.ts`, unchanged). The value types are only `int`, `float`,
`bool`, `string` and arrays of them (`T[]`, `T[][]`), so marshalling is small.

1. **Database**: one additive migration adding the value to the `language`
   enum (`ALTER TYPE language ADD VALUE 'java'`), with `pnpm db:generate`,
   `pnpm db:export-sql` and the freshness test, as for any schema change.
   `LANGUAGES` in `src/lib/submission-dto.ts` follows the enum.
2. **Harness** `sandbox/harness.java` (or a directory for languages that need
   several files): a fixed driver that
   - reads the payload line, compiles the user's code in the sandbox
     (`javac`, `g++ -O2 -std=c++17`, `go build`, `rustc -O`, `dotnet`/`csc`,
     `kotlinc`) into a temp directory under `/tmp`; a compiler error → one
     `compile_error` frame with the compiler message, file names normalized to
     `Solution.java` etc., no host paths;
   - converts each `input` value to the parameter's declared type
     (`int` → `long`/`int64`/`i64`, `float` → `double`, `bool`, `string`,
     `T[]` → `List`/`vector`/slice/`Vec`/array): Go and C# have JSON in the
     standard library; Java, C++, Rust and Kotlin get a small JSON
     reader/writer inside the harness (no third-party downloads at run time:
     the VM has no network);
   - calls the user's method per test with a fresh copy of the input, measures
     `timeMs`, writes a `test` frame with `actual` serialized back to JSON
     (`int` results must stay within ±(2^53−1); non-finite floats → error, as
     in Python/JS), and finally `done`, all with `memoryKb` (peak RSS);
   - captures the user's own stdout into the frame `stdout` (64 KB cap), never
     onto the frame stream, and stops after the first error when
     `stopOnError` is set.
   The per-test time limit inside the harness is an optimization (a watchdog
   thread that writes a `timeout` frame and exits); the wall clock on our
   side remains the guarantee.
3. **Image** `sandbox/Dockerfile.java`: pinned base (e.g.
   `eclipse-temurin:21-jdk` by digest), harness copied to `/sandbox/`,
   `USER 65534`, `WORKDIR /tmp`; precompile what can be precompiled (Go
   standard library cache, C++ `bits/stdc++.h` precompiled header) to cut
   compile time. Add it to `scripts/sandbox-build.ts` and `.env`
   (`SANDBOX_IMAGE_JAVA`). Must build for `linux/amd64` (VCR requirement).
4. **Docker executor** (`worker/docker-executor.ts`): `imageFor` and
   `sandboxCommand` (the run command and memory flags, e.g.
   `java -Xmx<0.75×M>m -Xss64m`), and the per-language time multiplier
   (`LANG_TIME_MULT_JAVA`; JVM/.NET start-up and JIT make 1.5–2× typical).
5. **Vercel Sandbox executor**: one `VM_LANGUAGES` entry (harness file,
   launcher command, `compileAllowanceMs`: about 3 s for javac/g++/go, 5–10 s
   for rustc/kotlinc/dotnet, to be measured) and one image env var
   (`VERCEL_SANDBOX_IMAGE_JAVA`). Memory in the VM: JVM languages via
   `-Xmx`/`-Xss`; native languages (C++, Go, Rust) via `RLIMIT_AS` set by the
   launcher (`prlimit --as=<bytes> --` from util-linux in the image, or the
   harness's own `setrlimit` before compiling the user code; for Go also
   `GOMEMLIMIT`). The custom image is pushed once by the owner:
   `vercel vcr build docker sandbox lemmayard-java:1 --push -- -f sandbox/Dockerfile.java`,
   then `VERCEL_SANDBOX_IMAGE_JAVA=lemmayard-java:1` on Vercel.
   The launcher must not be a shell script built from strings: an argument
   array with fixed text, as for Python/Node.
6. **Templates and editor**: `src/lib/templates` (starter code generated from
   the signature, golden files in `tests/unit/__golden__`),
   `src/lib/workspace/languages.ts` (label, Monaco id, file name), the
   language picker.
7. **Problems**: `solution.java` for every problem in `problems/`
   (`src/server/problems/importer.ts` file list), then `pnpm problems:verify`
   (all solutions × all languages accepted) on Docker, and the same on the
   Vercel images once pushed.
8. **Tests**: add the language to `tests/integration/sandbox-judge.test.ts`
   (verdict matrix, error cleanliness) and
   `tests/integration/sandbox-vercel-executor.test.ts` (launcher + memory
   verdict), plus the harness security cases (no network, read-only, forged
   frames) in `sandbox-security.test.ts`.

TypeScript is the cheap case: no new image or compiler; the Node harness
strips types (Node ≥ 22.6 `--experimental-strip-types`, default in Node 24)
or transpiles with a bundled compiler; templates and solutions are new, the
rest is the JavaScript path.

## Tests

- `tests/unit/vercel-sandbox-executor.test.ts`: a fake `SandboxClient`
  (accepted, payload without `expected`, Submit stop, forged nonce, wall
  clock, unconfirmed kill, output cap, heap abort, exit codes, platform
  failures, VM always stopped) and the exact SDK options (`deny-all`,
  1 vCPU, no env, not persistent).
- `tests/integration/sandbox-vercel-executor.test.ts`: the executor with the
  real launchers and harness in Docker containers of the sandbox images
  standing in for the microVM (1 GB container, so memory verdicts come from
  the launchers).
- `tests/integration/judge-drain.test.ts`: 4 concurrent drains judge 20 rows
  exactly once, the claim window, the sweep first, and a room-session submit
  scored through `finalize()`.
- Real Vercel calls were not made (they need the owner's account); the first
  production check is the checklist in DEPLOY.md section 7.

## Known limits

- Not yet run against real Vercel Sandbox. Assumptions to confirm on the
  first deploy: OIDC auth from inside `after()` (the SDK reads the request's
  `x-vercel-oidc-token`), VM start latency, and that the Python 3.14 managed
  image behaves like the local 3.12 one (verified with a local 3.14 image).
- Node off-heap memory (`Buffer`, typed arrays) is capped by the VM's 2 GB, not
  by the problem limit; Python's cap is the address space (slightly stricter
  than Docker's RSS cgroup). Only the memory verdict of a deliberate bypass is
  affected; the VM is the security boundary.
- Commands run as the image's non-root user, which has sudo inside the VM.
  Nothing secret is in the VM (no env, no expected outputs, no network), and
  the VM is discarded after the job.
- Hobby: at most 10 concurrent sandboxes and 5,000 creations per month; past
  that, creation fails and submissions end as `internal_error` with the reason
  until the cycle resets (or upgrade to Pro). The per-user caps
  (`MAX_ACTIVE_PER_USER`, rate limits) keep a few dozen users far below it.
- The SDK delivers output as text, so a multi-byte character split across two
  log chunks may arrive as U+FFFD. Python frames are ASCII; JS frames with
  non-ASCII strings are the only case. New harnesses should escape non-ASCII
  in frames (as `harness.py` does).
- Times include the VM's CPU, not Docker's `--cpus 1`; the language multipliers
  are the same, so limits may need tuning after real measurements.
