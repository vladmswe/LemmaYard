A puzzle magazine collects code words from its readers in the list `words`.
Two entries form a pair of **reversed twins** when one of them, read
backwards, is exactly the other one. For example `"stressed"` and
`"desserts"` are reversed twins, and so are `"deed"` and another `"deed"`.

Count the pairs of positions `i < j` such that `words[j]` equals `words[i]`
written backwards.

## Constraints

- `0 <= words.length <= 10^4`
- `1 <= words[i].length <= 20`
- `words[i]` contains only lowercase English letters.

## Notes

The same word may appear several times; every pair of positions counts
separately. A palindrome forms a pair with each other copy of itself, but
never with its own position.
