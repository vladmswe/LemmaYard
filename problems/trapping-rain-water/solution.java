import java.util.*;

class Solution {
    public int trap(int[] height) {
        int lo = 0;
        int hi = height.length - 1;
        int leftMax = 0;
        int rightMax = 0;
        int total = 0;
        while (lo < hi) {
            if (height[lo] <= height[hi]) {
                if (height[lo] >= leftMax) {
                    leftMax = height[lo];
                } else {
                    total += leftMax - height[lo];
                }
                lo++;
            } else {
                if (height[hi] >= rightMax) {
                    rightMax = height[hi];
                } else {
                    total += rightMax - height[hi];
                }
                hi--;
            }
        }
        return total;
    }
}
