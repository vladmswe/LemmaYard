Each element of `intervals` is a pair `[start, end]` describing the closed range of numbers from `start` to `end`. The pairs can appear in any order, and some of them may overlap or repeat.

Combine every group of ranges that share at least one point into a single range covering all of them, and return the resulting list of ranges that no longer overlap. Ranges that only touch at an endpoint, such as `[1, 4]` and `[4, 5]`, share the point `4` and must be combined into `[1, 5]`.

The returned list must be sorted by `start` in increasing order, and every input point must be covered by exactly one returned range.

## Constraints

- `1 <= intervals.length <= 6000`
- `intervals[i].length == 2`
- `0 <= start <= end <= 10^5`

## Notes

- A range may be a single point, for example `[3, 3]`.
- Ranges that are separated by a gap, such as `[1, 2]` and `[3, 4]`, stay separate.
