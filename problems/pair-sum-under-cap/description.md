A gift shop lists the prices of its items in `prices`. A customer wants to buy
exactly **two different items** (two different positions of the list; the two
prices may be equal) and has a gift card worth `cap`.

Return the largest total price of two different items that does not exceed
`cap`. If no two items fit within `cap` (including when the shop has fewer
than two items), return `-1`.

## Constraints

- `0 <= prices.length <= 10^5`
- `1 <= prices[i] <= 10^9`
- `1 <= cap <= 2 * 10^9`

## Notes

Trying every pair is quadratic; sorting the prices first allows a much faster
search.
