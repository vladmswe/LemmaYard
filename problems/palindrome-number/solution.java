import java.util.*;

class Solution {
    // Some tests go beyond 32 bits, so x is a long.
    public boolean isPalindrome(long x) {
        if (x < 0) return false;
        long reversed = 0;
        long rest = x;
        while (rest > 0) {
            reversed = reversed * 10 + rest % 10;
            rest /= 10;
        }
        return reversed == x;
    }
}
