import java.util.*;

class Solution {
    // The tests hold values beyond 32 bits, so the template declares long here.
    public long[] evens(long[] nums) {
        return Arrays.stream(nums).filter(n -> n % 2 == 0).toArray();
    }
}
