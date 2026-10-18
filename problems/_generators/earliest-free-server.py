import random

from lib import fuzz, reference, write_tests

SLUG = "earliest-free-server"


def brute(inp):
    """Event simulation in unit time steps: at each moment idle machines (by
    number) take queued jobs."""
    m, jobs = inp["servers"], inp["jobs"]
    busy_until = [0] * m
    finish = [0] * m
    queue = list(jobs)
    t = 0
    while queue:
        for k in range(m):
            if queue and busy_until[k] <= t:
                busy_until[k] = t + queue.pop(0)
                finish[k] = busy_until[k]
        t += 1
    return finish


def linear(inp):
    """Linear scan for the earliest idle machine (ties: smallest number)."""
    finish = [0] * inp["servers"]
    for length in inp["jobs"]:
        k = min(range(len(finish)), key=lambda x: (finish[x], x))
        finish[k] += length
    return finish


def check(inp):
    return brute(inp) if sum(inp["jobs"]) <= 3000 else linear(inp)


def rand_case(rng, m, n, hi):
    return {"servers": m, "jobs": [rng.randint(1, hi) for _ in range(n)]}


def main():
    rng = random.Random(38)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng, rng.randint(1, 5), rng.randint(0, 12), 6), rounds=600)
    cases = [
        ({"servers": 2, "jobs": [5, 3, 2, 4, 1]}, True),
        ({"servers": 3, "jobs": [4, 4, 4, 4]}, True),
        ({"servers": 4, "jobs": [7]}, True),
        ({"servers": 1, "jobs": []}, False),
        ({"servers": 5, "jobs": []}, False),
        ({"servers": 1, "jobs": [3, 1, 4, 1, 5]}, False),
        ({"servers": 3, "jobs": [1, 1, 1, 1, 1, 1, 1]}, False),
        ({"servers": 2, "jobs": [10000, 1, 1, 1]}, False),
        ({"servers": 6, "jobs": [2, 2, 2]}, False),
        ({"servers": 3, "jobs": [5, 1, 1, 1, 1, 1, 1, 1, 1]}, False),
    ]
    for _ in range(160):
        cases.append((rand_case(rng, rng.randint(1, 6), rng.randint(0, 15), rng.choice([3, 10])), False))
    for _ in range(25):
        cases.append((rand_case(rng, rng.randint(2, 20), rng.randint(20, 60), 30), False))
    cases.append((rand_case(rng, 50, 2500, 10000), False))
    cases.append(({"servers": 3000, "jobs": [rng.randint(1, 9) for _ in range(4500)]}, False))
    cases.append(({"servers": 7, "jobs": [10000] * 5000}, False))
    write_tests(SLUG, cases, ref, check, brute_ok=lambda inp: True)


if __name__ == "__main__":
    main()
