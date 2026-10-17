Decide whether the integer `x` looks the same when its decimal digits are written in reverse order. Return `true` if it does and `false` otherwise.

A negative number never counts: its leading minus sign has no matching sign at the other end. A number that ends in `0` (other than `0` itself) cannot qualify either, because a written integer never starts with a zero.

## Constraints

- `-(2^53 - 1) <= x <= 2^53 - 1`

## Notes

- Converting the number to a string is allowed. As an extra challenge, try solving it using arithmetic on the digits only.
