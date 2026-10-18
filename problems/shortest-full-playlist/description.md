A radio station's archive is one long recording of songs played back to back.
`genres[i]` is the genre code of the `i`-th song. The station wants to cut a
sampler from the archive: a run of consecutive songs that features every
genre that appears anywhere in the archive at least once.

Return the number of songs in the shortest such run. For an empty archive,
return `0`.

## Constraints

- `0 <= genres.length <= 10^5`
- `1 <= genres[i] <= 10^9`
