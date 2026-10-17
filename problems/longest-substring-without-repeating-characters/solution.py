from typing import List


class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        last_seen = {}
        start = 0
        best = 0
        for i, ch in enumerate(s):
            prev = last_seen.get(ch, -1)
            if prev >= start:
                start = prev + 1
            last_seen[ch] = i
            if i - start + 1 > best:
                best = i - start + 1
        return best
