from typing import List


class Solution:
    def coinChange(self, coins: List[int], amount: int) -> int:
        unreachable = amount + 1
        dp = [0] + [unreachable] * amount
        for coin in set(coins):
            for total in range(coin, amount + 1):
                if dp[total - coin] + 1 < dp[total]:
                    dp[total] = dp[total - coin] + 1
        return dp[amount] if dp[amount] != unreachable else -1
