from typing import List


class Solution:
    def rob(self, nums: List[int]) -> int:
        take, skip = 0, 0  # best total with / without robbing the previous house
        for v in nums:
            take, skip = skip + v, max(take, skip)
        return max(take, skip)
