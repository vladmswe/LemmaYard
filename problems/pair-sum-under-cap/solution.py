from typing import List


class Solution:
    def bestPairSum(self, prices: List[int], cap: int) -> int:
        ordered = sorted(prices)
        lo, hi = 0, len(ordered) - 1
        best = -1
        while lo < hi:
            total = ordered[lo] + ordered[hi]
            if total <= cap:
                best = max(best, total)
                lo += 1
            else:
                hi -= 1
        return best
