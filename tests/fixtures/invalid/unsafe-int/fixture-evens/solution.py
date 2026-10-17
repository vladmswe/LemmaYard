from typing import List


class Solution:
    def evens(self, nums: List[int]) -> List[int]:
        return [n for n in nums if n % 2 == 0]
