A configuration linter reads a line of text and looks only at its brackets:
round `()`, square `[]` and curly `{}`. Every other character is ignored.

The brackets of the line are **well formed** when every opening bracket is
closed later by a closing bracket of the same kind, every closing bracket
closes the most recent bracket that is still open, and no bracket is left
open at the end. The **depth** of a position is the number of brackets that
are open there; the nesting depth of the line is the largest depth reached.

If the brackets of `text` are well formed, return the nesting depth of the
line (`0` when it has no brackets at all). Otherwise return `-1`.

## Constraints

- `0 <= text.length <= 10^5`
- `text` contains printable ASCII characters (codes 32 to 126).

## Notes

`"f(a[i], {b: 2})"` has nesting depth 2: inside `[i]` and inside `{b: 2}`
two brackets are open.
