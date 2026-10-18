from collections import deque
from typing import List

JUMPS = ((1, 2), (1, -2), (-1, 2), (-1, -2), (2, 1), (2, -1), (-2, 1), (-2, -1))


class Solution:
    def knightMoves(self, board: List[str]) -> int:
        rows, cols = len(board), len(board[0])
        start = target = None
        for r, row in enumerate(board):
            for c, ch in enumerate(row):
                if ch == "S":
                    start = (r, c)
                elif ch == "T":
                    target = (r, c)
        dist = [[-1] * cols for _ in range(rows)]
        dist[start[0]][start[1]] = 0
        queue = deque([start])
        while queue:
            r, c = queue.popleft()
            if (r, c) == target:
                return dist[r][c]
            for dr, dc in JUMPS:
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and board[nr][nc] != "#" and dist[nr][nc] < 0:
                    dist[nr][nc] = dist[r][c] + 1
                    queue.append((nr, nc))
        return -1
