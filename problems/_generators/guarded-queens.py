import itertools
import random

from lib import fuzz, reference, write_tests

SLUG = "guarded-queens"


def brute(inp):
    """All column permutations (n <= 8), checked square by square."""
    b = inp["board"]
    n = len(b)
    count = 0
    for perm in itertools.permutations(range(n)):
        if any(b[r][perm[r]] == "x" for r in range(n)):
            continue
        if len({r - perm[r] for r in range(n)}) == n and len({r + perm[r] for r in range(n)}) == n:
            count += 1
    return count


def naive(inp):
    """Plain backtracking over (row, col) lists, no bit masks (any n)."""
    b = inp["board"]
    n = len(b)
    placed = []
    count = 0
    stack = [0]  # next column to try in each row
    while stack:
        r = len(stack) - 1
        c = stack[-1]
        if r == n:
            count += 1
            stack.pop()
            placed.pop()
            stack[-1] += 1
            continue
        if c == n:
            stack.pop()
            if not stack:
                break
            placed.pop()
            stack[-1] += 1
            continue
        ok = b[r][c] == "." and all(pc != c and abs(pc - c) != r - pr for pr, pc in placed)
        if ok:
            placed.append((r, c))
            stack.append(0)
        else:
            stack[-1] += 1
    return count


def rand_board(rng, n, p):
    return ["".join("x" if rng.random() < p else "." for _ in range(n)) for _ in range(n)]


def main():
    rng = random.Random(45)
    ref = reference(SLUG)
    fuzz(ref, brute, lambda i: {"board": rand_board(rng, rng.randint(1, 7), rng.choice([0, 0.1, 0.2, 0.4]))}, rounds=500)
    fuzz(ref, naive, lambda i: {"board": rand_board(rng, rng.randint(1, 9), rng.choice([0, 0.1, 0.2]))}, rounds=150,
         label="fuzz naive")
    cases = [
        ({"board": ["....", "....", "....", "...."]}, True),
        ({"board": [".x..", "....", "....", "..x."]}, True),
        ({"board": ["x.x", "...", "..."]}, True),
        ({"board": ["."]}, False),
        ({"board": ["x"]}, False),
        ({"board": ["..", ".."]}, False),
        ({"board": ["xxxx", "....", "....", "...."]}, False),
        ({"board": ["....."] * 5}, False),
        ({"board": ["......"] * 6}, False),
        ({"board": ["......."] * 7}, False),
        ({"board": ["........"] * 8}, False),
        ({"board": ["........."] * 9}, False),
        ({"board": [".........."] * 10}, False),
        ({"board": ["x" * 10] + ["." * 10] * 9}, False),
        ({"board": ["." * 10 if r != 4 else "....x....." for r in range(10)]}, False),
        ({"board": ["".join("x" if r == c else "." for c in range(10)) for r in range(10)]}, False),
    ]
    for _ in range(180):
        n = rng.randint(1, 7)
        cases.append(({"board": rand_board(rng, n, rng.choice([0, 0.05, 0.1, 0.2, 0.3, 0.5]))}, False))
    for _ in range(20):
        n = rng.randint(8, 9)
        cases.append(({"board": rand_board(rng, n, rng.choice([0.05, 0.1, 0.2]))}, False))
    for _ in range(4):
        cases.append(({"board": rand_board(rng, 10, rng.choice([0.03, 0.08]))}, False))
    write_tests(SLUG, cases, ref, lambda inp: brute(inp) if len(inp["board"]) <= 7 else naive(inp),
                brute_ok=lambda inp: True)


if __name__ == "__main__":
    main()
