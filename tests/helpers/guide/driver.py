"""Runs a guide code sample (Python) against its cases (PLAN-GUIDE 2.7).

Reads {file, kind, entry, methods, cases} as JSON on stdin and prints
{"results": [...]}: one value per function case, or one list per class case
(one value per op). An exception becomes {"$error": true, "type": "<name>"}.
Authored lesson code only (trusted repo files), never user submissions.
"""

import importlib.util
import json
import sys

# Never leave __pycache__ next to the lesson files.
sys.dont_write_bytecode = True


def to_json(value):
    if isinstance(value, tuple):
        return [to_json(v) for v in value]
    if isinstance(value, list):
        return [to_json(v) for v in value]
    if isinstance(value, dict):
        return {str(k): to_json(v) for k, v in value.items()}
    return value


def error(exc):
    return {"$error": True, "type": type(exc).__name__}


def load(path):
    spec = importlib.util.spec_from_file_location("guide_sample", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    job = json.load(sys.stdin)
    module = load(job["file"])
    entry = getattr(module, job["entry"])
    results = []
    for case in job["cases"]:
        if job["kind"] == "function":
            try:
                results.append(to_json(entry(*case["args"])))
            except Exception as exc:  # noqa: BLE001 - the error is the result
                results.append(error(exc))
            continue
        out = []
        try:
            obj = entry()
        except Exception as exc:  # noqa: BLE001
            results.append([error(exc)])
            continue
        for op in case["ops"]:
            name, args = op[0], op[1:]
            method = job["methods"][name]
            try:
                out.append(to_json(getattr(obj, method)(*args)))
            except Exception as exc:  # noqa: BLE001
                out.append(error(exc))
        results.append(out)
    json.dump({"results": results}, sys.stdout)


if __name__ == "__main__":
    main()
