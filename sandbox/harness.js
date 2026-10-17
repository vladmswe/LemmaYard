// JavaScript judge runner, baked into the sandbox image (PLAN.md section 5).
//
// Protocol: reads ONE line of JSON from stdin
//   {language, code, signature, tests: [{input}], timeLimitMs, stopOnError, nonce}
// and writes frames "\n@@<nonce>@@<json>\n" to the real stdout (fd 1):
//   {kind:"compile_error", error}
//   {kind:"fatal", status:"error"|"timeout", error, stdout, memoryKb}
//   {kind:"test", index, status:"ok"|"error"|"timeout", actual?, error?, timeMs,
//    stdout, memoryKb}
//   {kind:"done", stdout, memoryKb}
// `stdout` in a frame is the user output captured since the previous frame.
// Values that JSON cannot represent are sent as {"$nonJson":"undefined"|"NaN"|
// "Infinity"|"-Infinity"}. Expected values never enter the container.
"use strict";

const fs = require("node:fs");
const util = require("node:util");
const vm = require("node:vm");
const crypto = require("node:crypto");

const USER_FILE = "solution.js";
const STDOUT_LIMIT = 64 * 1024;
const TRUNCATED = "\n[truncated]";
const ERROR_LIMIT = 8 * 1024;
const ACTUAL_LIMIT = 256 * 1024;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function writeAll(data) {
  let buf = Buffer.from(data, "utf8");
  while (buf.length > 0) {
    try {
      const n = fs.writeSync(1, buf);
      buf = buf.subarray(n);
    } catch (err) {
      if (err && err.code === "EAGAIN") continue;
      throw err;
    }
  }
}

/** The first `bytes` bytes of `text` in UTF-8, never splitting a character. */
function cutBytes(text, bytes) {
  const data = Buffer.from(text, "utf8");
  if (data.length <= bytes) return text;
  let end = Math.max(bytes, 0);
  while (end > 0 && (data[end] & 0xc0) === 0x80) end--;
  return data.subarray(0, end).toString("utf8");
}

function limitText(text, limit) {
  if (Buffer.byteLength(text) <= limit) return text;
  return cutBytes(text, limit - Buffer.byteLength(TRUNCATED)) + TRUNCATED;
}

function createCapture() {
  let used = 0;
  let truncated = false;
  let pending = [];
  const room = STDOUT_LIMIT - Buffer.byteLength(TRUNCATED);
  return {
    write(text) {
      if (truncated || text.length === 0) return;
      const size = Buffer.byteLength(text);
      if (used + size <= room) {
        pending.push(text);
        used += size;
      } else {
        pending.push(cutBytes(text, room - used) + TRUNCATED);
        used = STDOUT_LIMIT;
        truncated = true;
      }
    },
    take() {
      const out = pending.join("");
      pending = [];
      return out;
    },
  };
}

/** Error text restricted to frames of the user's solution.js. */
function formatError(err) {
  let text;
  try {
    if (err && typeof err === "object" && typeof err.stack === "string") {
      const lines = err.stack.split("\n");
      const kept = lines.filter((line) => {
        if (!/^\s+at /.test(line)) return true;
        return line.includes(USER_FILE) && !line.includes("node:");
      });
      text = kept.join("\n");
    } else {
      text = "Uncaught " + util.inspect(err);
    }
  } catch {
    text = "Error";
  }
  text = text.split(__filename).join("<runner>").split("/sandbox/").join("");
  return limitText(text.replace(/\s+$/, ""), ERROR_LIMIT);
}

function memoryKb() {
  // maxRSS is reported in kilobytes.
  return process.resourceUsage().maxRSS;
}

function isIntType(type) {
  return type.replace(/(\[\])+$/, "") === "int";
}

