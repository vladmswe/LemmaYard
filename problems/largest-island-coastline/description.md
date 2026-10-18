A survey map is given as `grid`, a list of equally long strings. Character
`'#'` is a square of land and `'.'` is a square of water. Land squares that
share a side (up, down, left or right, not diagonally) belong to the same
island. The **area** of an island is its number of land squares.

The **coastline** of an island is the number of unit-length square sides that
separate one of its land squares from water or from the edge of the map.
Lakes enclosed by an island count too: their shores are coastline.

Find the island with the largest area and return its coastline. If several
islands share the largest area, return the longest coastline among them. If
the map has no land, return `0`.

## Constraints

- `1 <= grid.length <= 150`
- `1 <= grid[i].length <= 150`, and all rows have the same length
- `grid[i][j]` is `'#'` or `'.'`
