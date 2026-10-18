from bisect import bisect_left, bisect_right
from typing import List


class Solution:
    def countInRanges(self, values: List[int], queries: List[List[int]]) -> List[int]:
        ordered = sorted(values)
        answers = []
        for lo, hi in queries:
            if lo > hi:
                answers.append(0)
            else:
                answers.append(bisect_right(ordered, hi) - bisect_left(ordered, lo))
        return answers
