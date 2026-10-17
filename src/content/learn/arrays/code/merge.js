// a and b are sorted; returns one sorted array with all their values.
function merge(a, b) {
  const c = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) { // @line merge.compare
      c.push(a[i]); // @line merge.takeA
      i += 1;
    } else {
      c.push(b[j]); // @line merge.takeB
      j += 1;
    }
  }
  // one array ran out: the rest of the other is already sorted
  c.push(...a.slice(i)); // @line merge.restA
  c.push(...b.slice(j)); // @line merge.restB
  return c;
}
