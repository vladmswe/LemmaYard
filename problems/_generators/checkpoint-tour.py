import itertools
import random
import time

from lib import fuzz, reference, write_tests

SLUG = "checkpoint-tour"


def brute(inp):
    """Every order of checkpoints 1..n-1 (n <= 8)."""
    p = inp["points"]

    def d(a, b):
        return abs(p[a][0] - p[b][0]) + abs(p[a][1] - p[b][1])

    best = None
    for order in itertools.permutations(range(1, len(p))):
        total, cur = 0, 0
        for v in order:
            total += d(cur, v)
            cur = v
        best = total if best is None else min(best, total)
    return 0 if best is None else best


def rand_points(rng, n, r):
    return {"points": [[rng.randint(-r, r), rng.randint(-r, r)] for _ in range(n)]}


def main():
    rng = random.Random(49)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_points(rng, rng.randint(1, 7), rng.choice([2, 10, 1000])), rounds=500)
    cases = [
        ({"points": [[0, 0], [3, 0], [1, 2], [3, 3]]}, True),
        ({"points": [[5, 5], [0, 0], [10, 10]]}, True),
        ({"points": [[7, -2]]}, True),
        ({"points": [[0, 0], [0, 0]]}, False),
        ({"points": [[0, 0], [1000000, 1000000]]}, False),
        ({"points": [[-1000000, -1000000], [1000000, 1000000], [-1000000, 1000000], [1000000, -1000000]]}, False),
        ({"points": [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]]}, False),
        ({"points": [[3, 0], [0, 0], [1, 0], [2, 0], [4, 0], [5, 0], [6, 0]]}, False),
        ({"points": [[1, 1]] * 8}, False),
    ]
    for _ in range(180):
        cases.append((rand_points(rng, rng.randint(2, 8), rng.choice([3, 20, 1000, 1000000])), False))
    for n in (9, 10, 10, 11):
        cases.append((rand_points(rng, n, 1000), False))
    # Larger ones: the maximum size.
    cases.append((rand_points(rng, 12, 1000000), False))
    cases.append(({"points": [[(i * 7) % 12, (i * 5) % 12] for i in range(12)]}, False))
    cases.append(({"points": [[0, 0]] + [[i * 10, (i % 2) * 1000] for i in range(1, 12)]}, False))
    started = time.perf_counter()
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["points"]) <= 9)
    print(f"  generated in {time.perf_counter() - started:.1f}s")


if __name__ == "__main__":
    main()
