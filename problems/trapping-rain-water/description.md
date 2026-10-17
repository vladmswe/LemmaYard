Picture a row of vertical columns standing side by side, each one unit wide. The array `height` lists their heights from left to right. After a heavy rain, water settles in the dips between columns; anything that would flow past the leftmost or rightmost column is lost.

Return the total number of unit squares of water that stay on top of the columns.

Above a given column, water can rise only up to the lower of the two tallest columns on its left and on its right (including the column itself), so the water held above column `i` equals that level minus `height[i]`.

## Constraints

- `0 <= height.length <= 2 * 10^4`
- `0 <= height[i] <= 10^5`

## Notes

- An empty array, a single column, or any arrangement without a dip holds no water at all.
- The answer for the largest inputs can be close to `2 * 10^9`, which still fits in a regular integer.
- A linear-time solution is expected; recomputing the tallest column on each side for every index is too slow.
