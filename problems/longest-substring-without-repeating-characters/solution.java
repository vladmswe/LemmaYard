import java.util.*;

class Solution {
    public int lengthOfLongestSubstring(String s) {
        Map<Character, Integer> lastSeen = new HashMap<>();
        int start = 0;
        int best = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            int prev = lastSeen.getOrDefault(ch, -1);
            if (prev >= start) start = prev + 1;
            lastSeen.put(ch, i);
            best = Math.max(best, i - start + 1);
        }
        return best;
    }
}
