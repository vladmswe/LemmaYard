from typing import List


class Solution:
    def joinWords(self, words: List[str], upper: bool) -> str:
        joined = " ".join(words)
        return joined.upper() if upper else joined
