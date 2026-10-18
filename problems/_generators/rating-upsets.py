import random

from lib import fuzz, reference, write_tests

SLUG = "rating-upsets"


def brute(inp):
    r, g = inp["ratings"], inp["gap"]
    n = len(r)
    return sum(1 for i in range(n) for j in range(i + 1, n) if r[i] - r[j] > g)


def rand_case(rng, n, hi, gap_lo, gap_hi):
    return {"ratings": [rng.randint(0, hi) for _ in range(n)], "gap": rng.randint(gap_lo, gap_hi)}


def main():
    rng = random.Random(44)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng, rng.randint(0, 12), 8, -9, 9), rounds=600)
    cases = [
        ({"ratings": [1500, 1200, 1490, 1100], "gap": 100}, True),
        ({"ratings": [5, 5, 4], "gap": -1}, True),
        ({"ratings": [1000, 2000, 3000], "gap": 0}, True),
        ({"ratings": [], "gap": 0}, False),
        ({"ratings": [7], "gap": -1000000000}, False),
        ({"ratings": [3, 3, 3, 3], "gap": 0}, False),
        ({"ratings": [3, 3, 3, 3], "gap": -1}, False),
        ({"ratings": [0, 1000000000], "gap": -1000000000}, False),
        ({"ratings": [1000000000, 0], "gap": 999999999}, False),
        ({"ratings": [1000000000, 0], "gap": 1000000000}, False),
        ({"ratings": [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], "gap": 2}, False),
    ]
    for _ in range(180):
        hi = rng.choice([3, 10, 100, 1000000000])
        g = rng.randint(-hi, hi) if rng.random() < 0.8 else rng.choice([-1000000000, 1000000000, 0, -1])
        cases.append(({"ratings": [rng.randint(0, hi) for _ in range(rng.randint(1, 20))], "gap": g}, False))
    for _ in range(25):
        cases.append((rand_case(rng, rng.randint(50, 150), 500, -300, 300), False))
    # Larger ones: descending (many pairs), random wide values, all equal.
    cases.append(({"ratings": list(range(3000, 0, -1)), "gap": 10}, False))
    cases.append((rand_case(rng, 1500, 1000000000, -100000000, 100000000), False))
    cases.append(({"ratings": [42] * 3000, "gap": -1}, False))
    cases.append(({"ratings": [rng.randint(0, 99) for _ in range(5000)], "gap": 50}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["ratings"]) <= 5000)


if __name__ == "__main__":
    main()
