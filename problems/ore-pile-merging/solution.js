/**
 * @param {number[]} piles
 * @return {number}
 */
var mergeCost = function (piles) {
  const n = piles.length;
  if (n <= 1) return 0;
  const prefix = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + piles[i];
  // best[i][j]: cheapest way to turn piles[i..j] into one pile.
  const best = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let length = 2; length <= n; length++) {
    for (let i = 0; i + length - 1 < n; i++) {
      const j = i + length - 1;
      let cheapest = Infinity;
      for (let k = i; k < j; k++) {
        const c = best[i][k] + best[k + 1][j];
        if (c < cheapest) cheapest = c;
      }
      best[i][j] = cheapest + prefix[j + 1] - prefix[i];
    }
  }
  return best[0][n - 1];
};
