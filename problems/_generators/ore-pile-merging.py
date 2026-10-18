import random

from lib import fuzz, reference, write_tests

SLUG = "ore-pile-merging"


def brute(inp):
    """Tries every sequence of adjacent merges (n <= 8), sharing equal states."""
    best = {}
    stack = [(tuple(inp["piles"]), 0)]
    answer = None
    while stack:
        row, cost = stack.pop()
        if best.get(row, float("inf")) <= cost:
            continue
        best[row] = cost
        if len(row) <= 1:
            answer = cost if answer is None else min(answer, cost)
            continue
        for i in range(len(row) - 1):
            w = row[i] + row[i + 1]
            stack.append((row[:i] + (w,) + row[i + 2:], cost + w))
    return answer


def rand_piles(rng, n, hi):
    return {"piles": [rng.randint(1, hi) for _ in range(n)]}


def main():
    rng = random.Random(47)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_piles(rng, rng.randint(0, 7), rng.choice([3, 10, 100])), rounds=500)
    cases = [
        ({"piles": [4, 1, 3]}, True),
        ({"piles": [6, 2, 2, 6]}, True),
        ({"piles": [9]}, True),
        ({"piles": []}, False),
        ({"piles": [5, 5]}, False),
        ({"piles": [1, 1, 1, 1, 1, 1, 1, 1]}, False),
        ({"piles": [10000, 1, 10000]}, False),
        ({"piles": [1, 100, 1, 100, 1]}, False),
        ({"piles": [1, 2, 3, 4, 5, 6, 7, 8]}, False),
        ({"piles": [8, 7, 6, 5, 4, 3, 2, 1]}, False),
        ({"piles": [3, 9, 1, 1, 9, 3]}, False),
    ]
    for _ in range(170):
        cases.append((rand_piles(rng, rng.randint(2, 8), rng.choice([2, 5, 20, 1000, 10000])), False))
    for _ in range(25):
        cases.append((rand_piles(rng, rng.randint(10, 40), rng.choice([10, 10000])), False))
    # Larger ones (O(n^3) worst sizes).
    cases.append((rand_piles(rng, 120, 10000), False))
    cases.append(({"piles": [10000] * 120}, False))
    cases.append(({"piles": [1 + (i * 37) % 97 for i in range(120)]}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["piles"]) <= 8)


if __name__ == "__main__":
    main()
