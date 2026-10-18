// Database URL for e2e spec helpers that insert or delete rows directly.
// Refuses anything but the harness database, so a spec can never write to
// the dev database from .env (e.g. when run with a hand-made config).
import { E2E_DB_PREFIX } from "./env";

export function e2eDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  const name = url ? decodeURIComponent(new URL(url).pathname.slice(1)) : "(unset)";
  if (!url || !name.startsWith(E2E_DB_PREFIX)) {
    throw new Error(
      `e2e specs only touch ${E2E_DB_PREFIX}* databases, got "${name}". Run them through playwright.config.ts (pnpm test:e2e).`,
    );
  }
  return url;
}
