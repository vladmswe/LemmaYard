from typing import List


class Solution:
    def average(self, matrix: List[List[float]]) -> float:
        values = [v for row in matrix for v in row]
        return sum(values) / len(values)
