import heapq
from typing import List


class Solution:
    def serverFinishTimes(self, servers: int, jobs: List[int]) -> List[int]:
        finish = [0] * servers
        idle = [(0, k) for k in range(servers)]  # (time it becomes idle, number)
        heapq.heapify(idle)
        for length in jobs:
            free_at, k = heapq.heappop(idle)
            finish[k] = free_at + length
            heapq.heappush(idle, (finish[k], k))
        return finish
