A new school year starts with `n` students, numbered `0` to `n - 1`, who do
not know each other yet. Friendships form one at a time: `friendships[i] =
[a, b]` means students `a` and `b` become friends.

A **club** is a group of students connected through chains of friendships:
two students are in the same club when one can be reached from the other by
going from friend to friend. A student with no friends is a club of one.

After each friendship forms, record the number of students in the largest
club. Return the recorded sizes, one per friendship, in order.

## Constraints

- `1 <= n <= 10^5`
- `0 <= friendships.length <= 10^5`
- `friendships[i].length == 2`
- `0 <= a, b < n`

## Notes

The same friendship may be listed more than once, two students may become
friends after they are already in the same club, and `a` may equal `b`.
