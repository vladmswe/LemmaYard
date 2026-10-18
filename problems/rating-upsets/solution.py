from bisect import bisect_left
from typing import List


class Solution:
    def countUpsets(self, ratings: List[int], gap: int) -> int:
        values = sorted(set(ratings))
        size = len(values)
        tree = [0] * (size + 1)  # Fenwick tree over value ranks
        total = 0
        # Walk from the right: for ratings[i], count later ratings r with r < ratings[i] - gap.
        for x in reversed(ratings):
            k = bisect_left(values, x - gap)  # ranks 0..k-1 hold values < x - gap
            while k > 0:
                total += tree[k]
                k -= k & -k
            k = bisect_left(values, x) + 1
            while k <= size:
                tree[k] += 1
                k += k & -k
        return total
