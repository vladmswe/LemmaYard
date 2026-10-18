import random
import string

from lib import fuzz, reference, write_tests

SLUG = "prefix-favorites"


def brute(inp):
    out = []
    for p in inp["prefixes"]:
        best = ""
        best_count = 0
        for q in sorted(set(inp["searches"])):
            if q.startswith(p):
                c = inp["searches"].count(q)
                if c > best_count:
                    best, best_count = q, c
        out.append(best)
    return out


def word(rng, alphabet, lo, hi):
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(lo, hi)))


def rand_case(rng, n, m, alphabet="abc", maxlen=4):
    pool = [word(rng, alphabet, 1, maxlen) for _ in range(max(1, n // 2))]
    searches = [rng.choice(pool) for _ in range(n)]
    prefixes = []
    for _ in range(m):
        if searches and rng.random() < 0.6:
            s = rng.choice(searches)
            prefixes.append(s[: rng.randint(0, len(s))])
        else:
            prefixes.append(word(rng, alphabet, 0, maxlen))
    return {"searches": searches, "prefixes": prefixes}


def main():
    rng = random.Random(42)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng, rng.randint(0, 12), rng.randint(1, 6)))
    cases = [
        ({"searches": ["maps", "math", "maps", "mars", "music", "math", "maps"],
          "prefixes": ["ma", "mu", "mat", "x"]}, True),
        ({"searches": ["tea", "ten", "tea", "ten", "tent"],
          "prefixes": ["te", "tent", ""]}, True),
        ({"searches": [], "prefixes": ["", "a"]}, False),
        ({"searches": ["a"], "prefixes": ["", "a", "aa", "b"]}, False),
        ({"searches": ["b", "a", "c"], "prefixes": [""]}, False),
        ({"searches": ["abc", "ab", "ab", "abc", "abcd"], "prefixes": ["a", "ab", "abc", "abcd", "abcde"]}, False),
        ({"searches": ["zz", "z", "zzz", "zz", "zzz"], "prefixes": ["z", "zz", "zzz"]}, False),
        ({"searches": ["x" * 20, "x" * 19, "x" * 20], "prefixes": ["x" * 20, "x" * 19, "x"]}, False),
    ]
    for i in range(170):
        n = rng.randint(1, 25)
        alpha = rng.choice(["ab", "abc", "abcd", "xyz"])
        cases.append((rand_case(rng, n, rng.randint(1, 8), alpha, rng.randint(1, 5)), False))
    for i in range(40):
        cases.append((rand_case(rng, rng.randint(20, 80), rng.randint(5, 20), "abcdefgh", 6), False))
    # Larger ones (brute-checked only below the size cap).
    big1 = rand_case(rng, 1500, 600, "abcdefghij", 8)
    cases.append((big1, False))
    letters = string.ascii_lowercase
    pool = [word(rng, letters[:5], 6, 12) for _ in range(300)]
    big2 = {"searches": [pool[min(int(rng.expovariate(0.02)), 299)] for _ in range(1500)],
            "prefixes": [p[: rng.randint(0, 6)] for p in rng.sample(pool, 300)]}
    cases.append((big2, False))
    cases.append(({"searches": ["q"] * 2000, "prefixes": ["q"] * 300 + [""] * 10}, False))
    write_tests(SLUG, cases, ref, brute,
                brute_ok=lambda inp: len(inp["searches"]) * len(inp["prefixes"]) <= 2_000_000)


if __name__ == "__main__":
    main()
