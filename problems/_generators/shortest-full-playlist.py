import random

from lib import fuzz, reference, write_tests

SLUG = "shortest-full-playlist"


def brute(inp):
    g = inp["genres"]
    need = len(set(g))
    best = len(g)
    for i in range(len(g)):
        for j in range(i, len(g)):
            if len(set(g[i : j + 1])) == need:
                best = min(best, j - i + 1)
                break
    return best


def rand_genres(rng, n, k):
    pool = rng.sample(range(1, 10**9), k)
    return [rng.choice(pool) for _ in range(n)]


def main():
    rng = random.Random(40)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: {"genres": [rng.randint(1, 4) for _ in range(rng.randint(0, 14))]}, rounds=600)
    cases = [
        ({"genres": [3, 1, 3, 2, 2, 1, 3]}, True),
        ({"genres": [5, 5, 5]}, True),
        ({"genres": [4, 8, 4, 4, 9, 8]}, True),
        ({"genres": []}, False),
        ({"genres": [7]}, False),
        ({"genres": [1, 2]}, False),
        ({"genres": [1, 2, 3, 4, 5, 6]}, False),
        ({"genres": [1, 1, 1, 2, 2, 2, 3, 3, 3]}, False),
        ({"genres": [1000000000, 1, 1000000000]}, False),
        ({"genres": [2, 1, 1, 1, 1, 2, 3, 3, 3, 1]}, False),
        ({"genres": [1, 2, 3, 1, 2, 3, 1, 2, 3]}, False),
    ]
    for _ in range(170):
        cases.append(({"genres": [rng.randint(1, rng.choice([2, 3, 5, 9])) for _ in range(rng.randint(1, 20))]}, False))
    for _ in range(20):
        cases.append(({"genres": rand_genres(rng, rng.randint(40, 120), rng.randint(2, 12))}, False))
    cases.append(({"genres": [rng.randint(1, 30) for _ in range(6000)]}, False))
    # every genre but one appears early; the rare one appears once near the end
    late = [rng.randint(1, 50) for _ in range(5000)] + [99] + [rng.randint(1, 50) for _ in range(100)]
    cases.append(({"genres": late}, False))
    cases.append(({"genres": list(range(1, 2001)) + list(range(2000, 0, -1))}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["genres"]) <= 200)


if __name__ == "__main__":
    main()
