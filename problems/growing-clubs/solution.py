from typing import List


class Solution:
    def largestClubAfterEach(self, n: int, friendships: List[List[int]]) -> List[int]:
        parent = list(range(n))
        size = [1] * n

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        largest = 1
        out = []
        for a, b in friendships:
            ra, rb = find(a), find(b)
            if ra != rb:
                if size[ra] < size[rb]:
                    ra, rb = rb, ra
                parent[rb] = ra
                size[ra] += size[rb]
                largest = max(largest, size[ra])
            out.append(largest)
        return out