function main(line) {
  const payload = JSON.parse(line);
  const prefix = "\n@@" + payload.nonce + "@@";
  delete payload.nonce;
  const { code, signature, tests, timeLimitMs } = payload;
  const stopOnError = Boolean(payload.stopOnError);
  const capture = createCapture();

  function emit(frame) {
    if (!("stdout" in frame)) frame.stdout = capture.take();
    if (!("memoryKb" in frame)) frame.memoryKb = memoryKb();
    writeAll(prefix + JSON.stringify(frame) + "\n");
  }

  // 1. Compile in memory. Errors here are compile errors, before any test.
  let script;
  try {
    script = new vm.Script(code, { filename: USER_FILE });
  } catch (err) {
    emit({ kind: "compile_error", error: formatError(err) });
    return;
  }

  const print = (...args) => capture.write(util.format(...args) + "\n");
  const sandboxConsole = {
    log: print,
    info: print,
    warn: print,
    error: print,
    debug: print,
    trace: print,
    dir: (value) => capture.write(util.inspect(value) + "\n"),
  };
  const context = vm.createContext(
    { console: sandboxConsole },
    { microtaskMode: "afterEvaluate" },
  );

  // Helpers created inside the context before user code runs: they capture the
  // context's JSON.parse/JSON.stringify functions before user code can replace
  // them. This is not tamper-proof: user code can still change what those
  // functions see (Array/Object.prototype.toJSON, getters, a Proxy result),
  // so it can change its own `actual`. That is harmless: frames are written by
  // `emit` with the outer realm's JSON and builtins, which context code cannot
  // reach through these helpers, and expected values are not in the container.
  const hook = "__lc_" + crypto.randomBytes(8).toString("hex");
  const helpers = new vm.Script(`(function () {
    "use strict";
    const parse = JSON.parse, stringify = JSON.stringify;
    const isNaNf = Number.isNaN, MAX = Number.MAX_SAFE_INTEGER;
    let job = null;
    function encode(value, intType) {
      if (value === undefined) return { $nonJson: "undefined" };
      if (typeof value === "number") {
        if (isNaNf(value)) return { $nonJson: "NaN" };
        if (value === Infinity) return { $nonJson: "Infinity" };
        if (value === -Infinity) return { $nonJson: "-Infinity" };
        if (intType && Number.isInteger(value) && (value > MAX || value < -MAX)) {
          throw new RangeError("integer result outside the range ±(2^53−1)");
        }
      }
      if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
        throw new TypeError("not serializable");
      }
      return value;
    }
    function run() {
      const { fn, argsJson, intType } = job;
      job = null;
      const args = parse(argsJson);
      const result = fn.apply(undefined, args);
      if (result !== null && (typeof result === "object" || typeof result === "function") &&
          typeof result.then === "function") {
        return { async: true };
      }
      let text;
      try {
        text = stringify(encode(result, intType), function (key, value) {
          return key === "" ? value : encode(value, intType);
        });
      } catch (err) {
        if (err instanceof RangeError && String(err.message).indexOf("±") >= 0) throw err;
        return { unserializable: true };
      }
      return { text };
    }
    return { set(j) { job = j; }, run };
  })()`).runInContext(context);
  Object.defineProperty(context, hook, { value: helpers.run, enumerable: false });
  const runner = new vm.Script(`${hook}()`, { filename: "runner" });

  const timeout = Math.max(1, Math.round(timeLimitMs));
  const isTimeout = (err) => err && err.code === "ERR_SCRIPT_EXECUTION_TIMEOUT";

  // 2. Run top-level code under the time limit.
  try {
    script.runInContext(context, { timeout, displayErrors: false });
  } catch (err) {
    if (isTimeout(err)) {
      emit({ kind: "fatal", status: "timeout", error: "Time limit exceeded" });
    } else {
      emit({ kind: "fatal", status: "error", error: formatError(err) });
    }
    return;
  }

  const name = signature.name;
  // The name goes into a script below: plain identifiers only (the importer
  // already enforces this; defense in depth against a row written without it).
  if (typeof name !== "string" || !IDENTIFIER.test(name)) {
    emit({ kind: "fatal", status: "error", error: "invalid function name" });
    return;
  }
  let fn;
  try {
    // `typeof` also finds top-level let/const/class bindings, which are not
    // properties of the context object, so the lookup stays a script.
    fn = vm.runInContext(`typeof ${name} === "function" ? ${name} : undefined`, context, {
      timeout,
    });
  } catch {
    fn = undefined;
  }
  if (typeof fn !== "function") {
    emit({ kind: "fatal", status: "error", error: `function ${name} not found` });
    return;
  }
  const intType = isIntType(signature.returns);

  // 3. Tests, one frame each.
  for (let index = 0; index < tests.length; index++) {
    const input = tests[index].input;
    // JS has a single number type: float parameters need no coercion.
    const args = signature.params.map((p) => input[p.name]);
    const frame = { kind: "test", index };
    helpers.set({ fn, argsJson: JSON.stringify(args), intType });
    const started = process.hrtime.bigint();
    let outcome;
    try {
      outcome = runner.runInContext(context, { timeout, displayErrors: false });
      frame.timeMs = Number(process.hrtime.bigint() - started) / 1e6;
      if (outcome.async) {
        frame.status = "error";
        frame.error = "async functions are not supported";
      } else if (outcome.unserializable) {
        frame.status = "error";
        frame.error = "return value not JSON-serializable";
      } else if (outcome.text.length > ACTUAL_LIMIT) {
        frame.status = "error";
        frame.error = "return value is too large";
      } else {
        frame.status = "ok";
        frame.actual = JSON.parse(outcome.text);
      }
    } catch (err) {
      frame.timeMs = Number(process.hrtime.bigint() - started) / 1e6;
      if (isTimeout(err)) {
        frame.status = "timeout";
      } else {
        frame.status = "error";
        frame.error = formatError(err);
      }
    }
    emit(frame);
    if (frame.status !== "ok" && (stopOnError || frame.status === "timeout")) return;
  }

  emit({ kind: "done" });
}

process.on("unhandledRejection", () => {});

const chunks = [];
let started = false;
process.stdin.on("data", (chunk) => {
  if (started) return;
  chunks.push(chunk);
  const all = Buffer.concat(chunks);
  const nl = all.indexOf(10);
  if (nl < 0) return;
  started = true;
  process.stdin.pause();
  main(all.subarray(0, nl).toString("utf8"));
  // Exit synchronously: no pending user callbacks or microtasks run afterwards.
  process.exit(0);
});
