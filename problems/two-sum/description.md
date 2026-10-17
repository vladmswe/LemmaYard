You get an integer array `nums` and an integer `target`. Exactly two different
positions in the array hold values that add up to `target`. Find those two
positions and return their indices.

The two indices must be distinct (you cannot pair an element with itself),
but the two values may be equal. The indices can be returned in either order.

## Constraints

- `2 <= nums.length <= 10^4`
- `-10^9 <= nums[i] <= 10^9`
- `-2 * 10^9 <= target <= 2 * 10^9`
- Every input has exactly one pair of indices whose values sum to `target`.

## Notes

Checking every pair works, but takes quadratic time. Try to find the pair in a
single pass over the array.
