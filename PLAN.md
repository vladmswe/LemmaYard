# LemmaYard (ранее leet-copy) — план реализации (v2, после ревью)

Клон LeetCode: каталог задач, редактор кода в браузере, запуск и проверка решений в Docker-песочнице, история посылок, профиль.
Pet-проект, запускается локально (docker-compose для Postgres, worker на хосте). Деплой в MVP не входит.

Язык UI: English. Язык этого плана: русский (идентификаторы и команды на английском).
Тексты задач пишем **свои**, не копируем с LeetCode. Название и брендинг свои.

---

## 1. Scope

### MVP
- Регистрация / вход (email + пароль), выход.
- Каталог задач: поиск, фильтры (difficulty, tag, status), пагинация, acceptance rate.
- Страница задачи: описание (markdown), Monaco, выбор языка, Run (samples или custom input), Submit (все тесты).
- Вердикты: Accepted, Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Runtime Error, Compile Error, Internal Error.
- История посылок, просмотр посылки с кодом.
- Профиль: решено по сложностям, всего посылок, acceptance rate, последние решённые.
- Задачи — файлы в репозитории + CLI-импорт в БД. ≥15 seed-задач.
- Языки: **Python 3** и **JavaScript (Node)**. Async-функции в JS не поддерживаются.
- Песочница на Docker, без внешних сервисов (Monaco тоже локально, не с CDN).

### Вне MVP
Contests, discussions, лайки/закладки, ListNode/TreeNode, Java/C++/Go/TS, custom checker, admin UI, OAuth, leaderboard, daily problem, heatmap, деплой, email-верификация, сброс пароля, защита логина от брутфорса.

### Принятые свойства MVP (не баги)
- Код пользователя внутри контейнера видит входы hidden-тестов (но **не** expected, их там нет). Каждый Wrong Answer раскрывает один hidden-кейс, как у LeetCode.
- Регистрация позволяет определить занятость email (409).
- `memory_kb` включает базовое потребление интерпретатора (~10 МБ Python, ~40 МБ Node).

---

## 2. Решения по умолчанию

| Область | Решение |
|---|---|
| Фреймворк | Next.js (последний stable, App Router) + TypeScript strict, Node runtime. **Без middleware/proxy**: защита через `getCurrentUser()` в страницах и route handlers |
| UI | Tailwind + shadcn/ui, тема system/light/dark |
| Редактор | `monaco-editor` + `@monaco-editor/react` с `loader.config({ monaco })` (локальная сборка, без CDN), `dynamic(..., { ssr: false })` |
| БД | Postgres 16 + Drizzle ORM + drizzle-kit |
| Auth | **Своя минимальная**: `@node-rs/argon2` (в `serverExternalPackages`) + `jose` JWT в httpOnly cookie (`SameSite=Lax`, `Secure` в prod, TTL 7 дней), пользователь перечитывается из БД на каждый запрос. Auth.js не используем |
| Валидация | Zod на всех границах |
| Очередь | Таблица `submissions` + worker (`FOR UPDATE SKIP LOCKED`), без Redis |
| Песочница | Свой `DockerExecutor`, worker запускается **на хосте** (`pnpm worker`), не в compose (иначе нужен docker socket) |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize`, без `rehype-raw` |
| Тесты | Vitest, Playwright, `@axe-core/playwright` |
| Пакеты | pnpm |

---

## 3. Архитектура

```
Browser ──► Next.js (web) ──► Postgres ◄── worker (Node, на хосте) ──► docker (sandbox)
```

- `web` создаёт `submissions(status=queued)` → `202 {id}`.
- `worker` забирает `queued`, ставит `running`, запускает песочницу, сам сравнивает результат с expected, пишет итог.
- Клиент поллит `GET /api/submissions/:id` раз в 1 с (см. таймауты в M5).
- `Executor` — одна функция-тип `(job) => Promise<ExecResult>`. Реальная реализация `DockerExecutor`; в тестах очереди подставляется stub.
- Run и Submit идут одним путём, различаются `kind`.

### Структура репозитория
```
leet-copy/
  PLAN.md CLAUDE.md README.md .env.example docker-compose.yml
  drizzle/                     # миграции
  problems/<slug>/             # meta.json description.md tests.json solution.py solution.js
  sandbox/                     # Dockerfile.python Dockerfile.node harness.py harness.js
  src/{app,components,lib,server}/
  worker/                      # index.ts queue.ts docker-executor.ts judge.ts (comparators) 
  scripts/                     # import-problems.ts verify-problems.ts
  tests/{unit,integration,e2e,helpers}/
