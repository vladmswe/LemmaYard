import random

from lib import fuzz, reference, write_tests

SLUG = "toll-free-passes"


def brute(inp):
    """Bellman-Ford style relaxation over (depot, passes used) until nothing changes;
    then the cheapest over all pass counts."""
    n, roads, passes = inp["n"], inp["roads"], inp["passes"]
    inf = float("inf")
    dist = [[inf] * n for _ in range(passes + 1)]
    dist[0][inp["source"]] = 0
    changed = True
    while changed:
        changed = False
        for k in range(passes + 1):
            for u, v, t in roads:
                for a, b in ((u, v), (v, u)):
                    if dist[k][a] + t < dist[k][b]:
                        dist[k][b] = dist[k][a] + t
                        changed = True
                    if k < passes and dist[k][a] < dist[k + 1][b]:
                        dist[k + 1][b] = dist[k][a]
                        changed = True
    best = min(dist[k][inp["target"]] for k in range(passes + 1))
    return -1 if best == inf else best


def rand_case(rng, n, m, passes, hi):
    roads = []
    for _ in range(m):
        if n < 2:
            break
        u, v = rng.sample(range(n), 2)
        roads.append([u, v, rng.randint(0, hi) if rng.random() < 0.1 else rng.randint(1, max(1, hi))])
    source = rng.randrange(n)
    target = rng.randrange(n) if rng.random() < 0.1 or n < 2 else rng.choice([x for x in range(n) if x != source])
    return {"n": n, "roads": roads, "passes": passes, "source": source, "target": target}


def main():
    rng = random.Random(48)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng, rng.randint(1, 8), rng.randint(0, 14), rng.randint(0, 3),
                                          rng.choice([0, 5, 100])), rounds=600)
    cases = [
        ({"n": 5, "roads": [[0, 1, 4], [1, 4, 9], [0, 2, 1], [2, 3, 1], [3, 4, 20]], "passes": 1,
          "source": 0, "target": 4}, True),
        ({"n": 4, "roads": [[0, 1, 5], [1, 2, 5], [2, 3, 5], [0, 3, 40]], "passes": 0,
          "source": 0, "target": 3}, True),
        ({"n": 3, "roads": [[0, 1, 7]], "passes": 2, "source": 0, "target": 2}, True),
        ({"n": 1, "roads": [], "passes": 0, "source": 0, "target": 0}, False),
        ({"n": 2, "roads": [[0, 1, 5], [1, 0, 3]], "passes": 0, "source": 1, "target": 0}, False),
        ({"n": 2, "roads": [[0, 1, 1000000]], "passes": 10, "source": 0, "target": 1}, False),
        ({"n": 3, "roads": [[0, 1, 0], [1, 2, 0]], "passes": 0, "source": 2, "target": 0}, False),
        ({"n": 4, "roads": [[0, 1, 1], [1, 2, 1], [2, 3, 1]], "passes": 5, "source": 0, "target": 3}, False),
        ({"n": 4, "roads": [[0, 1, 3], [1, 2, 3]], "passes": 1, "source": 3, "target": 0}, False),
        ({"n": 5, "roads": [[0, 4, 100], [0, 1, 10], [1, 2, 10], [2, 3, 10], [3, 4, 10]], "passes": 1,
          "source": 0, "target": 4}, False),
        ({"n": 5, "roads": [[0, 4, 100], [0, 1, 10], [1, 2, 10], [2, 3, 10], [3, 4, 10]], "passes": 2,
          "source": 4, "target": 0}, False),
    ]
    for _ in range(160):
        n = rng.randint(3, 10)
        m = rng.randint(n - 1, n + 4)
        cases.append((rand_case(rng, n, m, rng.choice([0, 0, 0, 1, 1, 2]), rng.choice([3, 50, 50, 1000000])), False))
    for _ in range(20):
        n = rng.randint(15, 40)
        cases.append((rand_case(rng, n, rng.randint(n, 3 * n), rng.randint(0, 3), 1000), False))
    # Larger ones.
    n = 800
    cases.append((rand_case(rng, n, 1500, 10, 1000000), False))
    # A long path with a few expensive shortcut roads.
    path = [[i, i + 1, rng.randint(1, 100)] for i in range(1199)]
    path += [[rng.randrange(1200), rng.randrange(1200), 1000000] for _ in range(60)]
    path = [r for r in path if r[0] != r[1]]
    cases.append(({"n": 1200, "roads": path, "passes": 3, "source": 0, "target": 1199}, False))
    cases.append(({"n": 5000, "roads": [[i, i + 1, 7] for i in range(1500)] + [[4998, 4999, 1]], "passes": 10, "source": 0,
                   "target": 4999}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: inp["n"] <= 40)


if __name__ == "__main__":
    main()
