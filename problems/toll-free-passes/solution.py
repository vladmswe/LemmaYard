import heapq
from typing import List


class Solution:
    def cheapestRoute(self, n: int, roads: List[List[int]], passes: int, source: int, target: int) -> int:
        adj = [[] for _ in range(n)]
        for u, v, toll in roads:
            adj[u].append((v, toll))
            adj[v].append((u, toll))
        inf = float("inf")
        # dist[v][k]: cheapest toll to reach v having used k passes.
        dist = [[inf] * (passes + 1) for _ in range(n)]
        dist[source][0] = 0
        heap = [(0, source, 0)]
        while heap:
            d, v, k = heapq.heappop(heap)
            if d > dist[v][k]:
                continue
            if v == target:
                return d
            for w, toll in adj[v]:
                nd = d + toll
                if nd < dist[w][k]:
                    dist[w][k] = nd
                    heapq.heappush(heap, (nd, w, k))
                if k < passes and d < dist[w][k + 1]:
                    dist[w][k + 1] = d
                    heapq.heappush(heap, (d, w, k + 1))
        return -1
