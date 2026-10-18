import random

from lib import fuzz, reference, write_tests

SLUG = "deepest-bracket-nesting"


def brute(inp):
    # Independent: repeatedly delete innermost empty pairs; each round peels one level.
    s = "".join(ch for ch in inp["text"] if ch in "()[]{}")
    depth = 0
    while s:
        # Remove only the pairs that are adjacent in s (the innermost level).
        out, i = [], 0
        while i < len(s):
            if i + 1 < len(s) and s[i] + s[i + 1] in ("()", "[]", "{}"):
                i += 2
            else:
                out.append(s[i])
                i += 1
        t = "".join(out)
        if t == s:
            return -1
        s = t
        depth += 1
    return depth


def small(rng):
    n = rng.randint(0, 14)
    pool = rng.choice(["()", "()[]{}", "()[]{}x ", "(([[{{}}]]))ab"])
    if rng.random() < 0.5:
        # build a well-formed string, possibly mutated
        out, stack = [], []
        for _ in range(n):
            if stack and rng.random() < 0.45:
                out.append(")]}"["([{".index(stack.pop())])
            elif rng.random() < 0.2:
                out.append(rng.choice("ab ,:"))
            else:
                c = rng.choice("([{"[: rng.randint(1, 3)])
                stack.append(c)
                out.append(c)
        while stack:
            out.append(")]}"["([{".index(stack.pop())])
        if out and rng.random() < 0.3:
            out[rng.randrange(len(out))] = rng.choice("()[]{}")
        return {"text": "".join(out)}
    return {"text": "".join(rng.choice(pool) for _ in range(n))}


def main():
    rng = random.Random(29)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: small(rng), rounds=800)
    cases = [
        ({"text": "f(a[i], {b: 2})"}, True),
        ({"text": "{[}]"}, True),
        ({"text": "no brackets here!"}, True),
        ({"text": ""}, False),
        ({"text": "("}, False),
        ({"text": ")"}, False),
        ({"text": ")("}, False),
        ({"text": "()"}, False),
        ({"text": "()()()"}, False),
        ({"text": "((()))"}, False),
        ({"text": "([{}])"}, False),
        ({"text": "([{}])]"}, False),
        ({"text": "[(])"}, False),
        ({"text": "if (x > 0) { arr[i] = (y + 1); }"}, False),
        ({"text": "<<>> are not brackets"}, False),
        ({"text": "{{{{}}}}}"}, False),
        ({"text": 'say "(hi)" \\ [ok] ~`'}, False),
    ]
    for _ in range(220):
        cases.append((small(rng), False))
    cases.append(({"text": "(" * 5000 + ")" * 5000}, False))
    cases.append(({"text": "([{" * 1500 + "}])" * 1500}, False))
    cases.append(({"text": "([{" * 1500 + "}])" * 1499 + ")]}"}, False))
    cases.append(({"text": "(a)[b]{c}" * 1000}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["text"]) <= 200)
    for inp, _ in cases[-4:]:
        print("  large expected:", ref(inp))


if __name__ == "__main__":
    main()
