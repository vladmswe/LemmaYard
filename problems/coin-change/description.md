You have an unlimited supply of coins of each value listed in `coins`. Return the smallest number of coins whose values add up to exactly `amount`. If no combination of coins produces that total, return `-1`.

Making an `amount` of `0` needs no coins, so the answer in that case is `0`.

## Constraints

- `1 <= coins.length <= 12`
- `1 <= coins[i] <= 10^4`
- `0 <= amount <= 10^4`
- `coins` may contain the same value more than once.

## Notes

- Always grabbing the largest coin that still fits does not always give the fewest coins.
