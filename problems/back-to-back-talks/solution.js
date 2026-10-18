/**
 * @param {number[][]} talks
 * @return {number}
 */
var maxTalks = function (talks) {
  const ends = talks.map(([start, duration]) => [start, start + duration]);
  ends.sort((a, b) => a[1] - b[1]);
  let attended = 0;
  let freeAt = -Infinity;
  for (const [start, end] of ends) {
    if (start >= freeAt) {
      attended++;
      freeAt = end;
    }
  }
  return attended;
};
