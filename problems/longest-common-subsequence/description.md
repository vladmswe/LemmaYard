Given two strings `text1` and `text2`, find the length of the longest string that is a subsequence of both of them. If they share no characters at all, the answer is `0`.

A subsequence of a string is what remains after deleting any number of its characters (possibly none) without changing the order of the characters that are kept. For instance, `"ape"` is a subsequence of `"apple"`, while `"pea"` is not, because the order differs. Unlike a substring, the kept characters do not need to be adjacent.

## Constraints

- `1 <= text1.length, text2.length <= 1000`
- Both strings consist only of lowercase English letters.

## Notes

- Only the length is required, not the subsequence itself.
- Trying every subsequence of one string is exponential; look for a solution that runs in about `text1.length * text2.length` steps.
