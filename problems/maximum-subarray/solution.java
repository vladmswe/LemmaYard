import java.util.*;

class Solution {
    public int maxSubArray(int[] nums) {
        int best = nums[0];
        int running = 0;
        for (int v : nums) {
            running = Math.max(v, running + v);
            best = Math.max(best, running);
        }
        return best;
    }
}