```

---

## 4. Модель данных (все изменения схемы делаются ТОЛЬКО в M1)

- `users`: `id uuid pk`, `email text unique` (lowercase), `username text unique` (3–20, `[a-z0-9_]`), `password_hash`, `created_at`.
- `problems`: `id uuid pk`, `number int unique`, `slug unique`, `title`, `difficulty` (pg enum easy|medium|hard), `description_md`, `signature jsonb`, `compare jsonb`, `time_limit_ms int`, `memory_limit_mb int`, `published bool`, `created_at`, `updated_at`.
- `tags`: `id`, `slug unique`, `name`. `problem_tags`: PK `(problem_id, tag_id)`, FK `ON DELETE CASCADE`.
- `test_cases`: `id`, `problem_id` FK cascade, `position int`, `input jsonb`, `expected jsonb`, `is_sample bool`, `UNIQUE(problem_id, position)`.
- `submissions`: `id uuid pk`, `user_id` FK, `problem_id` FK, `kind` (pg enum run|submit), `language` (enum python|javascript), `code text`, `custom_input jsonb null`, `status` (pg enum: queued, running, accepted, wrong_answer, time_limit, memory_limit, runtime_error, compile_error, internal_error), `runtime_ms int null`, `memory_kb int null`, `passed_count int`, `total_count int`, `failed_test_index int null`, `failed_case jsonb null` (`{input, expected, actual}`), `case_results jsonb null` (массив `CaseResult`, для Run — см. контракт ниже), `stdout text null`, `error text null`, `worker_id text null`, `created_at`, `started_at null`, `finished_at null`.
- Индексы: `submissions(user_id, created_at desc)`, `submissions(problem_id, kind, status)`, частичный `submissions(created_at) WHERE status='queued'`, `submissions(status, started_at) WHERE status='running'`, `problems(difficulty)`, `problems(published)`.
- **Контракт `CaseResult`** (заморожен, общий для M4 и M5): `{ index: number; status: 'passed'|'failed'|'runtime_error'|'time_limit'|'memory_limit'|'not_run'; input: Record<string, unknown>; expected?: unknown; actual?: unknown; timeMs?: number; error?: string }`. Для custom input `expected` отсутствует, успешный прогон = `passed`. Статус харнесса (`ok|error|timeout`) во внешний контракт не попадает — executor мапит его в этот union.
- Дополнительные CHECK и индексы (миграция `0001`, M1-fix): `status <> 'running' OR started_at IS NOT NULL`; финальные статусы требуют `finished_at`; `runtime_ms/memory_kb >= 0`; `failed_test_index` в пределах `total_count`; частичные индексы `submissions(user_id) WHERE status IN ('queued','running')`, `submissions(created_at) WHERE kind='run'`, `submissions(user_id, problem_id, created_at desc)`, `problem_tags(tag_id)`.
- Семантика счётчиков: для `run` `total_count` = число прогнанных кейсов; для `submit` — число всех тестов, `passed_count` = число пройденных до остановки.
- **Acceptance rate и профильная статистика** считаются по `kind=submit` и `status <> internal_error`.
- Статус задачи пользователя: `solved` (есть accepted submit), `attempted` (есть submit без accepted), `todo`.

---

## 5. Формат задачи и судейский протокол

### `problems/<slug>/`
`meta.json`:
```json
{
  "number": 1,
  "slug": "two-sum",
  "title": "Two Sum",
  "difficulty": "easy",
  "tags": ["array", "hash-table"],
  "signature": {
    "name": "twoSum",
    "params": [{ "name": "nums", "type": "int[]" }, { "name": "target", "type": "int" }],
    "returns": "int[]"
  },
  "compare": { "mode": "unordered" },
  "limits": { "timeMs": 2000, "memoryMb": 256 }
}
```
- Типы: `int` (в диапазоне ±(2^53−1)), `float`, `bool`, `string`, массивы `T[]`, `T[][]`.
- `compare.mode`: `exact`; `unordered` (верхнеуровневый массив как multiset канонических JSON-строк, внутренние массивы упорядочены); `float` (обязателен `epsilon`, сравнение с допуском, рекурсивно по массивам). `-0 == 0`. Для `int` сравнение строгое.
- `tests.json`: `[{ "input": {...}, "expected": ..., "sample": true }]`, ключи `input` ровно совпадают с именами параметров.
- Импортёр ставит `published=true`; `--prune` снимает с публикации задачи, чьих директорий нет. Re-import заменяет `test_cases` в одной транзакции.
- Задачи с несколькими валидными ответами — только если подходит `unordered`.

### Шаблоны кода (генерируются из `signature`)
Python: `class Solution:` + метод с `List[...]` аннотациями (с `from typing import List`). JS: `var <name> = function(...) {}` с JSDoc. Для golden-файлов в тестах.

### Образы
`sandbox/Dockerfile.python` (`python:3.12-slim`, pinned) и `Dockerfile.node` (`node:22-alpine`, pinned). `USER 65534`, harness запечён в образ (`/sandbox/harness.*`), размер < 200 МБ. `pnpm sandbox:build` обязателен после изменения harness.

### Протокол запуска (без bind-mount)
Worker использует `execFile` (никогда shell). Жизненный цикл:
1. `docker create -i --label lemmayard.sandbox=1 --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --cpus 1 --memory <M>m --memory-swap <M>m --user 65534:65534 --log-driver none --tmpfs /tmp:rw,size=16m,noexec <image>`, **без `-e`** (env воркера не попадает в контейнер).
2. `docker start -a -i <id>`; worker пишет в stdin один JSON: `{ language, code, signature, tests: [{input}], timeLimitMs, nonce }`. **expected в контейнер не передаётся.**
3. Harness читает stdin, компилирует код в памяти (`compile()` / `new vm.Script`), прогоняет тесты по очереди, **после каждого теста** пишет в реальный stdout кадр `\n@@<nonce>@@<json>\n` с `{index, status:"ok"|"error"|"timeout", actual?, timeMs, error?}`. Пользовательский `print`/`console.log` перехватывается (подмена `sys.stdout` / vm `console`) и копится в `stdout` с лимитом 64 KB (`[truncated]`).
4. Worker читает stdout/stderr с жёстким лимитом 1 МБ (превышение → kill контейнера), парсит только кадры с верным nonce.
5. После выхода: `docker inspect` (ExitCode, OOMKilled), затем `docker rm -f` в `finally`. При старте worker удаляет «осиротевшие» контейнеры с label `lemmayard.sandbox=1` и проверяет наличие обоих образов (`docker image inspect`), иначе падает с понятным сообщением.

Детали harness:
- Python: `Solution()` → `getattr(sol, name)`; на каждый тест deep copy входа; `float`-параметры приводятся к `float`; per-test таймаут через `signal.setitimer` с исключением-наследником `BaseException`; результат через `json.dumps(allow_nan=False)`; несериализуемое / NaN / Inf → `error` "return value not JSON-serializable".
- JS: функция ищется через `vm.runInContext(name)`; per-test `timeout` у `vm`; если вернулся Promise/thenable → error "async functions are not supported"; результат сериализуется `JSON.stringify` **внутри** контекста; `undefined`/`NaN` кодируются как `{"$nonJson":"undefined"}`; `node --max-old-space-size=<0.75×memory>`.
- `int`-результат вне ±(2^53−1) → error.
- Отсутствие функции/класса → `runtime_error` "function X not found". Ошибка компиляции → `compile_error` до первого теста.
- Traceback фильтруется до кадров пользовательского файла `solution.py`/`solution.js`, без путей harness/хоста; `error` ≤ 8 KB.
- `memory_kb` = `ru_maxrss` harness (Python `resource`, Node `process.resourceUsage().maxRSS`); `runtime_ms` = сумма времён тестов (без старта контейнера).

### Бюджет времени
`effective_limit = timeMs × langMultiplier` (python ×2, js ×1, из env).
`wall = 3000 мс + min(n_tests × effective_limit, WALL_CAP_MS=30000)`. При kill по wall-clock `passed_count` = число полученных «ok»-кадров, вердикт `time_limit`. Per-test таймаут в harness — оптимизация, **гарантия** — wall-clock (код пользователя может перехватить исключение).

### Прецедент вердиктов (сверху вниз, первое сработавшее)
1. Сработал wall-clock или harness-кадр `timeout` → `time_limit`.
2. `OOMKilled=true` или Node heap abort (exit 134 / "heap out of memory") → `memory_limit`.
3. Валидные кадры есть → вердикт по тестам: `error` → `runtime_error`; несовпадение → `wrong_answer` (сравнение делает **worker** единым TS-компаратором, раздел `worker/judge.ts`); иначе `accepted`.
4. Нет валидных кадров и ненулевой exit, либо `sys.exit(0)`/`process.exit(0)` без результата → `runtime_error` ("program exited unexpectedly").
5. Ошибка Docker/демона, нечитаемый кадр, отсутствует образ → `internal_error`.

Submit останавливается на первом непройденном тесте. Run прогоняет все sample-тесты без остановки (или один custom-input). Custom-input Run: expected нет, итог `accepted` (отработал без ошибки) либо `runtime_error`/`time_limit`/`memory_limit`/`compile_error`; UI показывает «Output», без метки verdict.

---

## 6. API

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/register` | `{email, username, password}` → 201 + cookie (автовход). 400/409 |
| POST | `/api/auth/login` | `{email, password}` → 200 + cookie, иначе 401 «Invalid email or password» |
| POST | `/api/auth/logout` | очищает cookie |
| POST | `/api/problems/:slug/run` | `{language, code, customInput?}` → 202 `{id}` |
| POST | `/api/problems/:slug/submit` | `{language, code}` → 202 `{id}` |
| GET | `/api/submissions/:id` | DTO ниже; только владелец, иначе 404; `Cache-Control: no-store`, `dynamic = 'force-dynamic'` |

