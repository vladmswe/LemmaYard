from typing import List


class Solution:
    def favorites(self, searches: List[str], prefixes: List[str]) -> List[str]:
        counts = {}
        for q in searches:
            counts[q] = counts.get(q, 0) + 1
        # Trie: each node is [children dict, best count, best word].
        root = [{}, 0, ""]
        for word, c in counts.items():
            node = root
            for depth in range(len(word) + 1):
                if c > node[1] or (c == node[1] and word < node[2]):
                    node[1] = c
                    node[2] = word
                if depth == len(word):
                    break
                ch = word[depth]
                nxt = node[0].get(ch)
                if nxt is None:
                    nxt = [{}, 0, ""]
                    node[0][ch] = nxt
                node = nxt
        out = []
        for p in prefixes:
            node = root
            for ch in p:
                node = node[0].get(ch)
                if node is None:
                    break
            out.append("" if node is None else node[2])
        return out
