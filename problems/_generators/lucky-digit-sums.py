import random

from lib import fuzz, reference, write_tests

SLUG = "lucky-digit-sums"


def brute(inp):
    lo, hi, k = inp["lo"], inp["hi"], inp["k"]
    return sum(1 for x in range(lo, hi + 1) if sum(map(int, str(x))) % k == 0)


def small(rng):
    lo = rng.choice([rng.randint(0, 200), rng.randint(0, 10**9 - 300), rng.choice([0, 9, 99, 999, 10**9 - 50])])
    hi = min(10**9, lo + rng.randint(0, 250))
    return {"lo": lo, "hi": hi, "k": rng.choice([1, 2, 3, 5, 7, 9, 10, 11, rng.randint(1, 100)])}


def main():
    rng = random.Random(22)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=500)
    cases = [
        ({"lo": 2015, "hi": 2025, "k": 5}, True),
        ({"lo": 1, "hi": 30, "k": 3}, True),
        ({"lo": 0, "hi": 0, "k": 7}, True),
        ({"lo": 0, "hi": 9, "k": 1}, False),
        ({"lo": 5, "hi": 5, "k": 6}, False),
        ({"lo": 999, "hi": 1001, "k": 2}, False),
        ({"lo": 1000000000, "hi": 1000000000, "k": 1}, False),
        ({"lo": 1000000000, "hi": 1000000000, "k": 2}, False),
        ({"lo": 999999999, "hi": 1000000000, "k": 81}, False),
        ({"lo": 19, "hi": 91, "k": 100}, False),
        ({"lo": 0, "hi": 1000, "k": 27}, False),
        ({"lo": 99990, "hi": 100010, "k": 9}, False),
    ]
    for _ in range(170):
        cases.append((small(rng), False))
    cases += [
        ({"lo": 0, "hi": 200000, "k": 7}, False),
        ({"lo": 999800000, "hi": 1000000000, "k": 13}, False),
        ({"lo": 123456789, "hi": 123656789, "k": 100}, False),
        ({"lo": 5000000, "hi": 5200000, "k": 1}, False),
    ]
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: True)


if __name__ == "__main__":
    main()