**DTO** `GET /api/submissions/:id`: `{ id, kind, status, language, problem: {slug, title}, passedCount, totalCount, runtimeMs, memoryKb, error, stdout, caseResults?, failedCase?, createdAt, finishedAt }`. `failedCase` заполняется только для `wrong_answer` у `submit`. Поля `input/expected/actual` в `failedCase` и `caseResults` в DTO усечены до 16 КБ сериализованного JSON каждое (с флагом `truncated: true`); в БД хранится полностью. `caseResults` — только для Run.

**Порядок проверок** в мутирующих handlers: (1) `Content-Type: application/json` и `Origin` (если есть) == `AUTH_URL` origin, иначе 403; (2) аутентификация → 401; (3) `Content-Length` ≤ 70 KB иначе 413, парс body и Zod → 400; (4) размер `code` ≤ `MAX_CODE_BYTES` (в UTF-8 байтах, 64 KB) иначе 413; `customInput` ≤ 16 KB; строки с `\u0000` отвергаются как 400; (5) slug существует и `published` → иначе 404; (6) лимит активных (queued/running) посылок на пользователя = 2 и частота (run ≤ 10/мин, submit ≤ 5/мин, `count(*)` по БД в той же транзакции, что и insert; транзакция сериализуется по пользователю через `pg_advisory_xact_lock(hashtext(user_id))`, иначе две параллельные посылки обходят лимит) → 429 + `Retry-After`; (7) insert.
Rejected-запросы **не создают** строк в БД.

