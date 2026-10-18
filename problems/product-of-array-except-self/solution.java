import java.util.*;

class Solution {
    // Products outgrow 32 bits in some tests, so the result is long[].
    public long[] productExceptSelf(int[] nums) {
        int n = nums.length;
        long[] result = new long[n];
        long prefix = 1;
        for (int i = 0; i < n; i++) {
            result[i] = prefix;
            prefix *= nums[i];
        }
        long suffix = 1;
        for (int i = n - 1; i >= 0; i--) {
            result[i] *= suffix;
            suffix *= nums[i];
        }
        return result;
    }
}
