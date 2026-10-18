A puzzle board is given as `board`, a list of equally long strings. Each
character is one square:

- `'.'` an open square,
- `'#'` a wall,
- `'S'` the square where a knight stands (open),
- `'T'` the target square (open).

The knight moves like a chess knight: two squares in one direction along a
row or column and then one square sideways, so from row `r`, column `c` it can
reach `(r ± 1, c ± 2)` and `(r ± 2, c ± 1)`. It jumps, so walls on the way do
not stop it, but it can never land on a wall or leave the board.

Return the smallest number of moves that takes the knight from `'S'` to
`'T'`, or `-1` if it cannot get there.

## Constraints

- `1 <= board.length <= 150`
- `1 <= board[i].length <= 150`, and all rows have the same length
- `board` contains exactly one `'S'` and exactly one `'T'`; every other
  character is `'.'` or `'#'`
