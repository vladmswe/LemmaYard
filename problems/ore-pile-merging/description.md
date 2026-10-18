At a mine, freshly dug ore lies in a single row of piles along a conveyor;
`piles[i]` is the weight of the `i`-th pile from the left. A loader can only
push two piles that are **next to each other** in the row into one pile, which
takes their place in the row. Moving ore costs fuel: merging two piles costs
as much as the weight of the new pile (the sum of the two).

The loader keeps merging until one pile is left. Return the smallest total
cost of doing so. A row with zero or one pile needs no merges and costs `0`.

## Constraints

- `0 <= piles.length <= 120`
- `1 <= piles[i] <= 10^4`

## Notes

Always merging the lightest neighbouring pair is not optimal. Think about the
last merge: it joins a pile made from some left part of the row with a pile
made from the rest, and its cost is the total weight of the whole row.