Каталог, профиль, история — серверные компоненты (прямые запросы к БД).
`next` в `/login?next=` валидируется: только относительный путь, начинается с единственного `/`, без `//`, схемы и `\`; иначе `/problems`.

---

## 7. Скрипты и env

### package.json scripts
`dev`, `build`, `start`, `worker`, `dev:all` (web+worker через `concurrently`), `lint`, `typecheck`, `test` (unit), `test:integration`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed` (= migrate + import), `problems:import`, `problems:verify`, `sandbox:build`, `setup` (вызывать как `pnpm run setup`, голый `pnpm setup` — встроенная команда pnpm; = install + `docker compose up -d --wait` + `sandbox:build` + `db:seed`).

### .env.example
`DATABASE_URL`, `TEST_DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `PORT`, `WORKER_CONCURRENCY=2`, `WORKER_POLL_MS=500`, `STALE_RUNNING_MIN=3`, `WALL_CAP_MS=30000`, `SANDBOX_IMAGE_PYTHON`, `SANDBOX_IMAGE_NODE`, `LANG_TIME_MULT_PY=2`, `LANG_TIME_MULT_JS=1`, `RUN_RATE_PER_MIN=10`, `SUBMIT_RATE_PER_MIN=5`, `MAX_ACTIVE_PER_USER=2`, `MAX_CODE_BYTES=65536`, `PAGE_SIZE=20`, `QUEUED_TIMEOUT_MS=60000`.

---

## 8. Milestones и критерии приёмки (АС)

Порядок: **M0 → M1 → (M2 ∥ M4) → M3 → M5 → M6 → M7**.
Правила параллели M2 ∥ M4 (отдельные git worktree): схему БД менять нельзя (всё в M1); у каждого свой `PORT` и своя тестовая БД `leetcopy_test_<имя worktree>` (helper в M1 создаёт и мигрирует её автоматически); конфликты в `package.json`/`.env.example`/`CLAUDE.md` разрешает оркестратор; порядок слияния — сначала M2, затем M4. M4 вправе исправлять ошибки в `problems/`, найденные `problems:verify`, и обязан их перечислить в отчёте.

### M0 — Каркас
- **AC-M0-1** `pnpm install && pnpm dev` поднимает приложение (порт из `PORT`, дефолт 3000), главная 200.
- **AC-M0-2** `docker compose up -d --wait` поднимает Postgres 16 с healthcheck; `.env.example` содержит все переменные из раздела 7; `.env` в `.gitignore`.
- **AC-M0-3** Все scripts из раздела 7 существуют (нереализованные завершаются с понятным «not implemented yet» и кодом ≠ 0, кроме `lint`/`typecheck`/`test`/`dev`/`build`/`start`, которые работают). `pnpm lint`, `pnpm typecheck`, `pnpm test` (≥1 тест) и `pnpm build` проходят.
- **AC-M0-4** TypeScript `strict`, алиас `@/`, Tailwind + shadcn/ui, конфиг env с Zod-валидацией (`src/server/env.ts`).
- **AC-M0-5** `README.md` (запуск с нуля) и короткий `CLAUDE.md` с конвенциями (команды, структура, ключевые правила этого плана).
- **AC-M0-6** `git init`, ветка `main`, корректный `.gitignore`, первый коммит с каркасом и `PLAN.md` (единственный разрешённый коммит прямо в `main`). Дальше — ветки `feature/<m#-name>`.
- **AC-M0-7** Layout: хедер (логотип, Problems, Login), переключатель темы (system по умолчанию), адаптив от 360 px.

