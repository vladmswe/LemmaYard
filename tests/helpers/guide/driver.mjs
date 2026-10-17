// Runs a guide code sample (JavaScript) against its cases (PLAN-GUIDE 2.7).
// Reads {file, kind, entry, methods, cases} as JSON on stdin and prints
// {"results": [...]}. The file is evaluated as a plain script in a fresh vm
// context (like sandbox/harness.js), so the displayed code needs no exports;
// the entry is fetched by evaluating its name in that context.
// Authored lesson code only (trusted repo files), never user submissions.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const toJson = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v) ?? "null"));
const error = (e) => ({ $error: true, type: (e && e.constructor && e.constructor.name) || "Error" });

const job = JSON.parse(readFileSync(0, "utf8"));
const context = vm.createContext({});
new vm.Script(readFileSync(job.file, "utf8"), { filename: job.file }).runInContext(context);
const entry = vm.runInContext(job.entry, context);

const results = job.cases.map((c) => {
  if (job.kind === "function") {
    try {
      return toJson(entry(...c.args));
    } catch (e) {
      return error(e);
    }
  }
  let obj;
  try {
    obj = new entry();
  } catch (e) {
    return [error(e)];
  }
  return c.ops.map(([name, ...args]) => {
    try {
      return toJson(obj[job.methods[name]](...args));
    } catch (e) {
      return error(e);
    }
  });
});

process.stdout.write(JSON.stringify({ results }));
