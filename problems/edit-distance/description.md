You want to turn the string `word1` into the string `word2` using a sequence of single-character edits. Each of the following counts as one edit:

- **Insert** one character at any position.
- **Delete** one character.
- **Replace** one character with a different one.

Return the smallest number of edits that transforms `word1` into exactly `word2`. If the two strings are already equal, the answer is `0`.

## Constraints

- `0 <= word1.length, word2.length <= 500`
- Both strings consist only of lowercase English letters.

## Notes

- Either string may be empty: turning a string into the empty string takes one deletion per character, and the reverse takes one insertion per character.
- Exploring all edit sequences is exponential; a solution of about `word1.length * word2.length` steps is expected.
