// AC-M7-4 (static half; the runtime half is
// tests/integration/no-secrets-in-logs.test.ts): no logging call in the web
// app or the worker passes a request body, user code, stdout, custom input or
// a password. Comments and string literals are stripped first, then the
// arguments of every console.* / logError / worker log / stream write call
// are checked for those identifiers.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|mts|js|mjs)$/.test(name) ? [full] : [];
  });
}

/** Source with comments and string/template literals blanked (keeps offsets readable enough). */
function stripLiterals(source: string): string {
  return source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g,
    (m) => (m.startsWith("/") ? " " : '""'),
  );
}

const CALL = /\b(?:console\.(?:log|info|warn|error|debug|trace)|logError|log|jsonLogger|process\.(?:stdout|stderr)\.write)\s*\(/g;

/** The argument text of every logging call (balanced parentheses). */
function loggingCalls(source: string): string[] {
  const text = stripLiterals(source);
  const calls: string[] = [];
  for (const match of text.matchAll(CALL)) {
    // `function log(`, `.log(` on other objects than console are not logging calls we own.
    const before = text.slice(Math.max(0, match.index - 10), match.index);
    if (/function\s+$|\.$/.test(before) && !match[0].startsWith("console") && !match[0].startsWith("process")) continue;
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < text.length; end += 1) {
      if (text[end] === "(") depth += 1;
      else if (text[end] === ")" && --depth === 0) break;
    }
    calls.push(text.slice(match.index, end + 1));
  }
  return calls;
}

// Identifiers that hold user input; `x: value` object keys are allowed only
// when the value is not one of them (the check sees the value identifier).
const FORBIDDEN =
  /(?<![\w$.])(?:password|passwordHash|code|stdout|stderr|customInput|body)(?![\w$])(?!\s*:)|(?<!\bprocess)\.(?:password|passwordHash|stdout|customInput|body)\b|\b(?:job|submission|claimed|data|values|payload|input|row|sub)\.code\b|\b(?:request|req)\.(?:json|text|formData)\s*\(/;

function offendingCalls(source: string): string[] {
  return loggingCalls(source).filter((call) => FORBIDDEN.test(call));
}

describe("the checker", () => {
  it("flags logged secrets and user input", () => {
    for (const bad of [
      "console.log(password)",
      "console.error('x', job.code)",
      "logError('e', err, { code })",
      "log({ level: 'info', msg: 'x', stdout: result.stdout })",
      "console.info(await request.json())",
      "console.debug(body)",
      "process.stderr.write(submission.code)",
    ]) {
      expect(offendingCalls(bad), bad).toHaveLength(1);
    }
  });

  it("ignores literals, comments, error codes and safe fields", () => {
    for (const ok of [
      'console.error("password=[redacted]")',
      "// console.log(password)\n",
      "logError('db', error, { kind })",
      "log({ level: 'error', msg: 'x', reason: safeErrorMessage(error), workerId })",
      "console.error(`worker: ${error.message}`)",
      "const code = error.code; console.log(error.code)",
    ]) {
      expect(offendingCalls(ok), ok).toEqual([]);
    }
  });
});

describe("no logging of request bodies, code or passwords", () => {
  const files = ["src", "worker"].flatMap((d) => sourceFiles(path.join(process.cwd(), d)));

  it("finds the logging sites", () => {
    const all = files.flatMap((f) => loggingCalls(readFileSync(f, "utf8")));
    expect(all.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))("%s", (_rel, file) => {
    expect(offendingCalls(readFileSync(file, "utf8"))).toEqual([]);
  });
});
