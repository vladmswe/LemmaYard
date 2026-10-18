An orienteering course is laid out on a city grid. `points[i] = [x, y]` is
the position of checkpoint `i`. The runner starts at checkpoint `0` and must
stamp every other checkpoint at least once, in any order; the run ends at
whichever checkpoint is stamped last (there is no need to return to the
start).

The streets form a grid, so walking from `[x1, y1]` to `[x2, y2]` takes
`|x1 - x2| + |y1 - y2|` metres. Passing over a checkpoint without stopping
does not stamp it, but that never matters: walking via a checkpoint is never
shorter than walking straight past it.

Return the length of the shortest possible run.

## Constraints

- `1 <= points.length <= 12`
- `points[i].length == 2`
- `-10^6 <= x, y <= 10^6`
- Two checkpoints may share a position.

## Notes

Trying every order of the checkpoints takes `11!` steps for the largest
input. What matters about a partial run is only which checkpoints are
stamped and where the runner stands, so store the best length for each such
pair, with the set of stamped checkpoints as a bit mask.
