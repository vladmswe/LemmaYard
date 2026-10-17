// Runs the Next.js CLI with variables from .env loaded first, so PORT from .env
// is respected (Next itself reads PORT before it loads .env). Variables already
// set in the shell take precedence over .env.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

if (existsSync(".env")) process.loadEnvFile(".env");

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 1));
