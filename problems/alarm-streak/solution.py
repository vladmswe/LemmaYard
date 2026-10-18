from typing import List


class Solution:
    def longestAlarmStreak(self, load: List[int], k: int, limit: int) -> int:
        n = len(load)
        if k > n:
            return 0
        window = sum(load[:k])
        best = streak = 0
        for s in range(n - k + 1):
            if s > 0:
                window += load[s + k - 1] - load[s - 1]
            if window > limit:
                streak += 1
                best = max(best, streak)
            else:
                streak = 0
        return best
