from typing import List


class Solution:
    def shortestFullSegment(self, genres: List[int]) -> int:
        need = len(set(genres))
        if need == 0:
            return 0
        inside = {}
        best = len(genres)
        left = 0
        for right, g in enumerate(genres):
            inside[g] = inside.get(g, 0) + 1
            while len(inside) == need:
                best = min(best, right - left + 1)
                out = genres[left]
                inside[out] -= 1
                if inside[out] == 0:
                    del inside[out]
                left += 1
        return best
