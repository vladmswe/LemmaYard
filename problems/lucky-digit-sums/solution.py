class Solution:
    def countLucky(self, lo: int, hi: int, k: int) -> int:
        # Digit sum of lo once, then update it incrementally: adding 1 turns
        # every trailing 9 into 0 (-9 each) and raises the next digit by 1.
        s = 0
        x = lo
        while x:
            s += x % 10
            x //= 10
        count = 0
        n = lo
        while True:
            if s % k == 0:
                count += 1
            if n == hi:
                break
            m = n
            while m % 10 == 9:
                s -= 9
                m //= 10
            s += 1
            n += 1
        return count
