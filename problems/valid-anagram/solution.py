from typing import List


class Solution:
    def isAnagram(self, s: str, t: str) -> bool:
        if len(s) != len(t):
            return False
        counts: List[int] = [0] * 26
        for a, b in zip(s, t):
            counts[ord(a) - 97] += 1
            counts[ord(b) - 97] -= 1
        return all(c == 0 for c in counts)
