from typing import List


class Solution:
    def anagramFamilies(self, words: List[str]) -> List[int]:
        sizes = {}
        for word in words:
            key = "".join(sorted(word))
            sizes[key] = sizes.get(key, 0) + 1
        shared = sum(1 for size in sizes.values() if size >= 2)
        largest = max(sizes.values(), default=0)
        return [shared, largest]
