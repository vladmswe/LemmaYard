from typing import List


class Solution:
    def busiestMoment(self, sessions: List[List[int]]) -> List[int]:
        events = []
        for login, logout in sessions:
            events.append((login, 1))
            events.append((logout, -1))
        # At equal times logouts (-1) are applied before logins (+1).
        events.sort()
        online = 0
        best, when = 0, 0
        i = 0
        while i < len(events):
            t = events[i][0]
            while i < len(events) and events[i][0] == t:
                online += events[i][1]
                i += 1
            if online > best:
                best, when = online, t
        return [best, when]