### M1 — БД, типы, пайплайн задач
- **AC-M1-1** Схема из раздела 4 в Drizzle; `pnpm db:migrate` применяется на пустую БД без ошибок; миграция откатов не требует.
- **AC-M1-2** Zod-схемы `meta.json`/`tests.json`; `pnpm problems:import` — идемпотентный upsert по slug (повтор не плодит дублей, теги создаются, тесты заменяются транзакцией, `--prune` снимает с публикации отсутствующие).
- **AC-M1-3** Импорт падает с понятным сообщением и ненулевым кодом при: значении теста, не соответствующем типу; ключах `input` ≠ именам параметров; нет sample; < 5 тестов; нет `solution.py`/`solution.js`; битом JSON; int вне ±(2^53−1); `signature.name`/параметрах, не являющихся валидными идентификаторами Python и JS или зарезервированных словах; `compare.mode=float` без `epsilon`; дубликате `number`/`slug`.
- **AC-M1-4** Общий валидатор значений по типу (`src/lib/types/`) используется импортёром и (позже) клиентом/сервером для custom input. Генератор шаблонов покрыт golden-файлами для всех типов (`int`, `float`, `bool`, `string`, `T[]`, `T[][]`) в обоих языках.
- **AC-M1-5** ≥15 seed-задач: ≥6 easy, ≥6 medium, ≥3 hard, ≥8 разных тегов, у каждой ≥8 тестов (2–3 sample, плюс edge cases). Описания написаны с нуля; в отчёте перечислены задачи, формулировка которых близка к известному источнику, и почему это допустимо. Корректность данных финально гарантируется `problems:verify` (M4).
- **AC-M1-6** `pnpm db:seed` на чистой БД даёт 15+ опубликованных задач.
- **AC-M1-7** Test helper (`tests/helpers/db.ts`): создаёт/мигрирует изолированную тестовую БД на worktree/процесс (`leetcopy_test_<suffix>`), даёт фабрики users/problems/submissions и очистку между тестами. Integration-тесты схемы (уникальности, каскады, CHECK/enum) проходят.

### M2 — Аутентификация (параллельно с M4)
- **AC-M2-1** `/register`: email, username, пароль (≥8). Успех → cookie-сессия и редирект на `/problems` (на этом этапе заглушка-страница; реальный каталог — M3).
- **AC-M2-2** Ошибки: дубликат email/username → 409 + inline-сообщение; невалидный ввод → 400 + inline; email приводится к lowercase при регистрации и логине; пароль хранится только как argon2id.
- **AC-M2-3** `/login`: неверные данные → общее «Invalid email or password» (для несуществующего email выполняется dummy-hash сравнение, чтобы выровнять время).
- **AC-M2-4** Хедер показывает username и меню (Profile, Submissions, Logout) для авторизованных; Login/Register для гостей; logout очищает cookie. `getCurrentUser()` и `requireUser()` — единственные точки доступа к сессии.
- **AC-M2-5** Заглушки `/problems`, `/submissions`, `/u/[username]` существуют (их заменят M3/M6). `/submissions` для гостя → редирект на `/login?next=/submissions`; после входа возврат на `next`. `next` проходит валидацию из раздела 6 (unit-тесты на `//evil.com`, `https://…`, `/\evil`, `javascript:`).
- **AC-M2-6** Общий helper `assertSameOrigin()` и проверка `Content-Type` для всех мутирующих handlers, тесты: чужой Origin → 403, без Origin → допускается.
- **AC-M2-7** Cookie: `httpOnly`, `SameSite=Lax`, `Secure` в prod; JWT подписан `AUTH_SECRET`; просроченный/подделанный токен → гость. Integration-тесты: регистрация, дубликат, логин ok/fail, logout, защищённый маршрут, подделанный токен.

