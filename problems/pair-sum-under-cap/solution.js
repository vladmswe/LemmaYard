/**
 * @param {number[]} prices
 * @param {number} cap
 * @return {number}
 */
var bestPairSum = function (prices, cap) {
  // Sort, then for each item binary-search the most expensive earlier partner.
  const sorted = prices.slice().sort((a, b) => a - b);
  let best = -1;
  for (let j = 1; j < sorted.length; j++) {
    const room = cap - sorted[j];
    // Largest index i < j with sorted[i] <= room.
    let lo = 0;
    let hi = j - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= room) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found >= 0 && sorted[found] + sorted[j] > best) best = sorted[found] + sorted[j];
  }
  return best;
};
