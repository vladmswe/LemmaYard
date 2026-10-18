import random

from lib import fuzz, reference, write_tests

SLUG = "busiest-moment"


def brute(inp):
    s = inp["sessions"]
    best, when = 0, None
    for t in sorted({a for a, _ in s}):
        c = sum(1 for a, b in s if a <= t < b)
        if c > best:
            best, when = c, t
    return [best, when]


def rand_sessions(rng, n, span, maxlen):
    out = []
    for _ in range(n):
        a = rng.randint(0, span)
        out.append([a, a + rng.randint(1, maxlen)])
    return out


def main():
    rng = random.Random(32)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: {"sessions": rand_sessions(rng, rng.randint(1, 10), 15, 6)}, rounds=600)
    cases = [
        ({"sessions": [[1, 5], [2, 4], [4, 9], [6, 8]]}, True),
        ({"sessions": [[0, 3], [3, 6], [6, 9]]}, True),
        ({"sessions": [[10, 20], [12, 15], [30, 40], [31, 35], [33, 34]]}, True),
        ({"sessions": [[0, 1]]}, False),
        ({"sessions": [[0, 1000000000]]}, False),
        ({"sessions": [[5, 6], [5, 6], [5, 6]]}, False),
        ({"sessions": [[1, 2], [2, 3], [1, 3]]}, False),
        ({"sessions": [[999999999, 1000000000], [0, 1000000000]]}, False),
        ({"sessions": [[i, i + 1] for i in range(30)]}, False),
        ({"sessions": [[i, 100 - i] for i in range(50)]}, False),
        ({"sessions": [[i, 2 * i + 1] for i in range(40)]}, False),
    ]
    for _ in range(150):
        cases.append(({"sessions": rand_sessions(rng, rng.randint(1, 12), 20, 8)}, False))
    for _ in range(40):
        cases.append(({"sessions": rand_sessions(rng, rng.randint(10, 30), 1000, 300)}, False))
    cases.append(({"sessions": rand_sessions(rng, 1500, 1000000000 - 100000, 100000)}, False))
    cases.append(({"sessions": rand_sessions(rng, 2000, 5000, 2000)}, False))
    cases.append(({"sessions": [[i, 4000] for i in range(1500)]}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["sessions"]) <= 2000)


if __name__ == "__main__":
    main()
