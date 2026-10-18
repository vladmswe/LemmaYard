import itertools
import random

from lib import fuzz, reference, write_tests

SLUG = "smallest-task-order"


def brute(inp):
    n, rules = inp["n"], inp["rules"]
    # permutations() yields in lexicographic order: the first valid one wins.
    for perm in itertools.permutations(range(n)):
        pos = {v: i for i, v in enumerate(perm)}
        if all(pos[a] < pos[b] for a, b in rules):
            return list(perm)
    return []


def naive(inp):
    """Quadratic scan: repeatedly take the smallest job whose predecessors are all done."""
    n, rules = inp["n"], inp["rules"]
    done = [False] * n
    order = []
    for _ in range(n):
        for v in range(n):
            if not done[v] and all(done[a] for a, b in rules if b == v):
                done[v] = True
                order.append(v)
                break
        else:
            return []
    return order


def check(inp):
    return brute(inp) if inp["n"] <= 7 else naive(inp)


def dag_rules(rng, n, m, cycle=False):
    """Random rules consistent with a hidden random order (plus a cycle if asked)."""
    hidden = list(range(n))
    rng.shuffle(hidden)
    rules = []
    if n >= 2:
        for _ in range(m):
            i, j = sorted(rng.sample(range(n), 2))
            rules.append([hidden[i], hidden[j]])
    if cycle and n >= 2:
        k = rng.randint(2, min(n, 4))
        nodes = rng.sample(range(n), k)
        for t in range(k):
            rules.append([nodes[t], nodes[(t + 1) % k]])
        rng.shuffle(rules)
    return rules


def rand_case(rng, max_n=7):
    n = rng.randint(1, max_n)
    m = rng.randint(0, n * 2)
    return {"n": n, "rules": dag_rules(rng, n, m, cycle=rng.random() < 0.25)}


def main():
    rng = random.Random(43)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng), rounds=500)
    fuzz(ref, naive, lambda i: rand_case(rng, 30), rounds=300, label="fuzz naive")
    cases = [
        ({"n": 5, "rules": [[3, 0], [4, 0], [2, 1], [3, 2]]}, True),
        ({"n": 3, "rules": [[0, 1], [1, 2], [2, 0]]}, True),
        ({"n": 4, "rules": []}, True),
        ({"n": 1, "rules": []}, False),
        ({"n": 2, "rules": [[1, 0]]}, False),
        ({"n": 2, "rules": [[1, 0], [1, 0], [1, 0]]}, False),
        ({"n": 2, "rules": [[0, 1], [1, 0]]}, False),
        ({"n": 6, "rules": [[5, 4], [4, 3], [3, 2], [2, 1], [1, 0]]}, False),
        ({"n": 6, "rules": [[5, 0]]}, False),
        ({"n": 7, "rules": [[6, 1], [2, 1], [0, 6], [3, 4], [4, 5], [5, 3]]}, False),
    ]
    for _ in range(200):
        cases.append((rand_case(rng), False))
    for _ in range(30):
        n = rng.randint(10, 40)
        cases.append(({"n": n, "rules": dag_rules(rng, n, rng.randint(0, 3 * n), cycle=rng.random() < 0.3)}, False))
    # Larger ones.
    n = 2500
    cases.append(({"n": n, "rules": dag_rules(rng, n, 2500)}, False))
    n = 2000
    cases.append(({"n": n, "rules": dag_rules(rng, n, 1500, cycle=True)}, False))
    cases.append(({"n": 10000, "rules": [[9999, 0], [0, 9999]]}, False))
    write_tests(SLUG, cases, ref, check, brute_ok=lambda inp: inp["n"] <= 40)


if __name__ == "__main__":
    main()
