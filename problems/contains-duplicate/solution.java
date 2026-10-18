import java.util.*;

class Solution {
    public boolean containsDuplicate(int[] nums) {
        Set<Integer> seen = new HashSet<>();
        for (int value : nums) {
            if (!seen.add(value)) return true;
        }
        return false;
    }
}
