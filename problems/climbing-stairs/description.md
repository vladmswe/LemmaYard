You stand at the bottom of a staircase with `n` steps. Each move takes you either one step up or two steps up. Count how many different move sequences bring you exactly to the top step.

Two sequences are different when they differ at any position, so going `1` then `2` is not the same as going `2` then `1`.

## Constraints

- `1 <= n <= 70`

## Notes

- The answer grows quickly but always fits in a 64-bit float without losing precision for the allowed `n`.
- Trying every sequence explicitly is far too slow for the larger inputs; look for a way to reuse answers for shorter staircases.
