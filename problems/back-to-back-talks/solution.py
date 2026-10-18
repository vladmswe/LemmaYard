from typing import List


class Solution:
    def maxTalks(self, talks: List[List[int]]) -> int:
        # Greedy: always take the compatible talk that ends first.
        spans = sorted((start + duration, start) for start, duration in talks)
        attended = 0
        free_at = None
        for end, start in spans:
            if free_at is None or start >= free_at:
                attended += 1
                free_at = end
        return attended
