You are given a non-empty integer array `nums`. Pick a contiguous block of it that contains at least one element and add up its values. Return the largest total any such block can have.

When every value is negative, the best block is the single largest element, since the block may not be empty.

## Constraints

- `1 <= nums.length <= 10^4`
- `-10^4 <= nums[i] <= 10^4`

## Notes

- Checking every possible block works for small inputs; a single pass over the array is enough to handle the largest ones comfortably.
