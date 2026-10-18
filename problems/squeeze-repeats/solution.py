class Solution:
    def squeeze(self, text: str) -> str:
        parts = []
        i, n = 0, len(text)
        while i < n:
            j = i
            while j < n and text[j] == text[i]:
                j += 1
            parts.append(text[i])
            if j - i >= 2:
                parts.append(str(j - i))
            i = j
        squeezed = "".join(parts)
        return squeezed if len(squeezed) < n else text
