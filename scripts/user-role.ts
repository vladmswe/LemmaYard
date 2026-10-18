// `pnpm user:role <email> <role>`: sets users.role (user | moderator | admin)
// for the account with that email (docs/specs/community.md §B.10). The only
// way to grant moderation rights: there is no UI for it. Uses
// DATABASE_URL_DIRECT (falls back to DATABASE_URL), like db:migrate.
import { existsSync } from "node:fs";

import { createDb, directDatabaseUrl } from "@/server/db";
import { describeDbTarget } from "@/server/db/config";
import { roleArgsSchema, setUserRole } from "@/server/community/roles";

async function main(): Promise<number> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const [email, role] = process.argv.slice(2).filter((a) => a !== "--");
  const args = roleArgsSchema.safeParse({ email, role });
  if (!args.success) {
    console.error(`Usage: pnpm user:role <email> <user|moderator|admin>\n${args.error.issues.map((i) => `  ${i.message}`).join("\n")}`);
    return 2;
  }
  const url = directDatabaseUrl();
  console.log(`Database: ${describeDbTarget(url)}`);
  const { db, pool } = createDb(url);
  try {
    const result = await setUserRole(db, args.data.email, args.data.role);
    if (!result) {
      console.error("No account with that email.");
      return 1;
    }
    console.log(`${result.username}: ${result.previous} -> ${args.data.role}`);
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("user:role failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
