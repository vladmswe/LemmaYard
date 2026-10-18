In a word game you turn the word `start` into the word `goal` one step at a
time. A step replaces exactly one letter of the current word by a different
letter, and the word you get must appear in the dictionary `words`. The
`start` word itself does not have to be in the dictionary; every word after
it, including `goal`, does.

A **route** is the sequence of words visited from `start` to `goal`. Among all
routes with the fewest steps, count how many different routes there are. Two
routes are different if they differ in at least one position.

Return that count modulo `1000000007`. If `start` equals `goal` the answer is
`1` (the route with no steps). If `goal` cannot be reached, return `0`.

## Constraints

- `1 <= start.length <= 8`
- `goal.length == start.length` and every `words[i].length == start.length`
- `0 <= words.length <= 5000`
- All strings contain only lowercase English letters.
- `words` may contain the same word more than once; repeats do not create
  new routes.

## Notes

The number of shortest routes can grow exponentially, so listing them is
hopeless. Explore the words level by level from `start` and, for every word,
add up the number of shortest routes that reach it.
