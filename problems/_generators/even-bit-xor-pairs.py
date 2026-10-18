import random

from lib import fuzz, reference, write_tests

SLUG = "even-bit-xor-pairs"


def brute(inp):
    a = inp["nums"]
    total = 0
    for i in range(len(a)):
        for j in range(i + 1, len(a)):
            x, ones = a[i] ^ a[j], 0
            while x:
                ones += x % 2
                x //= 2
            total += ones % 2 == 0
    return total


def main():
    rng = random.Random(33)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: {"nums": [rng.randint(0, 40) for _ in range(rng.randint(0, 12))]}, rounds=600)
    cases = [
        ({"nums": [3, 5, 6, 1]}, True),
        ({"nums": [7, 7, 2]}, True),
        ({"nums": [0, 1, 2, 4, 8]}, True),
        ({"nums": []}, False),
        ({"nums": [5]}, False),
        ({"nums": [0, 0]}, False),
        ({"nums": [0, 1]}, False),
        ({"nums": [1000000000, 999999999, 536870912, 1073741823 - 73741823]}, False),
        ({"nums": [2**k for k in range(30)]}, False),
        ({"nums": [2**k - 1 for k in range(1, 31)]}, False),
        ({"nums": list(range(64))}, False),
    ]
    for _ in range(120):
        cases.append(({"nums": [rng.randint(0, 31) for _ in range(rng.randint(0, 15))]}, False))
    for _ in range(60):
        cases.append(({"nums": [rng.randint(0, 10**9) for _ in range(rng.randint(5, 30))]}, False))
    cases.append(({"nums": [rng.randint(0, 10**9) for _ in range(2000)]}, False))
    cases.append(({"nums": [rng.choice([3, 5, 6, 9, 10, 12]) for _ in range(6000)]}, False))
    cases.append(({"nums": [7] * 8000}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["nums"]) <= 2000)


if __name__ == "__main__":
    main()
