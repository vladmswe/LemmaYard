class Solution:
    def deepestNesting(self, text: str) -> int:
        partner = {")": "(", "]": "[", "}": "{"}
        stack = []
        deepest = 0
        for ch in text:
            if ch in "([{":
                stack.append(ch)
                deepest = max(deepest, len(stack))
            elif ch in partner:
                if not stack or stack[-1] != partner[ch]:
                    return -1
                stack.pop()
        return -1 if stack else deepest
