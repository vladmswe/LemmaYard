Build the classic counting game as a list of strings. For every whole number `i` from `1` up to and including `n`, produce one entry:

- `"FizzBuzz"` when `i` is a multiple of both 3 and 5,
- `"Fizz"` when `i` is a multiple of 3 only,
- `"Buzz"` when `i` is a multiple of 5 only,
- otherwise the decimal digits of `i` as a string (for example `"7"`).

Return the entries in order, so the result always has exactly `n` elements and the entry at index `k` describes the number `k + 1`.

## Constraints

- `1 <= n <= 5000`

## Notes

- The words are case-sensitive: use exactly `Fizz`, `Buzz` and `FizzBuzz`.
