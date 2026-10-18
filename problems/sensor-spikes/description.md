A vibration sensor writes one integer reading per second into `readings`. A
reading counts as a **spike** when it sticks out above both of its immediate
neighbours by more than `margin`: reading `i` is a spike when

- `readings[i] - readings[i - 1] > margin`, and
- `readings[i] - readings[i + 1] > margin`.

The first and the last reading have only one neighbour, so they are never
spikes. Return the number of spikes.

## Constraints

- `0 <= readings.length <= 10^5`
- `-10^9 <= readings[i] <= 10^9`
- `0 <= margin <= 10^9`

## Notes

With `margin = 0` a spike is simply a reading strictly larger than both
neighbours; a flat top such as `1, 5, 5, 1` has no spike.
