A town council records its votes in the order they were cast as the string
`votes`: `'Y'` is a vote in favour, `'N'` a vote against and `'A'` an
abstention.

A **stretch** is a non-empty run of consecutive votes, `votes[i..j]`. A
stretch is **balanced** when it contains as many `'Y'` votes as `'N'` votes.
Abstentions do not affect the balance, so a stretch made only of `'A'` is
balanced too.

Return the number of balanced stretches. Stretches at different positions are
counted separately even when they read the same.

## Constraints

- `0 <= votes.length <= 10^5`
- `votes` contains only `'Y'`, `'N'` and `'A'`

## Notes

The answer can be larger than `2^31`, but it always fits in a 64-bit integer.
