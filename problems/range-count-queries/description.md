A weather station archived one temperature reading per hour in `values`, in
no particular order. Analysts then send a batch of questions in `queries`;
query `[lo, hi]` asks how many archived readings `v` satisfy
`lo <= v <= hi`.

Return an array with one answer per query, in the order the queries were
given. A query with `lo > hi` describes an empty range, so its answer is `0`.

## Constraints

- `0 <= values.length <= 10^5`
- `0 <= queries.length <= 10^5`
- `queries[j].length == 2`
- `-10^9 <= values[i], queries[j][0], queries[j][1] <= 10^9`

## Notes

Answering each query by scanning the whole archive is too slow for the
largest inputs.
