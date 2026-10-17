from typing import List


class Solution:
    def reverseString(self, s: str) -> str:
        chars: List[str] = list(s)
        i, j = 0, len(chars) - 1
        while i < j:
            chars[i], chars[j] = chars[j], chars[i]
            i += 1
            j -= 1
        return "".join(chars)
