import random

from lib import fuzz, reference, write_tests

SLUG = "balanced-vote-stretches"


def brute(inp):
    s = inp["votes"]
    total = 0
    for i in range(len(s)):
        for j in range(i + 1, len(s) + 1):
            part = s[i:j]
            total += part.count("Y") == part.count("N")
    return total


def rand_votes(rng, n, weights=(1, 1, 1)):
    return "".join(rng.choices("YNA", weights=weights, k=n))


def main():
    rng = random.Random(36)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: {"votes": rand_votes(rng, rng.randint(0, 14))}, rounds=600)
    cases = [
        ({"votes": "YNAY"}, True),
        ({"votes": "AAA"}, True),
        ({"votes": "YYNNY"}, True),
        ({"votes": ""}, False),
        ({"votes": "Y"}, False),
        ({"votes": "A"}, False),
        ({"votes": "YN"}, False),
        ({"votes": "YYYY"}, False),
        ({"votes": "NNNNAN"}, False),
        ({"votes": "YNYNYNYNYN"}, False),
        ({"votes": "YANAYANA"}, False),
    ]
    for _ in range(170):
        w = rng.choice([(1, 1, 1), (3, 3, 1), (1, 1, 4), (5, 1, 1)])
        cases.append(({"votes": rand_votes(rng, rng.randint(1, 20), w)}, False))
    for _ in range(25):
        cases.append(({"votes": rand_votes(rng, rng.randint(50, 200))}, False))
    cases.append(({"votes": rand_votes(rng, 20000)}, False))
    cases.append(({"votes": "A" * 30000}, False))
    cases.append(({"votes": "YN" * 10000}, False))
    cases.append(({"votes": "Y" * 10000 + "N" * 10000}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["votes"]) <= 200)


if __name__ == "__main__":
    main()
