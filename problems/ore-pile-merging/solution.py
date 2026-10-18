from typing import List


class Solution:
    def mergeCost(self, piles: List[int]) -> int:
        n = len(piles)
        if n <= 1:
            return 0
        prefix = [0] * (n + 1)
        for i, w in enumerate(piles):
            prefix[i + 1] = prefix[i] + w
        # best[i][j]: cheapest way to turn piles[i..j] into one pile.
        best = [[0] * n for _ in range(n)]
        for length in range(2, n + 1):
            for i in range(n - length + 1):
                j = i + length - 1
                row = best[i]
                cheapest = min(row[k] + best[k + 1][j] for k in range(i, j))
                row[j] = cheapest + prefix[j + 1] - prefix[i]
        return best[0][n - 1]
