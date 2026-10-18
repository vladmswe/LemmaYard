import random

from lib import fuzz, reference, write_tests

SLUG = "alarm-streak"


def brute(inp):
    load, k, limit = inp["load"], inp["k"], inp["limit"]
    flags = [sum(load[s:s + k]) > limit for s in range(len(load) - k + 1)]
    best = 0
    for a in range(len(flags)):
        for b in range(a, len(flags)):
            if all(flags[a:b + 1]):
                best = max(best, b - a + 1)
    return best


def small(rng):
    n = rng.randint(0, 12)
    load = [rng.randint(0, 9) for _ in range(n)]
    k = rng.randint(1, 14)
    return {"load": load, "k": k, "limit": rng.randint(0, 9 * min(k, max(n, 1)))}


def main():
    rng = random.Random(26)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=600)
    cases = [
        ({"load": [4, 8, 1, 7, 9, 2, 0, 3], "k": 3, "limit": 12}, True),
        ({"load": [5, 5, 5, 5], "k": 2, "limit": 10}, True),
        ({"load": [1, 2, 3], "k": 5, "limit": 0}, True),
        ({"load": [], "k": 1, "limit": 0}, False),
        ({"load": [0], "k": 1, "limit": 0}, False),
        ({"load": [1], "k": 1, "limit": 0}, False),
        ({"load": [3, 3, 3], "k": 3, "limit": 8}, False),
        ({"load": [3, 3, 3], "k": 3, "limit": 9}, False),
        ({"load": [1000000] * 10, "k": 10, "limit": 9999999}, False),
        ({"load": [0, 0, 0, 0, 0], "k": 1, "limit": 0}, False),
        ({"load": [9, 0, 9, 0, 9, 0, 9], "k": 2, "limit": 8}, False),
    ]
    for _ in range(220):
        cases.append((small(rng), False))
    big = [rng.randint(0, 1000) for _ in range(5000)]
    cases.append(({"load": big, "k": 50, "limit": 25500}, False))
    cases.append(({"load": [1000000] * 3000, "k": 3000, "limit": 2999999999}, False))
    cases.append(({"load": [(i // 400) % 2 * 7 for i in range(4000)], "k": 100, "limit": 300}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["load"]) <= 40)
    # independent linear check of the large cases (recompute every window)
    for inp, _ in cases[-3:]:
        load, k, limit = inp["load"], inp["k"], inp["limit"]
        best = run = 0
        for s in range(len(load) - k + 1):
            run = run + 1 if sum(load[s:s + k]) > limit else 0
            best = max(best, run)
        assert best == ref(inp), inp["k"]


if __name__ == "__main__":
    main()