### M4 — Judge: executor, harness, worker (параллельно с M2)
- **AC-M4-1** `pnpm sandbox:build` собирает оба образа: pinned базовые образы, `USER 65534`, размер < 200 МБ (проверка `docker image inspect`), harness внутри образа.
- **AC-M4-2** Harness py/js реализует протокол раздела 5 (stdin → кадры с nonce); `print` пользователя не ломает кадры; подделанный пользователем кадр без верного nonce не влияет на вердикт.
- **AC-M4-3** Единый TS-компаратор (`worker/judge.ts`) для `exact`/`unordered`/`float` покрыт unit-тестами: `[]`, вложенные массивы, `-0` равен `0`, `-0.0` равен `0.0` в пределах epsilon, multiset-семантика `unordered`, `$nonJson` маркеры, int/float различие, `true` ≠ `1`.
- **AC-M4-4** Очередь: атомарный claim (`UPDATE … WHERE id=(SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`) ставит `running`, `started_at`, `worker_id`. Integration-тест со stub-executor (без Docker): 20 посылок, 2 параллельных worker-цикла → каждая выполнена ровно один раз и все в финальном статусе. Sweep (старт и каждые 30 с): `running` со `started_at` старше `STALE_RUNNING_MIN` → `internal_error` («worker crashed or timed out»), свежие `running` не трогаются (тест). Повторный requeue не делается. Финализация только `WHERE id=? AND status='running'`.
- **AC-M4-5** Integration-тесты на реальном Docker для **каждого** языка и фикстурной задачи:
  - верное решение → `accepted`, `passed_count == total_count`, `runtime_ms`/`memory_kb` заполнены;
  - неверное → `wrong_answer`, `failed_case` с input/expected/actual, `failed_test_index`;
  - бесконечный цикл на тесте 1 → `time_limit` через harness за ≤ `effective_limit + 3 с`; цикл, который глотает исключение таймаута (`except BaseException: pass`) → `time_limit` через wall-clock за ≤ `wall + 2 с`; `passed_count` отражает прошедшие тесты до зависшего;
  - выделение памяти ≈ 4× лимита → `memory_limit` (Python и Node, включая heap abort);
  - исключение → `runtime_error`, текст ошибки не содержит ни путей хоста/temp, ни слова `harness`;
  - синтаксическая ошибка → `compile_error` (до первого теста);
  - `sys.exit(0)`/`process.exit(0)` до результата → `runtime_error`;
  - вывод > 64 KB → `stdout` ≤ 64 KB с `[truncated]`, вердикт нормальный;
  - `os.write(1, …)` в цикле (флуд stdout) → worker обрезает/убивает по лимиту 1 МБ, вердикт не `internal_error`;
  - функция не найдена → `runtime_error` «function X not found»;
  - async-функция в JS → `runtime_error`.
- **AC-M4-6** Security-тесты (каждый — отдельный фикстурный код, ожидание конкретное):
  - сеть: коннект к `1.1.1.1` и DNS-резолв падают → `runtime_error`;
  - запись в `/`, `/sandbox` падает (`EROFS`/`EACCES`); запись в `/tmp` до 16 МБ проходит, сверх — падает;
  - fork-bomb → `runtime_error` или `time_limit` в пределах wall-clock; после теста `docker ps -a --filter label=lemmayard.sandbox=1 -q` пуст и docker отвечает;
  - `os.getuid() != 0`; `CapEff` в `/proc/self/status` равен 0; `/var/run/docker.sock` не существует;
  - `/proc/1/environ` и окружение процесса не содержат `DATABASE_URL`, `AUTH_SECRET`, `POSTGRES_PASSWORD` и путей проекта.
- **AC-M4-7** `pnpm problems:verify` прогоняет `solution.py` и `solution.js` каждой задачи через реальный executor на **всех** тестах: все задачи × 2 языка → `accepted`; при расхождении — ненулевой код и список. Это гейт качества seed-данных.
- **AC-M4-8** После прогона `docker ps -a --filter label=lemmayard.sandbox=1 -q` пуст; контейнер удаляется в `finally`; при старте worker чистит осиротевшие и валидирует наличие образов (тест: отсутствует образ → понятная ошибка при старте).
- **AC-M4-9** `execFile` с массивом аргументов везде (grep-проверка отсутствия `exec(`/shell-строк в `worker/`), env не пробрасывается в контейнер.

### M3 — Каталог и страница задачи (после M2)
- **AC-M3-1** `/problems`: таблица (иконка статуса, №, title, acceptance %, difficulty с цветом), `PAGE_SIZE` на страницу, `?page=` в URL.
- **AC-M3-2** Фильтры в URL: `q` (title, без регистра), `difficulty`, `tag`, `status`. Комбинируются; empty state. Гость: `status` игнорируется (не 400), колонка статуса скрыта.
- **AC-M3-3** Acceptance = accepted submit / все submit (кроме `internal_error`); 0 посылок → «—». Статусы solved/attempted/todo по моим посылкам. Тесты на фикстурах (≥45 задач и посылки, вставленные через Drizzle), а не только на seed.
- **AC-M3-4** `/problems/[slug]`: split-layout (описание слева; справа placeholder редактора и консоль), markdown (код, списки, таблицы), sample-блоки Input/Output, difficulty и теги. Неизвестный или unpublished slug → 404.
- **AC-M3-5** Markdown-санитизация, unit-тесты: `<script>`, `<img onerror>`, `[x](javascript:alert(1))` не исполняются/не рендерятся живыми.
- **AC-M3-6** На <768 px split → вкладки Description / Code.
- **AC-M3-7** Query-count тест (Drizzle logger): `/problems` делает ≤ 3 запросов за рендер (страница, статусы пользователя, агрегат acceptance), без N+1.

