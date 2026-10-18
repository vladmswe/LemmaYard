A courier drives between `n` depots numbered `0` to `n - 1`. Each entry
`[u, v, toll]` of `roads` is a two-way road between depots `u` and `v` that
charges `toll` coins every time it is driven, in either direction. There can
be several roads between the same two depots.

The courier also holds `passes` toll-free passes. Using one pass on a road
makes that drive cost nothing; each pass works for one drive only, and the
courier decides on which drives to use them (or not to use them at all).

Return the smallest total toll the courier has to pay to get from depot
`source` to depot `target`. If `target` cannot be reached, return `-1`. If
`source == target`, the answer is `0`.

## Constraints

- `1 <= n <= 5000`
- `0 <= roads.length <= 10^4`
- `roads[i].length == 3`, `0 <= u, v < n`, `u != v`
- `0 <= toll <= 10^6`
- `0 <= passes <= 10`
- `0 <= source, target < n`

## Notes

Where the courier is is not enough to describe the trip so far: how many
passes are left matters too. A shortest-path search over pairs (depot, passes
used) handles both.
