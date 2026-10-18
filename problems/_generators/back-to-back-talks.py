import random

from lib import fuzz, reference, write_tests

SLUG = "back-to-back-talks"


def brute(inp):
    # Every subset; keep the largest one whose spans are pairwise disjoint.
    t = inp["talks"]
    n = len(t)
    best = 0
    for mask in range(1 << n):
        chosen = sorted((t[i][0], t[i][0] + t[i][1]) for i in range(n) if mask >> i & 1)
        if all(chosen[i][1] <= chosen[i + 1][0] for i in range(len(chosen) - 1)):
            best = max(best, len(chosen))
    return best


def dp_check(inp):
    # Second independent check for larger inputs: O(n^2) DP over talks sorted by start.
    spans = sorted((s, s + d) for s, d in inp["talks"])
    n = len(spans)
    best = [1] * n
    for i in range(n):
        for j in range(i):
            if spans[j][1] <= spans[i][0]:
                best[i] = max(best[i], best[j] + 1)
    return max(best, default=0)


def small(rng, n_max=10):
    span = rng.choice([6, 15, 40])
    return {"talks": [[rng.randint(0, span), rng.randint(1, max(1, span // 3))] for _ in range(rng.randint(0, n_max))]}


def main():
    rng = random.Random(31)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=500)
    fuzz(ref, dp_check, lambda i: small(rng, 60), rounds=300, label="fuzz vs dp")
    B = 10**9
    cases = [
        ({"talks": [[540, 60], [570, 30], [600, 45], [620, 90], [645, 15]]}, True),
        ({"talks": [[0, 100], [10, 10], [20, 10], [30, 10]]}, True),
        ({"talks": [[5, 5], [5, 5], [5, 5]]}, True),
        ({"talks": []}, False),
        ({"talks": [[0, 1]]}, False),
        ({"talks": [[0, 1], [1, 1], [2, 1], [3, 1]]}, False),
        ({"talks": [[0, 2], [1, 2], [2, 2], [3, 2]]}, False),
        ({"talks": [[B, B], [0, B], [B - 1, 1]]}, False),
        ({"talks": [[10, 1], [0, 30], [11, 1], [12, 1]]}, False),
        ({"talks": [[i, 2 * (10 - i)] for i in range(10)]}, False),
    ]
    for _ in range(200):
        cases.append((small(rng), False))
    for _ in range(20):
        cases.append((small(rng, 60), False))
    cases.append(({"talks": [[rng.randint(0, 100000), rng.randint(1, 500)] for _ in range(1200)]}, False))
    cases.append(({"talks": [[rng.randint(0, B), rng.randint(1, B)] for _ in range(500)]}, False))
    cases.append(({"talks": [[i * 3, 3] for i in range(1200)][::-1]}, False))
    write_tests(SLUG, cases, ref, dp_check, brute_ok=lambda inp: len(inp["talks"]) <= 2000)


if __name__ == "__main__":
    main()
