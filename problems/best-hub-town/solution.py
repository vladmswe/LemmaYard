from typing import List


class Solution:
    def bestHub(self, parent: List[int], population: List[int], roadLength: List[int]) -> List[int]:
        n = len(parent)
        children = [[] for _ in range(n)]
        for v in range(1, n):
            children[parent[v]].append(v)
        # BFS order from town 0: every parent comes before its children.
        order = [0]
        for v in order:
            order.extend(children[v])
        depth = [0] * n
        for v in order[1:]:
            depth[v] = depth[parent[v]] + roadLength[v]
        below = population[:]  # residents in the subtree of v
        for v in reversed(order[1:]):
            below[parent[v]] += below[v]
        total_pop = below[0]
        cost = [0] * n
        cost[0] = sum(population[v] * depth[v] for v in range(n))
        for v in order[1:]:
            # Moving the hub from parent[v] to v: below[v] residents get closer.
            cost[v] = cost[parent[v]] + roadLength[v] * (total_pop - 2 * below[v])
        best = 0
        for v in range(1, n):
            if cost[v] < cost[best]:
                best = v
        return [best, cost[best]]
