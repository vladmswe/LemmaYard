from typing import List


class Solution:
    def countTwinPairs(self, words: List[str]) -> int:
        seen = {}
        pairs = 0
        for word in words:
            pairs += seen.get(word[::-1], 0)
            seen[word] = seen.get(word, 0) + 1
        return pairs
