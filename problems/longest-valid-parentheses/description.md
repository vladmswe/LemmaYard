You are given a string `s` made up only of the characters `'('` and `')'`. Find the longest contiguous substring of `s` that forms a correctly matched bracket sequence, and return its length.

A bracket sequence is correctly matched when every `'('` is closed by a later `')'`, every `')'` closes an earlier unmatched `'('`, and nothing is left open at the end. For instance, `"(())()"` is correctly matched, while `"())"` and `")("` are not.

If no such non-empty substring exists (including when `s` is empty), return `0`.

## Constraints

- `0 <= s.length <= 5 * 10^4`
- Every character of `s` is either `'('` or `')'`.

## Notes

- The answer is always even.
- Checking every substring separately is far too slow for the largest inputs; a linear-time approach exists.
