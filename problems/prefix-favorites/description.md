A library catalogue keeps a log of everything visitors typed into its search
box: `searches` holds one lowercase query per entry, and the same query can
appear many times. The catalogue wants to suggest a single completion while a
visitor is still typing.

For every string in `prefixes`, find the query from the log that starts with
that prefix and was searched the most times. If several queries share the
highest count, pick the alphabetically smallest of them. If no query starts
with the prefix, the suggestion is the empty string `""`.

Return the suggestions in the same order as `prefixes`. The empty prefix
`""` matches every query, and a query counts as starting with itself.

## Constraints

- `0 <= searches.length <= 2 * 10^4`
- `1 <= prefixes.length <= 2 * 10^4`
- `1 <= searches[i].length <= 20`, `0 <= prefixes[j].length <= 20`
- All strings contain only lowercase English letters.

## Notes

Scanning the whole log for every prefix is too slow for the largest inputs.
Preparing the answer for every possible prefix once lets each lookup take
time proportional to the prefix length.
