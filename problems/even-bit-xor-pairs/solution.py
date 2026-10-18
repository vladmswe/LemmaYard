from typing import List


class Solution:
    def countEvenXorPairs(self, nums: List[int]) -> int:
        # popcount(a ^ b) has the same parity as popcount(a) + popcount(b).
        odd = sum(bin(x).count("1") & 1 for x in nums)
        even = len(nums) - odd
        return odd * (odd - 1) // 2 + even * (even - 1) // 2
