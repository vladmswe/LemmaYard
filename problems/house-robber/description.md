A row of houses lines a street, and `nums[i]` is the amount of cash stored in house `i`. A burglar wants to collect as much as possible, but neighboring houses share an alarm: taking from two houses that stand right next to each other in the row sets it off.

Choose any set of houses with no two adjacent ones and return the largest total amount that can be collected this way. Choosing no houses at all is allowed and yields `0`.

## Constraints

- `1 <= nums.length <= 10^4`
- `0 <= nums[i] <= 1000`

## Notes

- Simply taking every other house is not always optimal: sometimes it pays to skip two houses in a row.
