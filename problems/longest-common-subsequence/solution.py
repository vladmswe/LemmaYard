from typing import List


class Solution:
    def longestCommonSubsequence(self, text1: str, text2: str) -> int:
        if len(text1) < len(text2):
            text1, text2 = text2, text1
        m = len(text2)
        prev = [0] * (m + 1)
        for a in text1:
            cur = [0] * (m + 1)
            for j in range(m):
                if a == text2[j]:
                    cur[j + 1] = prev[j] + 1
                else:
                    left = cur[j]
                    up = prev[j + 1]
                    cur[j + 1] = left if left > up else up
            prev = cur
        return prev[m]
