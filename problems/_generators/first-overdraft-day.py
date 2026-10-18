import random

from lib import fuzz, reference, write_tests

SLUG = "first-overdraft-day"


def brute(inp):
    # Recompute every prefix from scratch.
    ch = inp["changes"]
    for d in range(1, len(ch) + 1):
        if inp["start"] + sum(ch[:d]) < 0:
            return d
    return 0


def small(rng):
    n = rng.randint(0, 12)
    amp = rng.choice([3, 10, 1000])
    return {"start": rng.randint(0, amp), "changes": [rng.randint(-amp, amp) for _ in range(n)]}


def main():
    rng = random.Random(23)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=500)
    cases = [
        ({"start": 50, "changes": [20, -45, -30, 10, -40]}, True),
        ({"start": 0, "changes": [5, -5, 0, 3]}, True),
        ({"start": 10, "changes": [-11]}, True),
        ({"start": 0, "changes": []}, False),
        ({"start": 0, "changes": [-1]}, False),
        ({"start": 0, "changes": [0, 0, 0]}, False),
        ({"start": 1000000000, "changes": [-1000000000, -1]}, False),
        ({"start": 1000000000, "changes": [-1000000000, 0, 1000000000, -1000000000, -1000000000]}, False),
        ({"start": 5, "changes": [-5, -5, 100]}, False),
        ({"start": 7, "changes": [1, 2, 3]}, False),
    ]
    for _ in range(200):
        cases.append((small(rng), False))
    # larger: random walk drifting down late; never-negative; overdraft on the last day
    big = [rng.randint(-1000, 1000) for _ in range(3000)]
    cases.append(({"start": 30000, "changes": big}, False))
    cases.append(({"start": 0, "changes": [1, -1] * 2000}, False))
    cases.append(({"start": 0, "changes": [1, -1] * 2000 + [-1]}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["changes"]) <= 50)
    # cross-check the large cases with an independent cumulative scan
    for inp, _ in cases[-3:]:
        b, d = inp["start"], 0
        for i, c in enumerate(inp["changes"]):
            b += c
            if b < 0:
                d = i + 1
                break
        assert d == ref(inp)


if __name__ == "__main__":
    main()
