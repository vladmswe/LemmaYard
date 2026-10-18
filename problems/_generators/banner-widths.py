import random

from lib import fuzz, reference, write_tests

SLUG = "banner-widths"


def brute(inp):
    h = inp["heights"]
    out = []
    for i in range(len(h)):
        lo = i
        while lo > 0 and h[lo - 1] >= h[i]:
            lo -= 1
        hi = i
        while hi + 1 < len(h) and h[hi + 1] >= h[i]:
            hi += 1
        out.append(hi - lo + 1)
    return out


def main():
    rng = random.Random(41)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: {"heights": [rng.randint(0, 5) for _ in range(rng.randint(0, 14))]}, rounds=600)
    cases = [
        ({"heights": [2, 4, 3, 5, 1, 3]}, True),
        ({"heights": [6, 6, 2, 6]}, True),
        ({"heights": [1, 2, 3, 4]}, True),
        ({"heights": []}, False),
        ({"heights": [0]}, False),
        ({"heights": [1000000000]}, False),
        ({"heights": [5, 5, 5, 5, 5]}, False),
        ({"heights": [4, 3, 2, 1]}, False),
        ({"heights": [1, 3, 5, 3, 1]}, False),
        ({"heights": [5, 1, 5, 1, 5]}, False),
        ({"heights": [0, 7, 0, 7, 7, 0]}, False),
        ({"heights": [3, 1, 3, 2, 2, 3, 1, 3]}, False),
    ]
    for _ in range(170):
        cases.append(({"heights": [rng.randint(0, rng.choice([2, 4, 9, 30])) for _ in range(rng.randint(1, 18))]}, False))
    for _ in range(20):
        cases.append(({"heights": [rng.randint(0, 10**9) for _ in range(rng.randint(30, 80))]}, False))
    cases.append(({"heights": [7] * 2500}, False))
    cases.append(({"heights": [rng.randint(1, 100) for _ in range(1500)]}, False))
    cases.append(({"heights": list(range(1000)) + list(range(1000, 0, -1))}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: True)


if __name__ == "__main__":
    main()
