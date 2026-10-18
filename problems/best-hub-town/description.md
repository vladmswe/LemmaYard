A rural region has `n` towns numbered `0` to `n - 1`, connected by `n - 1`
roads so that there is exactly one route between any two towns. The road
network is given as a tree hanging from town `0`:

- `parent[0] == -1`;
- for every other town `i`, there is a road between `i` and `parent[i]` of
  length `roadLength[i]` (`roadLength[0]` is `0` and means nothing).

A parent may have a larger number than its child; the only promise is that
following `parent` from any town ends at town `0`.

Town `i` has `population[i]` residents. The region wants to build a delivery
hub in one town `h`. Every resident of every town drives to the hub along the
unique route, so the **total travel** of hub `h` is the sum over all towns
`v` of `population[v] * dist(v, h)`, where `dist` is the total length of the
roads on the route.

Return `[h, total]` for the hub with the smallest total travel. If several
towns tie, choose the smallest town number.

## Constraints

- `1 <= n <= 2 * 10^4`, `parent.length == population.length == roadLength.length == n`
- `parent[0] == -1`, `roadLength[0] == 0`
- For `i > 0`: `0 <= parent[i] < n`, `parent[i] != i`, `1 <= roadLength[i] <= 1000`
- `0 <= population[i] <= 1000`
- The roads form a tree.

## Notes

Computing every total from scratch is quadratic. Compute the total of town
`0` once; moving the hub across one road changes the total by the road length
times (residents on the far side minus residents on the near side). Chains can
be very deep, so walk the tree with an explicit stack or in BFS order.
