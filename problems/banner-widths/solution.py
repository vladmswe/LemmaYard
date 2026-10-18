from typing import List


class Solution:
    def bannerWidths(self, heights: List[int]) -> List[int]:
        n = len(heights)
        left = [-1] * n  # nearest index to the left with a smaller height
        right = [n] * n  # nearest index to the right with a smaller height
        stack = []
        for i, h in enumerate(heights):
            while stack and heights[stack[-1]] > h:
                right[stack.pop()] = i
            # The new top has height <= h; skip equal heights for the left limit.
            j = len(stack) - 1
            stack.append(i)
            if j >= 0:
                left[i] = stack[j] if heights[stack[j]] < h else left[stack[j]]
        return [right[i] - left[i] - 1 for i in range(n)]
