import heapq
from typing import List


class Solution:
    def taskOrder(self, n: int, rules: List[List[int]]) -> List[int]:
        after = [[] for _ in range(n)]
        waiting = [0] * n
        for a, b in rules:
            after[a].append(b)
            waiting[b] += 1
        ready = [v for v in range(n) if waiting[v] == 0]
        heapq.heapify(ready)
        order = []
        while ready:
            v = heapq.heappop(ready)
            order.append(v)
            for w in after[v]:
                waiting[w] -= 1
                if waiting[w] == 0:
                    heapq.heappush(ready, w)
        return order if len(order) == n else []
