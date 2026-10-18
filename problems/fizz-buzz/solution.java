import java.util.*;

class Solution {
    public String[] fizzBuzz(int n) {
        String[] out = new String[n];
        for (int i = 1; i <= n; i++) {
            String word = "";
            if (i % 3 == 0) word += "Fizz";
            if (i % 5 == 0) word += "Buzz";
            out[i - 1] = word.isEmpty() ? Integer.toString(i) : word;
        }
        return out;
    }
}
