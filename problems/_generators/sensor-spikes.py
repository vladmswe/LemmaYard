import random

from lib import fuzz, reference, write_tests

SLUG = "sensor-spikes"


def brute(inp):
    r, m = inp["readings"], inp["margin"]
    return sum(1 for i in range(1, len(r) - 1) if r[i] - max(r[i - 1], r[i + 1]) > m)


def rand_case(rng, n, lo, hi, margin):
    return {"readings": [rng.randint(lo, hi) for _ in range(n)], "margin": margin}


def main():
    rng = random.Random(21)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng, rng.randint(0, 12), -5, 5, rng.randint(0, 4)), rounds=2000)
    big = 1000000000
    cases = [
        ({"readings": [3, 9, 4, 4, 12, 11, 2], "margin": 2}, True),
        ({"readings": [1, 5, 5, 1, 7, 0], "margin": 0}, True),
        ({"readings": [10, 20, 10], "margin": 10}, True),
        # edge cases
        ({"readings": [], "margin": 0}, False),
        ({"readings": [7], "margin": 0}, False),
        ({"readings": [1, 9], "margin": 0}, False),
        ({"readings": [9, 1], "margin": 0}, False),
        ({"readings": [0, 1, 0], "margin": 0}, False),
        ({"readings": [0, 1, 0], "margin": 1}, False),
        ({"readings": [0, 2, 1], "margin": 1}, False),
        ({"readings": [1, 2, 0], "margin": 0}, False),
        ({"readings": [0, 1, 0, 1, 0, 1, 0], "margin": 0}, False),
        ({"readings": [-5, -1, -5], "margin": 3}, False),
        ({"readings": [-5, -1, -5], "margin": 4}, False),
        ({"readings": [-big, big, -big], "margin": big}, False),
        ({"readings": [-big, big, -big], "margin": 0}, False),
        ({"readings": [big, -big, big], "margin": 0}, False),
        ({"readings": [4, 4, 4, 4, 4], "margin": 0}, False),
        ({"readings": [1, 5, 5, 1], "margin": 0}, False),
        ({"readings": [9, 0, 9, 0, 9], "margin": 8}, False),
        ({"readings": list(range(50)), "margin": 0}, False),
        ({"readings": list(range(50, 0, -1)), "margin": 0}, False),
    ]
    # many small random cases
    for i in range(150):
        n = rng.randint(0, 15)
        span = rng.choice([2, 5, 20, 1000])
        cases.append((rand_case(rng, n, -span, span, rng.randint(0, span)), False))
    # structured: zigzags with margins around the step size
    for step in (1, 5, 100):
        for margin in (step - 1, step):
            cases.append(({"readings": [(i % 2) * step for i in range(40)], "margin": max(0, margin)}, False))
    # large
    cases.append((rand_case(rng, 2500, -1000, 1000, 0), False))
    cases.append((rand_case(rng, 1200, -big, big, 500000000), False))
    cases.append(({"readings": [i % 2 * 100 for i in range(4001)], "margin": 99}, False))
    cases.append(({"readings": [5] * 3000, "margin": 0}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: True)


if __name__ == "__main__":
    main()
