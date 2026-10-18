An orchard has one row of trees. Picking tree `i` gives `yields[i]` units of
profit; a value can be negative when a tree costs more to pick than its fruit
is worth. A picking machine needs room to turn, so after it picks tree `i` it
cannot pick any of the next `gap` trees: any two picked trees `i` and `j` must
satisfy `|i - j| > gap`.

Choose which trees to pick to make the total profit as large as possible and
return that total. Picking no trees at all is allowed and gives `0`.

## Constraints

- `0 <= yields.length <= 10^5`
- `-10^4 <= yields[i] <= 10^4`
- `0 <= gap <= yields.length`

## Notes

With `gap = 0` any set of trees may be picked.
