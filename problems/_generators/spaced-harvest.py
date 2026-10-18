import random

from lib import fuzz, reference, write_tests

SLUG = "spaced-harvest"


def brute(inp):
    y, g = inp["yields"], inp["gap"]
    n = len(y)
    best = 0
    for mask in range(1 << n):
        chosen = [i for i in range(n) if mask >> i & 1]
        if all(b - a > g for a, b in zip(chosen, chosen[1:])):
            best = max(best, sum(y[i] for i in chosen))
    return best


def quadratic(inp):
    """O(n^2): best total of a choice ending exactly at each tree."""
    y, g = inp["yields"], inp["gap"]
    end = []
    for i, v in enumerate(y):
        end.append(v + max([0] + [end[j] for j in range(i - g)]))
    return max([0] + end)


def check(inp):
    return brute(inp) if len(inp["yields"]) <= 14 else quadratic(inp)


def rand_case(rng, n, lo, hi):
    return {"yields": [rng.randint(lo, hi) for _ in range(n)], "gap": rng.randint(0, n)}


def main():
    rng = random.Random(35)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng, rng.randint(0, 11), -10, 10), rounds=500)
    fuzz(ref, quadratic, lambda i: rand_case(rng, rng.randint(0, 80), -50, 50), rounds=300, label="fuzz O(n^2)")
    cases = [
        ({"yields": [4, 1, 3, 9, 2, 5], "gap": 1}, True),
        ({"yields": [6, -2, 8, 7, 1, 10], "gap": 2}, True),
        ({"yields": [-3, -1, -7], "gap": 0}, True),
        ({"yields": [], "gap": 0}, False),
        ({"yields": [5], "gap": 1}, False),
        ({"yields": [-5], "gap": 0}, False),
        ({"yields": [1, 2, 3, 4, 5], "gap": 0}, False),
        ({"yields": [1, 2, 3, 4, 5], "gap": 5}, False),
        ({"yields": [3, 3, 3, 3, 3, 3, 3], "gap": 2}, False),
        ({"yields": [10000] * 12, "gap": 1}, False),
        ({"yields": [-10000] * 12, "gap": 0}, False),
        ({"yields": [9, 0, 0, 10, 0, 0, 9], "gap": 2}, False),
    ]
    for _ in range(170):
        cases.append((rand_case(rng, rng.randint(1, 12), -20, 20), False))
    for _ in range(30):
        n = rng.randint(30, 60)
        cases.append(({"yields": [rng.randint(-10000, 10000) for _ in range(n)], "gap": rng.randint(0, 6)}, False))
    cases.append(({"yields": [rng.randint(-10000, 10000) for _ in range(3000)], "gap": 3}, False))
    cases.append(({"yields": [rng.randint(0, 10000) for _ in range(3000)], "gap": 0}, False))
    cases.append(({"yields": [rng.randint(-3000, 10000) for _ in range(3000)], "gap": 40}, False))
    write_tests(SLUG, cases, ref, check, brute_ok=lambda inp: True)


if __name__ == "__main__":
    main()