### M5 — Run / Submit end-to-end (после M3 и M4)
- **AC-M5-1** Monaco: подсветка, выбор Python/JavaScript; при выборе подставляется шаблон; per-language буфер в состоянии компонента — код не затирается при переключении туда-обратно. Monaco грузится локально (нет запросов к CDN — проверка в e2e по сетевым запросам), `Ctrl/Cmd+Enter` = Run, `Ctrl/Cmd+Shift+Enter` = Submit через `editor.addCommand`, в tooltip кнопок.
- **AC-M5-2** Черновик автосохраняется в localStorage по `(slug, language)`, восстанавливается после reload; Reset (с подтверждением) возвращает шаблон.
- **AC-M5-3** Run: гость → редирект на login; авторизованный → индикатор «Queued…»/«Running…», затем консоль: по каждому sample (input / expected / output, pass/fail), «Passed N/N samples», время.
- **AC-M5-4** Custom input: вкладка Testcase, JSON-объект по именам параметров; валидируется общим валидатором (M1) на клиенте и сервере; невалидный блокирует Run с понятной ошибкой; результат — только Output.
- **AC-M5-5** Submit: вердикт цветом, `passed/total`, runtime, memory; для Wrong Answer — первый упавший кейс (input, expected, actual) и stdout; для Runtime/Compile Error — текст ошибки.
- **AC-M5-6** Во время выполнения Run/Submit блокируются. Ожидающий `submissionId` хранится в `sessionStorage` по slug; после reload опрос возобновляется (не зависит от M6).
- **AC-M5-7** Негативные случаи (каждый — тест, и каждый **не создаёт** строк): неверный Content-Type/Origin → 403; без сессии → 401; невалидный body → 400; код > `MAX_CODE_BYTES` (в байтах) → 413; `\u0000` → 400; неизвестный/unpublished slug → 404; превышение частоты или активного лимита → 429 + `Retry-After`; чужой `submissions/:id` → 404.
- **AC-M5-8** Hidden-тесты не уходят на клиент: в ответах API и payload страницы нет `input/expected` hidden-кейсов, кроме первого упавшего при WA (unit-тест сериализации DTO).
- **AC-M5-9** Run-посылки не попадают в историю, acceptance rate и solved.
- **AC-M5-10** Таймауты UI: `queued` дольше `QUEUED_TIMEOUT_MS` (дефолт 60 с, настраиваемо) → «Judge is unavailable, try again later»; `running` дольше `WALL_CAP_MS + 30 с` → «Taking longer than expected» со ссылкой на `/submissions/:id`. Без бесконечных спиннеров.
- **AC-M5-11** Worker чистит `kind=run` старше 24 ч в своём sweep.

### M6 — История и профиль (после M5)
- **AC-M6-1** `/submissions`: мои submit-посылки (пагинация, новые сверху): время, задача (ссылка), язык, вердикт (цвет), runtime, memory; `?problem=slug`.
- **AC-M6-2** `/submissions/[id]`: вердикт, метрики, код в read-only Monaco, failed case; только владелец (иначе 404).
- **AC-M6-3** Вкладка Submissions на странице задачи показывает мои посылки по задаче; клик открывает посылку.
- **AC-M6-4** `/u/[username]`: решено easy/medium/hard (счётчик и прогресс от общего числа опубликованных), всего submit-посылок, acceptance rate, последние 10 **уникальных** решённых задач (задача + дата первого accepted). Страница публична, код чужих посылок не показывает.
- **AC-M6-5** «Решено» считается по уникальным задачам (повторный accepted не увеличивает); unit/integration-тест на подсчёт.

### M7 — Hardening, полировка, e2e, документация
- **AC-M7-1** `pnpm test:e2e`: Playwright сам поднимает web (`pnpm build && pnpm start`) и worker против мигрированной и засеянной `TEST_DATABASE_URL`. Сценарии: «регистрация → Two Sum → верное решение → Submit → Accepted → задача solved в профиле» для Python **и** JavaScript; сценарий Wrong Answer. В Monaco код вставляется через клик и `page.keyboard.insertText` (есть `data-testid`).
- **AC-M7-2** Empty states, loading-скелетоны, error boundary на всех страницах; в консоли браузера нет необработанных ошибок на основных сценариях (проверка в e2e).
- **AC-M7-3** a11y: `@axe-core/playwright` — 0 serious/critical на `/login`, `/problems`, `/problems/two-sum` в обеих темах; Tab достигает Run и Submit (проверка в Playwright).
- **AC-M7-4** Безопасность: секреты только из env; в логах worker и web нет паролей и полного кода пользователя (тест: submit с маркерной строкой, grep логов); `pnpm audit --prod` без critical, допустимые исключения задокументированы в README.
- **AC-M7-5** Цели по производительности (измерение на `pnpm build && pnpm start`, прогрев образов): p95 Run Two Sum на Python < 5 с по 20 последовательным запускам; `/problems` TTFB p95 < 300 мс на seed. Результаты замеров приложены в отчёт; это цели, не жёсткий блокер, при промахе — объяснение.
- **AC-M7-6** README: запуск с нуля, архитектура, как добавить задачу (пример), как добавить язык (контракт harness), как запускать тесты, принятые свойства MVP (раздел 1).
- **AC-M7-7** Проверка с нуля на чистом клоне: `cp .env.example .env`, `pnpm run setup`, `pnpm dev:all` → регистрация и решение задачи работают; `lint`, `typecheck`, unit, integration, e2e зелёные, `problems:verify` зелёный.

