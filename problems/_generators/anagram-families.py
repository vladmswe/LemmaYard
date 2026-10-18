import random
from collections import Counter

from lib import fuzz, reference, write_tests

SLUG = "anagram-families"


def brute(inp):
    # Union positions pairwise when their letter multisets are equal.
    w = inp["words"]
    n = len(w)
    family = list(range(n))
    for i in range(n):
        for j in range(i):
            if Counter(w[i]) == Counter(w[j]):
                family[i] = family[j]
                break
    sizes = Counter(family)
    return [sum(1 for s in sizes.values() if s >= 2), max(sizes.values(), default=0)]


def word(rng, alphabet, maxlen):
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(1, maxlen)))


def small(rng):
    alphabet = rng.choice(["ab", "abc", "abcd"])
    return {"words": [word(rng, alphabet, rng.randint(1, 4)) for _ in range(rng.randint(0, 12))]}


def main():
    rng = random.Random(27)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=600)
    cases = [
        ({"words": ["lemon", "melon", "solemn", "demon", "monde", "lemon"]}, True),
        ({"words": ["tar", "rat", "art", "evil", "vile", "tar", "x"]}, True),
        ({"words": []}, True),
        ({"words": ["a"]}, False),
        ({"words": ["a", "a"]}, False),
        ({"words": ["ab", "ba", "aab", "abb"]}, False),
        ({"words": ["abc", "def", "ghi"]}, False),
        ({"words": ["aabb", "abab", "bbaa", "ab", "ba"]}, False),
        ({"words": ["z" * 20, "z" * 19, "z" * 20]}, False),
        ({"words": ["abcdefghijklmnopqrst", "tsrqponmlkjihgfedcba", "abcdefghijklmnopqrsu"]}, False),
    ]
    for _ in range(220):
        cases.append((small(rng), False))

    def shuffled(s):
        chars = list(s)
        rng.shuffle(chars)
        return "".join(chars)

    bases = [word(rng, "abcdefghij", 8) for _ in range(150)]
    cases.append(({"words": [shuffled(rng.choice(bases)) for _ in range(3000)]}, False))
    cases.append(({"words": [word(rng, "abcdefghijklmnopqrstuvwxyz", 6) for _ in range(2000)]}, False))
    cases.append(({"words": [shuffled("triangle") for _ in range(1500)]}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["words"]) <= 200)
    # large cases: independent check with frozen Counter keys
    for inp, _ in cases[-3:]:
        sizes = Counter(frozenset(Counter(x).items()) for x in inp["words"])
        assert ref(inp) == [sum(1 for s in sizes.values() if s >= 2), max(sizes.values())]


if __name__ == "__main__":
    main()
