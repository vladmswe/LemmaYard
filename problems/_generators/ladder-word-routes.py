import itertools
import random

from lib import fuzz, reference, write_tests

SLUG = "ladder-word-routes"
MOD = 1_000_000_007


def one_apart(a, b):
    return sum(x != y for x, y in zip(a, b)) == 1


def graph(inp):
    nodes = sorted(set(inp["words"]))
    start = inp["start"]
    return nodes, {w: [v for v in nodes if one_apart(w, v) and v != start] for w in set(nodes) | {start}}


def brute(inp):
    """Enumerates every simple route explicitly (tiny dictionaries only) and
    counts the ones of minimal length."""
    start, goal = inp["start"], inp["goal"]
    if start == goal:
        return 1
    nodes, adj = graph(inp)
    if goal not in nodes:
        return 0
    lengths = []
    stack = [(start, (start,))]
    while stack:
        w, path = stack.pop()
        if w == goal:
            lengths.append(len(path))
            continue
        for v in adj[w]:
            if v not in path:
                stack.append((v, path + (v,)))
    if not lengths:
        return 0
    best = min(lengths)
    return lengths.count(best) % MOD


def walks(inp):
    """Counts walks of length 1, 2, ... by dynamic programming over the walk
    length (no visited set). The first length whose walks reach goal is the
    shortest one, and walks of that length never repeat a word."""
    start, goal = inp["start"], inp["goal"]
    if start == goal:
        return 1
    nodes, adj = graph(inp)
    if goal not in nodes:
        return 0
    cur = {start: 1}
    for _ in range(len(nodes) + 1):
        nxt = {}
        for w, c in cur.items():
            for v in adj[w]:
                nxt[v] = nxt.get(v, 0) + c
        if goal in nxt:
            return nxt[goal] % MOD
        cur = nxt
    return 0


def rand_case(rng, length, alphabet, nwords):
    universe = ["".join(p) for p in itertools.product(alphabet, repeat=length)]
    words = [rng.choice(universe) for _ in range(nwords)]
    start = rng.choice(universe)
    goal = rng.choice(words) if words and rng.random() < 0.85 else rng.choice(universe)
    return {"start": start, "goal": goal, "words": words}


def dense_case(rng, length, alphabet, density):
    universe = ["".join(p) for p in itertools.product(alphabet, repeat=length)]
    words = [w for w in universe if rng.random() < density]
    words += rng.sample(words, min(len(words), rng.randint(0, 3)))
    rng.shuffle(words)
    start = rng.choice(universe)
    if words:
        far = max(sum(x != y for x, y in zip(start, w)) for w in words)
        goal = rng.choice([w for w in words if sum(x != y for x, y in zip(start, w)) >= far - 1])
    else:
        goal = rng.choice(universe)
    return {"start": start, "goal": goal, "words": words}


def main():
    rng = random.Random(46)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_case(rng, rng.randint(1, 3), rng.choice(["ab", "abc", "xyz"]), rng.randint(0, 10)),
         rounds=500)
    fuzz(ref, walks, lambda i: rand_case(rng, rng.randint(2, 5), rng.choice(["ab", "abc", "abcd"]), rng.randint(5, 80)),
         rounds=300, label="fuzz walks")
    cases = [
        ({"start": "cold", "goal": "warm", "words": ["cord", "card", "ward", "warm", "word", "worm", "corm", "wold"]}, True),
        ({"start": "cat", "goal": "dog", "words": ["cot", "dot", "cog", "dog", "dat"]}, True),
        ({"start": "lead", "goal": "gold", "words": ["load", "goad", "lend"]}, True),
        ({"start": "a", "goal": "a", "words": []}, False),
        ({"start": "abc", "goal": "abc", "words": ["abd"]}, False),
        ({"start": "a", "goal": "z", "words": ["z"]}, False),
        ({"start": "a", "goal": "z", "words": ["b", "c"]}, False),
        ({"start": "ab", "goal": "cd", "words": ["ad", "cb", "cd", "cd", "ad"]}, False),
        ({"start": "ab", "goal": "ab", "words": ["ab", "ac"]}, False),
        ({"start": "aa", "goal": "bb", "words": ["aa", "ab", "ba", "bb"]}, False),
        ({"start": "hit", "goal": "hot", "words": ["hat", "hut"]}, False),
    ]
    for _ in range(110):
        cases.append((dense_case(rng, rng.randint(2, 4), rng.choice(["ab", "abc", "pqr", "ab"]),
                                 rng.uniform(0.4, 0.95)), False))
    for _ in range(60):
        length = rng.randint(1, 4)
        alpha = rng.choice(["ab", "abc", "abcd", "pqr"])
        cases.append((rand_case(rng, length, alpha, rng.randint(0, 14)), False))
    for _ in range(25):
        cases.append((rand_case(rng, rng.randint(3, 5), "abcd", rng.randint(20, 60)), False))
    # Larger ones.
    full = ["".join(p) for p in itertools.product("abc", repeat=7)]  # 2187 words
    cases.append(({"start": "aaaaaaa", "goal": "ccccccc", "words": full}, False))
    universe = ["".join(p) for p in itertools.product("abcd", repeat=6)]
    some = rng.sample(universe, 1500)
    cases.append(({"start": "aaaaaa", "goal": some[0], "words": some}, False))
    big = ["".join(rng.choice("abcdefghij") for _ in range(8)) for _ in range(1500)]
    cases.append(({"start": big[1], "goal": big[2], "words": big}, False))
    write_tests(SLUG, cases, ref, walks, brute_ok=lambda inp: len(inp["words"]) <= 300)


if __name__ == "__main__":
    main()
