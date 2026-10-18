A word-game club sorts its members' submissions in `words` into
**families**: two words belong to the same family when one can be turned into
the other by rearranging its letters (so they use exactly the same letters the
same number of times). Every entry of `words` is a member of exactly one
family, and repeated entries are separate members of the same family.

Return an array of two numbers:

1. how many families have **at least two** members, and
2. the number of members in the largest family.

For an empty list return `[0, 0]`.

## Constraints

- `0 <= words.length <= 10^4`
- `1 <= words[i].length <= 20`
- `words[i]` contains only lowercase English letters.
