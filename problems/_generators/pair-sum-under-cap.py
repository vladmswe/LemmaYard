import random

from lib import fuzz, reference, write_tests

SLUG = "pair-sum-under-cap"


def brute(inp):
    p, cap = inp["prices"], inp["cap"]
    sums = [p[i] + p[j] for i in range(len(p)) for j in range(i + 1, len(p)) if p[i] + p[j] <= cap]
    return max(sums, default=-1)


def small(rng):
    hi = rng.choice([5, 20, 1000])
    prices = [rng.randint(1, hi) for _ in range(rng.randint(0, 10))]
    return {"prices": prices, "cap": rng.randint(1, 2 * hi + 2)}


def main():
    rng = random.Random(30)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=600)
    B = 10**9
    cases = [
        ({"prices": [35, 12, 50, 20, 41], "cap": 60}, True),
        ({"prices": [30, 30, 45], "cap": 60}, True),
        ({"prices": [80, 95, 70], "cap": 100}, True),
        ({"prices": [], "cap": 10}, False),
        ({"prices": [5], "cap": 10}, False),
        ({"prices": [5, 5], "cap": 10}, False),
        ({"prices": [5, 5], "cap": 9}, False),
        ({"prices": [1, 1], "cap": 1}, False),
        ({"prices": [B, B], "cap": 2 * B}, False),
        ({"prices": [B, B, 1], "cap": 2 * B - 1}, False),
        ({"prices": [7, 7, 7, 7], "cap": 15}, False),
        ({"prices": list(range(1, 21)), "cap": 21}, False),
    ]
    for _ in range(220):
        cases.append((small(rng), False))
    cases.append(({"prices": [rng.randint(1, B) for _ in range(2000)], "cap": rng.randint(1, 2 * B)}, False))
    cases.append(({"prices": [rng.randint(1, 10**6) for _ in range(3000)], "cap": 777777}, False))
    cases.append(({"prices": [rng.randint(B // 2 + 1, B) for _ in range(1500)], "cap": B}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["prices"]) <= 3000)


if __name__ == "__main__":
    main()
