from collections import defaultdict


class Solution:
    def countBalanced(self, votes: str) -> int:
        seen = defaultdict(int)
        seen[0] = 1
        balance = 0
        total = 0
        for v in votes:
            if v == "Y":
                balance += 1
            elif v == "N":
                balance -= 1
            total += seen[balance]
            seen[balance] += 1
        return total
