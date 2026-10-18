A one-day conference publishes its programme as `talks`, where
`talks[i] = [start, duration]`: talk `i` begins at minute `start` and lasts
`duration` minutes, so it occupies the half-open time span
`[start, start + duration)`. Talks may overlap because they run in different
halls.

A visitor wants to sit through as many talks as possible, each one from its
first to its last minute, and can be in only one hall at a time. Walking
between halls takes no time, so a talk may begin at exactly the minute the
previous one ends.

Return the largest number of talks the visitor can attend completely.

## Constraints

- `0 <= talks.length <= 10^5`
- `talks[i].length == 2`
- `0 <= start <= 10^9`
- `1 <= duration <= 10^9`
