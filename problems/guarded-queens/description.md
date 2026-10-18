A puzzle magazine prints a square board with `n` rows. `board[r]` is row `r`
as a string of `n` characters: `'.'` is a free square and `'x'` is a square
covered by a sticker, where nothing may be placed.

Place exactly `n` queens on free squares so that no two queens attack each
other: no two share a row, a column or a diagonal (in either direction).
Stickers do **not** block attacks: two queens on the same diagonal attack
each other even if a sticker lies between them.

Return how many different placements exist. Two placements are different if
some square holds a queen in one and not in the other.

## Constraints

- `1 <= n <= 10`
- `board.length == n` and `board[r].length == n`
- `board[r][c]` is `'.'` or `'x'`

## Notes

Every row holds exactly one queen, so it is enough to choose a column row by
row and undo the choice when it leads nowhere. Keeping the attacked columns
and diagonals as bit masks makes each step cheap.
