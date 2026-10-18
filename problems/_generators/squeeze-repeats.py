import itertools
import random
import re

from lib import fuzz, reference, write_tests

SLUG = "squeeze-repeats"


def brute(inp):
    # Independent: a regex finds the repeated blocks.
    t = inp["text"]
    s = re.sub(r"([a-z])\1+", lambda m: m.group(1) + str(len(m.group(0))), t)
    return s if len(s) < len(t) else t


def small(rng):
    alphabet = "abc"[: rng.randint(1, 3)]
    out = []
    for _ in range(rng.randint(0, 6)):
        out.append(rng.choice(alphabet) * rng.choice([1, 1, 2, 3, rng.randint(1, 12)]))
    return {"text": "".join(out)}


def main():
    rng = random.Random(24)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=600)
    cases = [
        ({"text": "zzzzzzzzzzzyab"}, True),
        ({"text": "aabbcc"}, True),
        ({"text": "pppqrrrr"}, True),
        ({"text": ""}, False),
        ({"text": "a"}, False),
        ({"text": "aa"}, False),
        ({"text": "aaa"}, False),
        ({"text": "abcdefg"}, False),
        ({"text": "a" * 10}, False),
        ({"text": "aab"}, False),
        ({"text": "aaab"}, False),
        ({"text": "b" * 100 + "c"}, False),
        ({"text": "xyzzyx"}, False),
    ]
    for _ in range(220):
        cases.append((small(rng), False))
    cases.append(({"text": "q" * 20000}, False))
    cases.append(({"text": "".join(rng.choice("ab") for _ in range(8000))}, False))
    cases.append(({"text": "".join(c * rng.randint(1, 30) for c in itertools.islice(itertools.cycle("abcdefghij"), 600))}, False))
    cases.append(({"text": "".join(chr(97 + i % 26) for i in range(4000))}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: True)


if __name__ == "__main__":
    main()
