from typing import List


class Solution:
    def countSpikes(self, readings: List[int], margin: int) -> int:
        count = 0
        for i in range(1, len(readings) - 1):
            here = readings[i]
            if here - readings[i - 1] > margin and here - readings[i + 1] > margin:
                count += 1
        return count
