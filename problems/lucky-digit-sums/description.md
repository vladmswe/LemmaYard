A raffle office prints one ticket for every integer from `lo` to `hi`
(inclusive). A ticket is **lucky** when the sum of the decimal digits of its
number is divisible by `k`. For example, with `k = 5` the ticket `2021` is
lucky (2 + 0 + 2 + 1 = 5) and `77` is not (7 + 7 = 14).

Return how many lucky tickets the office prints.

## Constraints

- `0 <= lo <= hi <= 10^9`
- `hi - lo <= 2 * 10^5`
- `1 <= k <= 100`

## Notes

The digit sum of `0` is `0`, which is divisible by every `k`.
