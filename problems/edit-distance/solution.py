from typing import List


class Solution:
    def minDistance(self, word1: str, word2: str) -> int:
        m = len(word2)
        prev = list(range(m + 1))
        for i, a in enumerate(word1, 1):
            cur = [i] + [0] * m
            for j in range(1, m + 1):
                if a == word2[j - 1]:
                    cur[j] = prev[j - 1]
                else:
                    cur[j] = 1 + min(prev[j - 1], prev[j], cur[j - 1])
            prev = cur
        return prev[m]
