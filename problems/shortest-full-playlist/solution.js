/**
 * @param {number[]} genres
 * @return {number}
 */
var shortestFullSegment = function (genres) {
  const n = genres.length;
  if (n === 0) return 0;
  // For each right end, the best left start is the smallest last-seen
  // position among all genres; track last positions and shrink lazily.
  const need = new Set(genres).size;
  const last = new Map();
  let best = n;
  let left = 0;
  for (let right = 0; right < n; right++) {
    last.set(genres[right], right);
    if (last.size < need) continue;
    while (last.get(genres[left]) !== left) left++;
    best = Math.min(best, right - left + 1);
  }
  return best;
};
