from typing import List


class Solution:
    def firstOverdraft(self, start: int, changes: List[int]) -> int:
        balance = start
        for day, change in enumerate(changes, 1):
            balance += change
            if balance < 0:
                return day
        return 0
