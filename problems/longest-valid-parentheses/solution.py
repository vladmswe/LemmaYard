from typing import List


class Solution:
    def longestValidParentheses(self, s: str) -> int:
        # Stack of indices; the bottom element marks the position just before
        # the current candidate run of balanced characters.
        stack = [-1]
        best = 0
        for i, ch in enumerate(s):
            if ch == "(":
                stack.append(i)
            else:
                stack.pop()
                if stack:
                    length = i - stack[-1]
                    if length > best:
                        best = length
                else:
                    stack.append(i)
        return best
