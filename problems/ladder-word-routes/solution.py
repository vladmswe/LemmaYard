from typing import List

MOD = 1_000_000_007
LETTERS = "abcdefghijklmnopqrstuvwxyz"


class Solution:
    def countShortestLadders(self, start: str, goal: str, words: List[str]) -> int:
        if start == goal:
            return 1
        dictionary = set(words)
        if goal not in dictionary:
            return 0
        ways = {start: 1}
        level = [start]
        seen = {start}
        while level:
            nxt = {}
            for word in level:
                count = ways[word]
                for i in range(len(word)):
                    head, tail = word[:i], word[i + 1:]
                    for ch in LETTERS:
                        if ch == word[i]:
                            continue
                        cand = head + ch + tail
                        if cand in dictionary and cand not in seen:
                            nxt[cand] = (nxt.get(cand, 0) + count) % MOD
            if goal in nxt:
                return nxt[goal]
            seen.update(nxt)
            ways = nxt
            level = list(nxt)
        return 0
