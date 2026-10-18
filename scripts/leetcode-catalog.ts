// `pnpm leetcode:catalog --input <data.json> --commit <sha> [--date YYYY-MM-DD]`
//
// Regenerates src/server/leetcode/catalog.json from zerotrac's MIT dataset
// (docs/specs/leetcode-integration.md §6.4) and updates the dataset commit
// and date in src/server/leetcode/NOTICE.md. OFFLINE: the maintainer
// downloads data.json first, pinned to a commit of the dataset repository:
//
//   git ls-remote https://github.com/zerotrac/leetcode_problem_rating refs/heads/main
//   curl -fL -o /tmp/data.json \
//     https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/<sha>/data.json
//   pnpm leetcode:catalog --input /tmp/data.json --commit <sha>
//
// This script never makes a network request and never contacts leetcode.com.
// Review the diff (git diff --stat) and commit catalog.json with NOTICE.md.
// The overlay (overlay.json: tags, difficulty overrides, flags, extra
// problems) is never touched.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { buildCatalog, serializeCatalog, summaryLine, updateNotice, SKIP_REASONS } from "@/lib/leetcode/generate";

const DEFAULT_OUT = "src/server/leetcode/catalog.json";
const DEFAULT_NOTICE = "src/server/leetcode/NOTICE.md";

/** Write next to the target, then rename: a reader never sees a half-written file. */
function writeAtomic(file: string, text: string): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, file);
}

function main(): number {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      commit: { type: "string" },
      date: { type: "string" },
      out: { type: "string", default: DEFAULT_OUT },
      notice: { type: "string", default: DEFAULT_NOTICE },
      // Tests only: the minimum number of valid records.
      min: { type: "string" },
    },
  });
  if (!values.input || !values.commit) {
    console.error("usage: pnpm leetcode:catalog --input <data.json> --commit <40-hex sha> [--date YYYY-MM-DD]");
    return 1;
  }
  if (!/^[0-9a-f]{40}$/.test(values.commit)) {
    console.error("leetcode:catalog failed: --commit must be the full 40-character commit sha of the dataset");
    return 1;
  }
  const date = values.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("leetcode:catalog failed: --date must be YYYY-MM-DD");
    return 1;
  }
  const minRecords = values.min === undefined ? undefined : Number(values.min);
  if (minRecords !== undefined && (!Number.isInteger(minRecords) || minRecords < 0)) {
    console.error("leetcode:catalog failed: --min must be a whole number");
    return 1;
  }

  let input: unknown;
  try {
    input = JSON.parse(readFileSync(values.input, "utf8"));
  } catch (error) {
    console.error(`leetcode:catalog failed: cannot read ${values.input} as JSON (${error instanceof Error ? error.message : "error"})`);
    return 1;
  }
  const result = buildCatalog(input, { commit: values.commit, date, minRecords });
  if (result.skipped) {
    for (const reason of SKIP_REASONS) {
      if (result.skipped[reason] > 0) console.log(`skipped (${reason}): ${result.skipped[reason]}`);
    }
  }
  if (!result.ok) {
    console.error(`leetcode:catalog failed, nothing was written: ${result.error}`);
    return 1;
  }
  writeAtomic(values.out, serializeCatalog(result.catalog));
  const notice = readFileSync(values.notice, "utf8");
  const next = updateNotice(notice, values.commit, date);
  if (next !== notice) writeAtomic(values.notice, next);
  console.log(summaryLine(result.catalog, result.skipped));
  return 0;
}

process.exit(main());
