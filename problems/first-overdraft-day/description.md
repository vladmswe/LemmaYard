A small café keeps a single cash account. In the morning of day 1 the account
holds `start`. On day `i + 1` the amount `changes[i]` is added to the balance:
a positive value is a deposit, a negative value is a payment, and zero means
nothing happened that day.

Return the number of the first day (counting from 1) on which the balance
ends up **below zero**. If the balance never drops below zero, return `0`.

## Constraints

- `0 <= start <= 10^9`
- `0 <= changes.length <= 10^5`
- `-10^9 <= changes[i] <= 10^9`

## Notes

A balance of exactly zero is not an overdraft.
