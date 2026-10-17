from typing import List


class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        best = 0
        cheapest = prices[0]
        for p in prices[1:]:
            if p < cheapest:
                cheapest = p
            elif p - cheapest > best:
                best = p - cheapest
        return best