---

## 9. Нефункциональные требования
- Падение контейнера/Docker не валит worker: посылка → `internal_error`, worker продолжает.
- Пользовательский код выполняется только в Docker-песочнице — всегда, в том числе в тестах.
- Внешние данные валидируются Zod; SQL только через Drizzle.
- Конфиг — через env с дефолтами. Логи worker — структурированный JSON (id, язык, вердикт, длительность), без кода пользователя.

## 10. Тестирование
- **Unit** (Vitest): шаблоны (golden), компараторы, Zod, валидатор типов, `next`-санитайзер, подсчёт статистики, сериализация DTO.
- **Integration** (Vitest, реальные Postgres и Docker): executor, очередь, API, auth. Отдельный скрипт `test:integration`.
- **E2E** (Playwright).

## 11. Порядок работы (оркестрация)
1. Каждый субагент перед стартом читает `PLAN.md` и `CLAUDE.md` целиком.
2. Один milestone = ветка `feature/<m#-name>` = один implementer-субагент (Opus). M2 ∥ M4 в отдельных worktree по правилам раздела 8.
3. Делается только то, что в АС milestone. Без спекулятивного кода и несвязанных рефакторингов.
4. После implementer: независимый reviewer (проверяет АС по коду, ищет баги и дыры безопасности) и tester (запускает и ломает: тесты, ручной прогон, граничные случаи). Находки → fix-агент → повторная проверка. Цикл до тех пор, пока все АС pass и критичных находок нет.
5. Оркестратор сам перезапускает `pnpm lint && pnpm typecheck && pnpm test` (+ `test:integration` для M1–M7) и выборочно проверяет АС, не полагаясь на отчёт.
6. Отчёт: таблица `AC-ID → pass/fail/skipped → чем проверено`. Непроверенный АС = невыполненный.
7. Коммиты небольшие и осмысленные. Прямые коммиты в `main` запрещены (кроме первого скаффолд-коммита). Слияние в `main` — после проверки оркестратора; финальный push/деплой — только по команде Влада.
8. Отход от плана (ограничение платформы, конфликт АС) — останавливаться и описывать, молча не менять.

## 12. Риски
| Риск | Митигация |
|---|---|
| Медленный старт контейнера | один контейнер на посылку, prebuilt образы, замеры в AC-M7-5 |
| Побег из песочницы / DoS хоста | флаги раздела 5, лимит вывода, labels + cleanup, тесты AC-M4-6 |
| Различия int/float/-0 Python vs JS | сравнение только в TS, int ограничен ±(2^53−1), маркеры `$nonJson` |
| Flaky TLE | wall-clock как гарантия, множитель языка, ограниченная конкурентность |
| Ошибки в авторских тестах/решениях | `problems:verify` на обоих языках |
| Права на условия | оригинальные формулировки |

## 13. Фаза деплоя (после M7 и фич; по команде Влада)

Цель Влада: переименовать репозиторий, деплой на личный Vercel, бэкенд (БД) на личном Supabase.
- БД: Supabase Postgres. Drizzle + `pg` работают; для serverless использовать pooled connection string (transaction mode), `FOR UPDATE SKIP LOCKED` и `pg_advisory_xact_lock` внутри транзакции совместимы; миграции гонять напрямую (не через pooler).
- Проблема: worker на хосте с Docker не запускается на Vercel/Supabase. Варианты (решает оркестратор в деплой-фазе): (a) `VercelSandboxExecutor` за интерфейсом `Executor` (Vercel Sandbox = изолированные microVM) + запуск проверки из Vercel Functions/Cron/Queues вместо долгоживущего worker; (b) отдельный маленький VPS только под worker+Docker. Рекомендация: (a), если Vercel Sandbox покрывает наши лимиты (память, время, нет сети, Python 3 и Node); иначе (b).
- Секреты только через env Vercel; `AUTH_SECRET` новый; `AUTH_URL` = боевой домен; проверка Origin уже завязана на нём.
- Переименование: новое имя из `scratchpad/branding/NAMING.md`; заменить `leetcopy` в package.json, образах (`leetcopy-sandbox-*`), cookie `leetcopy_session`, label `leetcopy.sandbox`, README, UI-текстах; переименовать репозиторий/папку; деплой, домен и любые внешние действия — только после явного ОК Влада.
