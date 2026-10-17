from typing import List


class Solution:
    def maxSubArray(self, nums: List[int]) -> int:
        best = nums[0]
        running = 0
        for v in nums:
            running = max(v, running + v)
            best = max(best, running)
        return best
