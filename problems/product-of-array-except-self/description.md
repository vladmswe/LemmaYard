You are given an integer array `nums` of length `n`. Build and return a new array `answer` of the same length, where `answer[i]` is the product of all elements of `nums` except the one at position `i`.

For example, the value at position `0` is the product of `nums[1]`, `nums[2]`, ..., `nums[n - 1]`. Zeros are allowed in the input and must be handled like any other value.

## Constraints

- `2 <= nums.length <= 10^4`
- `-10 <= nums[i] <= 10`
- The product of the absolute values of all non-zero elements of `nums` is at most `2^53 - 1`, so every value in `answer` fits in that range as well.

## Notes

- Aim for `O(n)` time. Multiplying the other `n - 1` values separately for every index is too slow for the largest inputs.
- Follow-up: can you do it without using division?
