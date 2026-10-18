A warehouse labels every crate with a non-negative integer code, listed in
`nums`. Two crates are a **compatible pair** when the bitwise XOR of their
codes, written in binary, contains an even number of `1` bits. Zero `1` bits
counts as even, so two crates with the same code are always compatible.

Return the number of index pairs `(i, j)` with `i < j` such that `nums[i]` and
`nums[j]` are a compatible pair.

## Constraints

- `0 <= nums.length <= 10^5`
- `0 <= nums[i] <= 10^9`

## Notes

Comparing every pair takes quadratic time, which is too slow for the largest
inputs. Look for a property of a single code that decides compatibility.
