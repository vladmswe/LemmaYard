from collections import deque
from typing import List


class Solution:
    def coastline(self, grid: List[str]) -> int:
        rows, cols = len(grid), len(grid[0])
        seen = [[False] * cols for _ in range(rows)]
        best_area, best_coast = 0, 0
        for sr in range(rows):
            for sc in range(cols):
                if grid[sr][sc] != "#" or seen[sr][sc]:
                    continue
                seen[sr][sc] = True
                queue = deque([(sr, sc)])
                area = coast = 0
                while queue:
                    r, c = queue.popleft()
                    area += 1
                    for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "#":
                            if not seen[nr][nc]:
                                seen[nr][nc] = True
                                queue.append((nr, nc))
                        else:
                            coast += 1
                if (area, coast) > (best_area, best_coast):
                    best_area, best_coast = area, coast
        return best_coast
