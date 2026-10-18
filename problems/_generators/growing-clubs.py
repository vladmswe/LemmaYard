import random
from collections import deque

from lib import fuzz, reference, write_tests

SLUG = "growing-clubs"


def brute(inp):
    """After every friendship, recompute all clubs by BFS from scratch."""
    n = inp["n"]
    adj = [[] for _ in range(n)]
    out = []
    for a, b in inp["friendships"]:
        adj[a].append(b)
        adj[b].append(a)
        seen = [False] * n
        best = 0
        for s in range(n):
            if seen[s]:
                continue
            seen[s] = True
            q, size = deque([s]), 0
            while q:
                x = q.popleft()
                size += 1
                for y in adj[x]:
                    if not seen[y]:
                        seen[y] = True
                        q.append(y)
            best = max(best, size)
        out.append(best)
    return out


def rand_case(rng, n, m):
    return {"n": n, "friendships": [[rng.randrange(n), rng.randrange(n)] for _ in range(m)]}


def main():
    rng = random.Random(39)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng, rng.randint(1, 9), rng.randint(0, 12)), rounds=600)
    cases = [
        ({"n": 6, "friendships": [[0, 1], [2, 3], [1, 2], [4, 5], [3, 0]]}, True),
        ({"n": 4, "friendships": [[2, 2], [1, 3], [3, 1]]}, True),
        ({"n": 1, "friendships": []}, False),
        ({"n": 5, "friendships": []}, False),
        ({"n": 1, "friendships": [[0, 0], [0, 0]]}, False),
        ({"n": 2, "friendships": [[1, 0]]}, False),
        ({"n": 8, "friendships": [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [4, 6], [0, 4]]}, False),
        ({"n": 10, "friendships": [[i, i + 1] for i in range(9)]}, False),
        ({"n": 10, "friendships": [[0, i] for i in range(10)]}, False),
        ({"n": 7, "friendships": [[3, 4]] * 5}, False),
    ]
    for _ in range(170):
        cases.append((rand_case(rng, rng.randint(1, 12), rng.randint(1, 14)), False))
    for _ in range(20):
        cases.append((rand_case(rng, rng.randint(20, 60), rng.randint(20, 60)), False))
    cases.append((rand_case(rng, 1500, 1500), False))
    chain = list(range(1500))
    rng.shuffle(chain)
    cases.append(({"n": 1500, "friendships": [[chain[i], chain[i + 1]] for i in range(1499)]}, False))
    cases.append(({"n": 100000, "friendships": [[rng.randrange(100000), rng.randrange(100000)] for _ in range(800)]}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: inp["n"] * len(inp["friendships"]) <= 3 * 10**6)


if __name__ == "__main__":
    main()
