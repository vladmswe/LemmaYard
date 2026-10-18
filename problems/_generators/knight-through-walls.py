import random

from lib import fuzz, reference, write_tests

SLUG = "knight-through-walls"
INF = float("inf")


def brute(inp):
    """Bellman-Ford style relaxation over all open squares until stable."""
    b = inp["board"]
    R, C = len(b), len(b[0])
    cells = [(r, c) for r in range(R) for c in range(C) if b[r][c] != "#"]
    d = {cell: INF for cell in cells}
    s = next(x for x in cells if b[x[0]][x[1]] == "S")
    t = next(x for x in cells if b[x[0]][x[1]] == "T")
    d[s] = 0
    changed = True
    while changed:
        changed = False
        for (r, c) in cells:
            for dr in (-2, -1, 1, 2):
                for dc in (-2, -1, 1, 2):
                    if abs(dr) == abs(dc):
                        continue
                    n = (r + dr, c + dc)
                    if n in d and d[n] + 1 < d[(r, c)]:
                        d[(r, c)] = d[n] + 1
                        changed = True
    return -1 if d[t] == INF else d[t]


def rand_board(rng, R, C, p):
    g = [["#" if rng.random() < p else "." for _ in range(C)] for _ in range(R)]
    cells = [(r, c) for r in range(R) for c in range(C)]
    s, t = rng.sample(cells, 2)
    g[s[0]][s[1]] = "S"
    g[t[0]][t[1]] = "T"
    return ["".join(row) for row in g]


def rand_input(rng, maxside):
    while True:
        R, C = rng.randint(1, maxside), rng.randint(1, maxside)
        if R * C >= 2:
            return {"board": rand_board(rng, R, C, rng.choice([0.0, 0.15, 0.3, 0.45]))}


def main():
    rng = random.Random(37)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: rand_input(rng, 7), rounds=600)
    cases = [
        ({"board": ["S...", ".#..", "...T"]}, True),
        ({"board": ["S#.", "#..", ".#T"]}, True),
        ({"board": ["ST.", "...", "..."]}, True),
        ({"board": ["ST"]}, False),
        ({"board": ["S", ".", ".", "T"]}, False),
        ({"board": ["S..", ".T.", "..."]}, False),
        ({"board": ["S.", ".T"]}, False),
        ({"board": ["S...", "....", "....", "...T"]}, False),
        ({"board": ["S.#", "#..", "..#", ".T."]}, False),
        ({"board": ["S" + "." * 7, "." * 8, "." * 8, "." * 8, "." * 8, "." * 8, "." * 8, "." * 7 + "T"]}, False),
        ({"board": ["S...", "..#.", ".#..", "...T"]}, False),
    ]
    for _ in range(150):
        cases.append((rand_input(rng, 8), False))
    for _ in range(20):
        R, C = rng.randint(10, 20), rng.randint(10, 20)
        cases.append(({"board": rand_board(rng, R, C, rng.choice([0.2, 0.35]))}, False))
    big = [["."] * 150 for _ in range(150)]
    big[0][0] = "S"
    big[149][149] = "T"
    cases.append(({"board": ["".join(r) for r in big]}, False))
    rnd = [["#" if rng.random() < 0.3 else "." for _ in range(150)] for _ in range(150)]
    rnd[0][0], rnd[149][148] = "S", "T"
    cases.append(({"board": ["".join(r) for r in rnd]}, False))
    walled = [["."] * 120 for _ in range(120)]
    for r in range(120):
        walled[r][60] = walled[r][61] = "#"
    walled[5][5], walled[100][110] = "S", "T"
    cases.append(({"board": ["".join(r) for r in walled]}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["board"]) * len(inp["board"][0]) <= 400)


if __name__ == "__main__":
    main()
