from typing import List


class Solution:
    def countQueenLayouts(self, board: List[str]) -> int:
        n = len(board)
        full = (1 << n) - 1
        blocked = []
        for row in board:
            mask = 0
            for c, ch in enumerate(row):
                if ch == "x":
                    mask |= 1 << c
            blocked.append(mask)

        def place(r, cols, diag, anti):
            if r == n:
                return 1
            total = 0
            free = full & ~(cols | diag | anti | blocked[r])
            while free:
                bit = free & -free
                free ^= bit
                total += place(r + 1, cols | bit, ((diag | bit) << 1) & full, (anti | bit) >> 1)
            return total

        return place(0, 0, 0, 0)
