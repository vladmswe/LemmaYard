import java.util.*;

class Solution {
    public int coinChange(int[] coins, int amount) {
        int unreachable = amount + 1;
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, unreachable);
        dp[0] = 0;
        for (int coin : coins) {
            for (int total = coin; total <= amount; total++) {
                if (dp[total - coin] + 1 < dp[total]) {
                    dp[total] = dp[total - coin] + 1;
                }
            }
        }
        return dp[amount] == unreachable ? -1 : dp[amount];
    }
}
