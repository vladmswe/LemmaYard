from typing import List


class Solution:
    def fizzBuzz(self, n: int) -> List[str]:
        out = []
        for i in range(1, n + 1):
            word = ""
            if i % 3 == 0:
                word += "Fizz"
            if i % 5 == 0:
                word += "Buzz"
            out.append(word or str(i))
        return out
