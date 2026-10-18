import random

from lib import fuzz, reference, write_tests

SLUG = "range-count-queries"


def brute(inp):
    return [sum(1 for v in inp["values"] if lo <= v <= hi) for lo, hi in inp["queries"]]


def small(rng):
    span = rng.choice([3, 10, 100])
    values = [rng.randint(-span, span) for _ in range(rng.randint(0, 12))]
    queries = []
    for _ in range(rng.randint(0, 8)):
        a, b = rng.randint(-span - 2, span + 2), rng.randint(-span - 2, span + 2)
        if rng.random() < 0.8:
            a, b = min(a, b), max(a, b)
        queries.append([a, b])
    return {"values": values, "queries": queries}


def main():
    rng = random.Random(28)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=600)
    B = 10**9
    cases = [
        ({"values": [12, -3, 7, 7, 25, 0, 18], "queries": [[0, 10], [7, 7], [19, 24], [-5, 30]]}, True),
        ({"values": [4, 1, 4], "queries": [[5, 2], [1, 4], [2, 3]]}, True),
        ({"values": [], "queries": [[-1, 1], [0, 0]]}, False),
        ({"values": [1, 2, 3], "queries": []}, False),
        ({"values": [], "queries": []}, False),
        ({"values": [-B, B, 0], "queries": [[-B, B], [-B, -B], [B, B], [B, -B], [1 - B, B - 1]]}, False),
        ({"values": [5] * 20, "queries": [[5, 5], [4, 4], [6, 6], [0, 5], [5, 10]]}, False),
        ({"values": list(range(10, 0, -1)), "queries": [[i, i + 2] for i in range(-1, 12)]}, False),
    ]
    for _ in range(200):
        cases.append((small(rng), False))

    def big(nv, nq, span):
        values = [rng.randint(-span, span) for _ in range(nv)]
        qs = []
        for _ in range(nq):
            a, b = rng.randint(-span, span), rng.randint(-span, span)
            qs.append([min(a, b), max(a, b)] if rng.random() < 0.95 else [max(a, b), min(a, b)])
        return {"values": values, "queries": qs}

    cases.append((big(1500, 1500, 1000), False))
    cases.append((big(500, 500, B), False))
    cases.append(({"values": [7] * 1500, "queries": [[7, 7], [6, 8], [8, 6]] * 100}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: True)


if __name__ == "__main__":
    main()
