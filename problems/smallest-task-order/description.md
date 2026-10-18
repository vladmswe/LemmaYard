A film crew has `n` setup jobs numbered `0` to `n - 1`. Some jobs depend on
others: a rule `[a, b]` in `rules` says that job `a` has to be finished
before job `b` is started. Jobs are done one at a time, and every job is done
exactly once.

Many schedules can respect all the rules. The crew lead prefers the one that
is **smallest in dictionary order** when the schedules are compared job number
by job number: the first job should be as small as possible, then the second,
and so on.

Return that schedule as an array of the `n` job numbers. If the rules
contradict each other (no schedule can respect all of them), return an empty
array.

## Constraints

- `1 <= n <= 10^4`
- `0 <= rules.length <= 2 * 10^4`
- `rules[i].length == 2`, `0 <= rules[i][0], rules[i][1] < n`,
  `rules[i][0] != rules[i][1]`
- The same rule may appear more than once.

## Notes

Always starting the smallest job that is already allowed gives the answer;
keep the allowed jobs in a structure that hands out the smallest one quickly.
