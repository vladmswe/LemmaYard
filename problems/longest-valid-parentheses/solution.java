import java.util.*;

class Solution {
    public int longestValidParentheses(String s) {
        // Stack of indices; the bottom element marks the position just before
        // the current candidate run of balanced characters.
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(-1);
        int best = 0;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) == '(') {
                stack.push(i);
            } else {
                stack.pop();
                if (stack.isEmpty()) {
                    stack.push(i);
                } else {
                    best = Math.max(best, i - stack.peek());
                }
            }
        }
        return best;
    }
}
