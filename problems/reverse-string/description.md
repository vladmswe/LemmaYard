Return the string `s` written backwards: the last character first, the first
character last. Every character is kept, spaces and punctuation included; only
the order changes.

## Constraints

- `0 <= s.length <= 10^4`
- `s` consists of printable ASCII characters (codes 32 to 126), including the
  space.

## Notes

Try doing it with two indices that start at both ends and move toward the
middle, swapping characters as they go.
