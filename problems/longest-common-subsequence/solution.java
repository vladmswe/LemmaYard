import java.util.*;

class Solution {
    public int longestCommonSubsequence(String text1, String text2) {
        if (text1.length() < text2.length()) {
            String swap = text1;
            text1 = text2;
            text2 = swap;
        }
        int m = text2.length();
        int[] prev = new int[m + 1];
        for (int i = 0; i < text1.length(); i++) {
            int[] cur = new int[m + 1];
            char a = text1.charAt(i);
            for (int j = 0; j < m; j++) {
                if (a == text2.charAt(j)) {
                    cur[j + 1] = prev[j] + 1;
                } else {
                    cur[j + 1] = Math.max(cur[j], prev[j + 1]);
                }
            }
            prev = cur;
        }
        return prev[m];
    }
}
