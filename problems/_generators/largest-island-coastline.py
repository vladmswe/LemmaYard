import random

from lib import fuzz, reference, write_tests

SLUG = "largest-island-coastline"


def brute(inp):
    """Label propagation (each land cell takes the minimum label of its
    neighbours until stable), then coastline = 4 * area - 2 * inner edges."""
    g = inp["grid"]
    R, C = len(g), len(g[0])
    label = {(r, c): r * C + c for r in range(R) for c in range(C) if g[r][c] == "#"}
    changed = True
    while changed:
        changed = False
        for (r, c) in label:
            for n in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if n in label and label[n] < label[(r, c)]:
                    label[(r, c)] = label[n]
                    changed = True
    area, inner = {}, {}
    for (r, c), lab in label.items():
        area[lab] = area.get(lab, 0) + 1
        inner.setdefault(lab, 0)
        if (r + 1, c) in label:
            inner[lab] += 1
        if (r, c + 1) in label:
            inner[lab] += 1
    best = (0, 0)
    for lab in area:
        best = max(best, (area[lab], 4 * area[lab] - 2 * inner[lab]))
    return best[1]


def rand_grid(rng, R, C, p):
    return ["".join("#" if rng.random() < p else "." for _ in range(C)) for _ in range(R)]


def main():
    rng = random.Random(34)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: {"grid": rand_grid(rng, rng.randint(1, 7), rng.randint(1, 7), rng.random())}, rounds=500)
    cases = [
        ({"grid": ["##..#", "#...#", "..###", "#...."]}, True),
        ({"grid": ["###", "#.#", "###"]}, True),
        ({"grid": ["#.#.", "....", ".#.#"]}, True),
        ({"grid": ["."]}, False),
        ({"grid": ["#"]}, False),
        ({"grid": ["....", "...."]}, False),
        ({"grid": ["####", "####"]}, False),
        ({"grid": ["#" * 20]}, False),
        ({"grid": ["#"] * 20}, False),
        ({"grid": ["##..##", "##..##"]}, False),
        ({"grid": ["#.", ".#"]}, False),
        ({"grid": ["#####", "#...#", "#.#.#", "#...#", "#####"]}, False),
        ({"grid": ["".join("#" if (r + c) % 2 == 0 else "." for c in range(15)) for r in range(15)]}, False),
    ]
    for _ in range(140):
        cases.append(({"grid": rand_grid(rng, rng.randint(1, 8), rng.randint(1, 8), rng.choice([0.3, 0.5, 0.6, 0.8]))}, False))
    for _ in range(25):
        cases.append(({"grid": rand_grid(rng, rng.randint(10, 25), rng.randint(10, 25), rng.choice([0.4, 0.55, 0.7]))}, False))
    cases.append(({"grid": rand_grid(rng, 150, 150, 0.6)}, False))
    cases.append(({"grid": ["#" * 150] * 150}, False))
    # serpentine island: one long winding strip
    snake = []
    for r in range(120):
        if r % 2 == 0:
            snake.append("#" * 120)
        elif r % 4 == 1:
            snake.append("." * 119 + "#")
        else:
            snake.append("#" + "." * 119)
    cases.append(({"grid": snake}, False))
    write_tests(SLUG, cases, ref, brute, brute_ok=lambda inp: len(inp["grid"]) * len(inp["grid"][0]) <= 700)


if __name__ == "__main__":
    main()
