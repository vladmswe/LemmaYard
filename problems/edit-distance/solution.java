import java.util.*;

class Solution {
    public int minDistance(String word1, String word2) {
        int m = word2.length();
        int[] prev = new int[m + 1];
        for (int j = 0; j <= m; j++) prev[j] = j;
        for (int i = 1; i <= word1.length(); i++) {
            int[] cur = new int[m + 1];
            cur[0] = i;
            char a = word1.charAt(i - 1);
            for (int j = 1; j <= m; j++) {
                if (a == word2.charAt(j - 1)) {
                    cur[j] = prev[j - 1];
                } else {
                    cur[j] = 1 + Math.min(prev[j - 1], Math.min(prev[j], cur[j - 1]));
                }
            }
            prev = cur;
        }
        return prev[m];
    }
}
