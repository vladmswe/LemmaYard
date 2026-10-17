# Python judge runner, baked into the sandbox image (PLAN.md section 5).
#
# Protocol: reads ONE line of JSON from stdin
#   {language, code, signature, tests: [{input}], timeLimitMs, stopOnError, nonce}
# and writes frames "\n@@<nonce>@@<json>\n" to the real stdout (fd 1):
#   {kind:"compile_error", error}
#   {kind:"fatal", status:"error"|"timeout", error, stdout, memoryKb}
#   {kind:"test", index, status:"ok"|"error"|"timeout", actual?, error?, memory?,
#    timeMs, stdout, memoryKb}
#   {kind:"done", stdout, memoryKb}
# `stdout` in a frame is the user output captured since the previous frame.
# Expected values never enter the container; the worker judges.
import copy
import json
import linecache
import os
import resource
import signal
import sys
import time
import traceback

USER_FILE = "solution.py"
STDOUT_LIMIT = 64 * 1024
TRUNCATED = "\n[truncated]"
ERROR_LIMIT = 8 * 1024
ACTUAL_LIMIT = 256 * 1024
MAX_SAFE_INT = 2**53 - 1

_real_write = os.write


class _Timeout(BaseException):
    """Raised by SIGALRM. BaseException so `except Exception` cannot swallow it."""


class _Capture:
    """Replacement for sys.stdout/sys.stderr: keeps at most 64 KB of user output."""

    def __init__(self):
        self.used = 0
        self.truncated = False
        self.pending = []
        self.encoding = "utf-8"
        self.errors = "replace"

    def write(self, s):
        if not isinstance(s, str):
            raise TypeError("write() argument must be str, not %s" % type(s).__name__)
        if self.truncated or not s:
            return len(s)
        data = s.encode("utf-8", "replace")
        room = STDOUT_LIMIT - len(TRUNCATED.encode()) - self.used
        if len(data) <= room:
            self.pending.append(s)
            self.used += len(data)
        else:
            self.pending.append(data[: max(room, 0)].decode("utf-8", "ignore") + TRUNCATED)
            self.used = STDOUT_LIMIT
            self.truncated = True
        return len(s)

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    def flush(self):
        pass

    def isatty(self):
        return False

    def writable(self):
        return True

    def take(self):
        out = "".join(self.pending)
        self.pending = []
        return out


def _memory_kb():
    # Linux reports ru_maxrss in kilobytes.
    return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)


def _limit(text, limit=ERROR_LIMIT):
    data = text.encode("utf-8", "replace")
    if len(data) <= limit:
        return text
    suffix = "\n[truncated]"
    return data[: limit - len(suffix)].decode("utf-8", "ignore") + suffix


def _clean(text):
    # Never expose the runner's own file name or location.
    return text.replace(__file__, "<runner>").replace("/sandbox/", "")


def _format_error(exc):
    """Traceback restricted to frames of the user's solution.py."""
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == USER_FILE]
    lines = []
    if frames:
        lines.append("Traceback (most recent call last):\n")
        lines.extend(traceback.format_list(frames))
    lines.extend(traceback.format_exception_only(type(exc), exc))
    return _limit(_clean("".join(lines)).rstrip("\n"))


def _check_ints(value, depth=0):
    """Raises ValueError for ints outside ±(2^53−1) (JSON-unsafe for the judge)."""
    if depth > 64:
        return
    if isinstance(value, bool):
        return
    if isinstance(value, int):
        if value > MAX_SAFE_INT or value < -MAX_SAFE_INT:
            raise OverflowError("integer result outside the range ±(2^53−1)")
    elif isinstance(value, (list, tuple)):
        for item in value:
            _check_ints(item, depth + 1)
    elif isinstance(value, dict):
        for item in value.values():
            _check_ints(item, depth + 1)


def _to_float(value, type_name):
    """Coerces numbers to float for `float`, `float[]`, `float[][]` parameters."""
    if type_name == "float":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        return value
    if type_name.endswith("[]") and isinstance(value, list):
        inner = type_name[:-2]
        return [_to_float(v, inner) for v in value]
    return value


