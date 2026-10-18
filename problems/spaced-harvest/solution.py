from typing import List


class Solution:
    def spacedHarvest(self, yields: List[int], gap: int) -> int:
        # best[i + 1] = largest total using only trees 0..i.
        best = [0] * (len(yields) + 1)
        for i, value in enumerate(yields):
            prev = i - gap  # best[i - gap] covers trees 0..i-gap-1
            take = value + (best[prev] if prev > 0 else 0)
            best[i + 1] = max(best[i], take)
        return best[-1]
