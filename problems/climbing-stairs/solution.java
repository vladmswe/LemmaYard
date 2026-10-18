import java.util.*;

class Solution {
    // The answer outgrows 32 bits for larger n, so it is a long.
    public long climbStairs(int n) {
        long prev = 1; // ways to reach step i - 2
        long cur = 1;  // ways to reach step i - 1
        for (int i = 2; i <= n; i++) {
            long next = prev + cur;
            prev = cur;
            cur = next;
        }
        return cur;
    }
}
