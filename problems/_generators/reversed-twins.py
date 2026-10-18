import random

from lib import fuzz, reference, write_tests

SLUG = "reversed-twins"


def brute(inp):
    w = inp["words"]
    return sum(1 for i in range(len(w)) for j in range(i + 1, len(w)) if w[j] == w[i][::-1])


def word(rng, alphabet, maxlen):
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(1, maxlen)))


def small(rng):
    alphabet = "ab"[: rng.randint(1, 2)] if rng.random() < 0.5 else "abc"
    n = rng.randint(0, 14)
    return {"words": [word(rng, alphabet, rng.randint(1, 3)) for _ in range(n)]}


def main():
    rng = random.Random(25)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=600)
    cases = [
        ({"words": ["stressed", "loop", "desserts", "pool", "polo"]}, True),
        ({"words": ["deed", "noon", "deed", "deed"]}, True),
        ({"words": ["ab", "ba", "ab", "ba"]}, True),
        ({"words": []}, False),
        ({"words": ["a"]}, False),
        ({"words": ["a", "a"]}, False),
        ({"words": ["abc", "abc"]}, False),
        ({"words": ["abc", "cba", "bca", "acb", "cab", "bac"]}, False),
        ({"words": ["ab", "abc", "cba", "ba", "b", "a"]}, False),
        ({"words": ["z" * 20, "z" * 20, "y" + "z" * 19]}, False),
    ]
    for _ in range(220):
        cases.append((small(rng), False))
    # large: many copies of a palindrome (big count), many short random words, long words
    cases.append(({"words": ["level"] * 3000}, False))
    cases.append(({"words": [word(rng, "abc", 3) for _ in range(2500)]}, False))
    cases.append(({"words": [word(rng, "ab", 12) for _ in range(1200)]}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["words"]) <= 5000)


if __name__ == "__main__":
    main()
