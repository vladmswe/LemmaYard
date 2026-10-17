/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number}
 */
var search = function (nums, target) {
  // Half-open window [left, right): find the first index whose value is >= target.
  let left = 0;
  let right = nums.length;
  while (left < right) {
    const mid = left + ((right - left) >> 1);
    if (nums[mid] < target) left = mid + 1;
    else right = mid;
  }
  return left < nums.length && nums[left] === target ? left : -1;
};
