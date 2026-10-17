/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
var twoSum = function (nums, target) {
  const order = nums.map((_, i) => i).sort((a, b) => nums[a] - nums[b]);
  let lo = 0;
  let hi = order.length - 1;
  while (lo < hi) {
    const sum = nums[order[lo]] + nums[order[hi]];
    if (sum === target) return [order[lo], order[hi]];
    if (sum < target) lo++;
    else hi--;
  }
  return [];
};
