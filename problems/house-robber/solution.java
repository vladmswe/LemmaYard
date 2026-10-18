import java.util.*;

class Solution {
    public int rob(int[] nums) {
        int take = 0; // best total when robbing the previous house
        int skip = 0; // best total when skipping it
        for (int v : nums) {
            int nextTake = skip + v;
            skip = Math.max(take, skip);
            take = nextTake;
        }
        return Math.max(take, skip);
    }
}
