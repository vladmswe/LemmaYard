A string `s` is made only of the bracket characters `(`, `)`, `[`, `]`, `{` and
`}`. Decide whether the brackets in it are balanced, and return `true` if they
are, `false` otherwise.

The brackets are balanced when:

- every opening bracket is eventually closed by a bracket of the same kind;
- brackets close in reverse order of opening, so an inner pair must be closed
  before the pair around it;
- no closing bracket appears without a matching opening bracket before it.

The empty string counts as balanced.

## Constraints

- `0 <= s.length <= 10^4`
- `s` contains only the characters `()[]{}`.
