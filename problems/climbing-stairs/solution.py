from typing import List


class Solution:
    def climbStairs(self, n: int) -> int:
        ways = [0] * (n + 1)
        ways[0] = 1
        for i in range(1, n + 1):
            ways[i] = ways[i - 1] + (ways[i - 2] if i >= 2 else 0)
        return ways[n]
