The array `nums` holds distinct integers sorted from smallest to largest. Find
the position of `target` in it: return the index `i` with `nums[i] == target`,
or `-1` if `target` is not in the array.

Aim for `O(log n)` time: halve the part of the array that can still contain
the answer on every step, instead of scanning it element by element.

## Constraints

- `1 <= nums.length <= 10^4`
- `-10^4 <= nums[i], target <= 10^4`
- All values in `nums` are distinct.
- `nums` is sorted in strictly increasing order.
