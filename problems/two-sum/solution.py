from typing import List


class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, value in enumerate(nums):
            j = seen.get(target - value)
            if j is not None:
                return [j, i]
            seen[value] = i
        return []
