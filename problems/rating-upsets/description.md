A chess club lists its members in the order they joined, together with their
current ratings: `ratings[i]` belongs to the member who joined `i`-th. The
club secretary calls two members an **upset pair** when the member who joined
earlier is rated more than `gap` points above the member who joined later,
that is, positions `i < j` with

`ratings[i] - ratings[j] > gap`.

Return the number of upset pairs.

## Constraints

- `0 <= ratings.length <= 10^5`
- `0 <= ratings[i] <= 10^9`
- `-10^9 <= gap <= 10^9`

## Notes

- `gap` can be negative: with `gap = -1` every pair with
  `ratings[i] >= ratings[j]` counts.
- Checking every pair takes quadratic time. For each member, count the
  matching members on one side with a sorted view of the values seen so far.
