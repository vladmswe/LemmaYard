import java.util.*;

class Solution {
    public int maxProfit(int[] prices) {
        int best = 0;
        int cheapest = prices[0];
        for (int i = 1; i < prices.length; i++) {
            int p = prices[i];
            if (p < cheapest) {
                cheapest = p;
            } else if (p - cheapest > best) {
                best = p - cheapest;
            }
        }
        return best;
    }
}
