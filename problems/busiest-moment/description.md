A game server keeps a log of player sessions. Each entry of `sessions` is a
pair `[login, logout]`: the player is online from time `login` up to, but not
including, time `logout`. A player who logs out at time `t` is no longer
online at `t`, so they do not overlap with someone who logs in at `t`.

Find the largest number of players that are online at the same moment, and
the earliest moment at which that many players are online. Return them as
`[peak, time]`.

## Constraints

- `1 <= sessions.length <= 10^5`
- `sessions[i].length == 2`
- `0 <= login < logout <= 10^9`

## Notes

Only integer moments matter: the number of online players changes only at
login and logout times.
