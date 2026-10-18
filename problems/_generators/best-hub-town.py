import random

from lib import fuzz, reference, write_tests

SLUG = "best-hub-town"


def brute(inp):
    """Distances from every town by an explicit graph walk (undirected edges)."""
    par, pop, length = inp["parent"], inp["population"], inp["roadLength"]
    n = len(par)
    adj = [[] for _ in range(n)]
    for v in range(1, n):
        adj[v].append((par[v], length[v]))
        adj[par[v]].append((v, length[v]))
    best = None
    for h in range(n):
        dist = {h: 0}
        stack = [h]
        while stack:
            u = stack.pop()
            for w, l in adj[u]:
                if w not in dist:
                    dist[w] = dist[u] + l
                    stack.append(w)
        total = sum(pop[v] * dist[v] for v in range(n))
        if best is None or total < best[1]:
            best = [h, total]
    return best


def tree(rng, n, shape="random", max_len=1000, max_pop=1000, zero_pop=0.0):
    """Random tree rooted at 0 with shuffled labels (parents may be larger than children)."""
    labels = [0] + rng.sample(range(1, n), n - 1)  # labels[k] = town of the k-th created node
    par = [-1] * n
    for k in range(1, n):
        if shape == "chain":
            p = k - 1
        elif shape == "star":
            p = 0
        elif shape == "caterpillar":
            p = k - 1 if k % 2 or k < 2 else k - 2
        else:
            p = rng.randrange(k)
        par[labels[k]] = labels[p]
    pop = [0 if rng.random() < zero_pop else rng.randint(0, max_pop) for _ in range(n)]
    length = [0] + [rng.randint(1, max_len) for _ in range(n - 1)]
    return {"parent": par, "population": pop, "roadLength": length}


def main():
    rng = random.Random(50)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: tree(rng, rng.randint(1, 9), rng.choice(["random", "chain", "star"]),
                                    rng.choice([1, 5, 1000]), rng.choice([1, 5, 1000]), rng.choice([0, 0.5])),
         rounds=600)
    cases = [
        ({"parent": [-1, 0, 0, 1], "population": [1, 5, 2, 4], "roadLength": [0, 3, 1, 2]}, True),
        ({"parent": [-1, 2, 0], "population": [10, 10, 1], "roadLength": [0, 4, 4]}, True),
        ({"parent": [-1], "population": [7], "roadLength": [0]}, True),
        ({"parent": [-1, 0], "population": [3, 3], "roadLength": [0, 9]}, False),
        ({"parent": [-1, 0], "population": [0, 0], "roadLength": [0, 1]}, False),
        ({"parent": [-1, 0, 0, 0], "population": [0, 1, 1, 1], "roadLength": [0, 1, 1, 1]}, False),
        ({"parent": [-1, 0, 1, 2, 3], "population": [1, 1, 1, 1, 1], "roadLength": [0, 1, 1, 1, 1]}, False),
        ({"parent": [-1, 0, 1, 2, 3], "population": [0, 0, 0, 0, 1000], "roadLength": [0, 1000, 1000, 1000, 1000]},
         False),
        ({"parent": [-1, 3, 3, 0], "population": [5, 1, 1, 0], "roadLength": [0, 2, 2, 7]}, False),
    ]
    for _ in range(170):
        n = rng.randint(1, 12)
        cases.append((tree(rng, n, rng.choice(["random", "random", "chain", "star", "caterpillar"]),
                           rng.choice([1, 3, 1000]), rng.choice([1, 3, 1000]), rng.choice([0, 0, 0.4])), False))
    for _ in range(20):
        cases.append((tree(rng, rng.randint(20, 60), "random", 1000, 1000, 0.2), False))
    # Larger ones: a deep chain, a random tree with heavy towns, a caterpillar.
    cases.append((tree(rng, 2000, "chain", 1000, 1000), False))
    cases.append((tree(rng, 1500, "random", 1000, 1000), False))
    cases.append((tree(rng, 1500, "caterpillar", 1, 1), False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["parent"]) <= 3000)


if __name__ == "__main__":
    main()