def main():
    line = sys.stdin.buffer.readline()
    payload = json.loads(line)
    nonce = payload.pop("nonce")
    code = payload["code"]
    signature = payload["signature"]
    tests = payload["tests"]
    time_limit = payload["timeLimitMs"] / 1000.0
    stop_on_error = bool(payload.get("stopOnError", False))
    del payload, line

    prefix = ("\n@@" + nonce + "@@").encode()
    del nonce
    capture = _Capture()

    main_pid = os.getpid()

    def emit(frame):
        if os.getpid() != main_pid:
            # A process forked by user code must never write frames.
            os._exit(1)
        frame.setdefault("stdout", capture.take())
        frame.setdefault("memoryKb", _memory_kb())
        data = prefix + json.dumps(frame, ensure_ascii=True).encode() + b"\n"
        while data:
            n = _real_write(1, data)
            data = data[n:]

    def on_alarm(_signum, _frame):
        raise _Timeout()

    def arm(seconds):
        signal.setitimer(signal.ITIMER_REAL, seconds)

    def disarm():
        signal.setitimer(signal.ITIMER_REAL, 0)

    signal.signal(signal.SIGALRM, on_alarm)

    # 1. Compile in memory. Errors here are compile errors, before any test.
    linecache.cache[USER_FILE] = (len(code), None, code.splitlines(True), USER_FILE)
    try:
        compiled = compile(code, USER_FILE, "exec", dont_inherit=True)
    except (SyntaxError, ValueError) as exc:
        emit({"kind": "compile_error", "error": _format_error(exc)})
        return

    # User output goes to the capture buffer, never to the frame stream.
    sys.stdout = sys.stderr = sys.__stdout__ = sys.__stderr__ = capture
    sys.stdin = sys.__stdin__ = open(os.devnull, "r")
    sys.setrecursionlimit(100000)

    # 2. Run module-level code under the time limit.
    namespace = {"__name__": "solution", "__builtins__": __builtins__}
    try:
        try:
            arm(time_limit)
            exec(compiled, namespace)
        finally:
            disarm()
    except _Timeout:
        emit({"kind": "fatal", "status": "timeout", "error": "Time limit exceeded"})
        return
    except Exception as exc:
        emit({"kind": "fatal", "status": "error", "error": _format_error(exc)})
        return

    name = signature["name"]
    params = signature["params"]
    cls = namespace.get("Solution")
    if not isinstance(cls, type) or not callable(getattr(cls, name, None)):
        emit({"kind": "fatal", "status": "error", "error": "function %s not found" % name})
        return

    # 3. Tests, one frame each.
    for index, test in enumerate(tests):
        raw = test["input"]
        args = [_to_float(copy.deepcopy(raw[p["name"]]), p["type"]) for p in params]
        frame = {"kind": "test", "index": index}
        started = time.perf_counter()
        try:
            try:
                arm(time_limit)
                result = getattr(cls(), name)(*args)
            finally:
                disarm()
            frame["timeMs"] = (time.perf_counter() - started) * 1000.0
            try:
                _check_ints(result)
                text = json.dumps(result, allow_nan=False)
            except OverflowError as exc:
                raise ValueError(str(exc))
            except (TypeError, ValueError, RecursionError):
                raise ValueError("return value not JSON-serializable")
            if len(text) > ACTUAL_LIMIT:
                raise ValueError("return value is too large")
            frame["status"] = "ok"
            frame["actual"] = json.loads(text)
        except _Timeout:
            frame["timeMs"] = (time.perf_counter() - started) * 1000.0
            frame["status"] = "timeout"
        except MemoryError as exc:
            frame.setdefault("timeMs", (time.perf_counter() - started) * 1000.0)
            frame["status"] = "error"
            frame["memory"] = True
            frame["error"] = _format_error(exc)
        except Exception as exc:
            frame.setdefault("timeMs", (time.perf_counter() - started) * 1000.0)
            frame["status"] = "error"
            frame["error"] = _format_error(exc)
        emit(frame)
        if frame["status"] != "ok" and (stop_on_error or frame["status"] == "timeout"):
            return

    emit({"kind": "done"})


if __name__ == "__main__":
    _main_pid = os.getpid()
    try:
        main()
    finally:
        if os.getpid() != _main_pid:
            os._exit(1)
    # Skip interpreter teardown (user atexit hooks, threads, __del__).
    os._exit(0)
