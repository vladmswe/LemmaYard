import java.util.*;

class Solution {
    public boolean isValid(String s) {
        Deque<Character> stack = new ArrayDeque<>();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == ')' || ch == ']' || ch == '}') {
                char open = ch == ')' ? '(' : ch == ']' ? '[' : '{';
                if (stack.isEmpty() || stack.pop() != open) return false;
            } else {
                stack.push(ch);
            }
        }
        return stack.isEmpty();
    }
}
