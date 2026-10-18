A street has a row of buildings, and `heights[i]` is the height of building
`i`. A festival wants to hang a straight horizontal banner at exactly the
height of building `i`, touching building `i`. The banner may stretch over a
block of adjacent buildings, but every building it passes must be at least as
tall as the banner, so it is held up all along its length.

For every building `i`, find how many buildings the longest possible banner
at height `heights[i]` through building `i` covers (building `i` itself
included). Return these counts as an array with one value per building.

## Constraints

- `0 <= heights.length <= 10^5`
- `0 <= heights[i] <= 10^9`

## Notes

Checking outward from every building takes quadratic time on a long row of
equal heights. Aim for a solution that is linear or close to it.
