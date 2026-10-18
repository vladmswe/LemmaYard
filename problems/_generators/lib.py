"""Shared helpers for the test generators in problems/_generators/.

Each generator `<slug>.py` builds the tests of `problems/<slug>/`:

1. it loads the reference `problems/<slug>/solution.py`;
2. it checks the reference against an independently written brute force on
   many small random inputs (fuzz) and on every stored test small enough;
3. it computes `expected` for every stored test with the reference and writes
   `problems/<slug>/tests.json` (one test per line, deterministic).

Run from the repository root: `python3 problems/_generators/<slug>.py`.
The importer skips directories starting with `_`, so this folder is not a
problem. `pnpm problems:verify` then runs both reference solutions (Python
and JavaScript) in the judge sandbox on the written tests.
"""

import importlib.util
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAX_SAFE = 2**53 - 1


def problem_dir(slug):
    return os.path.join(ROOT, "problems", slug)


def reference(slug):
    """Returns the reference method (bound to a fresh Solution per call)."""
    path = os.path.join(problem_dir(slug), "solution.py")
    spec = importlib.util.spec_from_file_location("solution_" + slug.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with open(os.path.join(problem_dir(slug), "meta.json")) as f:
        meta = json.load(f)
    name = meta["signature"]["name"]
    params = [p["name"] for p in meta["signature"]["params"]]

    def call(inp):
        return getattr(module.Solution(), name)(*[_copy(inp[p]) for p in params])

    return call


def _copy(value):
    return json.loads(json.dumps(value))


def _check_safe(value, where):
    stack = [value]
    while stack:
        v = stack.pop()
        if isinstance(v, bool):
            continue
        if isinstance(v, int) and abs(v) > MAX_SAFE:
            raise SystemExit(f"{where}: integer {v} outside ±(2^53-1)")
        if isinstance(v, list):
            stack.extend(v)
        if isinstance(v, dict):
            stack.extend(v.values())


def fuzz(ref, brute, make_input, rounds=400, normalize=lambda x: x, label="fuzz"):
    """Compares `ref` and `brute` on `rounds` inputs from `make_input(i)`."""
    for i in range(rounds):
        inp = make_input(i)
        a = normalize(ref(inp))
        b = normalize(brute(_copy(inp)))
        if a != b:
            raise SystemExit(f"{label} mismatch on round {i}: input={json.dumps(inp)[:500]} ref={a} brute={b}")
    print(f"  {label}: {rounds} random inputs agree")


def write_tests(slug, cases, ref, brute=None, brute_ok=lambda inp: False, normalize=lambda x: x):
    """`cases`: list of (input dict, sample bool). Computes expected with `ref`,
    cross-checks with `brute` where `brute_ok(input)`; writes tests.json."""
    tests = []
    checked = 0
    for inp, sample in cases:
        _check_safe(inp, f"{slug} input")
        expected = ref(inp)
        _check_safe(expected, f"{slug} expected")
        if brute is not None and brute_ok(inp):
            b = brute(_copy(inp))
            if normalize(b) != normalize(expected):
                raise SystemExit(f"{slug}: brute mismatch on {json.dumps(inp)[:500]}: ref={expected} brute={b}")
            checked += 1
        t = {"input": inp, "expected": expected}
        if sample:
            t["sample"] = True
        tests.append(t)
    if not any(t.get("sample") for t in tests):
        raise SystemExit(f"{slug}: no sample test")
    text = "[\n" + ",\n".join("  " + json.dumps(t) for t in tests) + "\n]\n"
    with open(os.path.join(problem_dir(slug), "tests.json"), "w") as f:
        f.write(text)
    samples = sum(1 for t in tests if t.get("sample"))
    print(f"{slug}: {len(tests)} tests ({samples} samples, {checked} brute-checked), {len(text)} bytes")
    return tests
