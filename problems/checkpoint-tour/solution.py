from typing import List


class Solution:
    def shortestTour(self, points: List[List[int]]) -> int:
        n = len(points)
        dist = [[abs(a[0] - b[0]) + abs(a[1] - b[1]) for b in points] for a in points]
        inf = float("inf")
        full = 1 << n
        # best[mask][v]: shortest run from 0 stamping exactly `mask`, standing at v.
        best = [[inf] * n for _ in range(full)]
        best[1][0] = 0
        for mask in range(1, full, 2):  # masks that contain checkpoint 0
            row = best[mask]
            for v in range(n):
                here = row[v]
                if here == inf:
                    continue
                dv = dist[v]
                for w in range(n):
                    bit = 1 << w
                    if mask & bit:
                        continue
                    cand = here + dv[w]
                    nxt = best[mask | bit]
                    if cand < nxt[w]:
                        nxt[w] = cand
        return min(best[full - 1])
