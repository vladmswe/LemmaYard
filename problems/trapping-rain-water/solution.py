from typing import List


class Solution:
    def trap(self, height: List[int]) -> int:
        lo, hi = 0, len(height) - 1
        left_max = right_max = 0
        total = 0
        while lo < hi:
            if height[lo] <= height[hi]:
                if height[lo] >= left_max:
                    left_max = height[lo]
                else:
                    total += left_max - height[lo]
                lo += 1
            else:
                if height[hi] >= right_max:
                    right_max = height[hi]
                else:
                    total += right_max - height[hi]
                hi -= 1
        return total
