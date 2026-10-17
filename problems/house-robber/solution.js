/**
 * @param {number[]} nums
 * @return {number}
 */
var rob = function (nums) {
  const n = nums.length;
  // best[i] = maximum loot using only houses i..n-1
  const best = new Array(n + 2).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    best[i] = Math.max(best[i + 1], nums[i] + best[i + 2]);
  }
  return best[0];
};
