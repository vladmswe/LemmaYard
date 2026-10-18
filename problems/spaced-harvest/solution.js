/**
 * @param {number[]} yields
 * @param {number} gap
 * @return {number}
 */
var spacedHarvest = function (yields, gap) {
  const n = yields.length;
  // pick[i] = best total of a valid choice whose last picked tree is i.
  // run[i] = max(0, pick[0..i]).
  const run = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const j = i - gap - 1;
    const pick = yields[i] + (j >= 0 ? run[j] : 0);
    run[i] = Math.max(i > 0 ? run[i - 1] : 0, pick);
  }
  return n > 0 ? run[n - 1] : 0;
};
