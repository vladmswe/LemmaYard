A power substation logs its load once a minute in `load`. A monitor looks at
every block of `k` consecutive minutes: the block that starts at minute `s`
covers `load[s]` through `load[s + k - 1]`, and it **raises an alarm** when
the total load in the block is strictly greater than `limit`.

The operators want to know how long the worst alarm streak lasted: return the
largest number of consecutive start minutes `s, s + 1, ..., s + t - 1` whose
blocks all raise an alarm. Return `0` if no block raises an alarm, or if
`k` is larger than the number of readings (then there are no blocks at all).

## Constraints

- `0 <= load.length <= 10^5`
- `0 <= load[i] <= 10^6`
- `1 <= k <= 10^5`
- `0 <= limit <= 10^11`
