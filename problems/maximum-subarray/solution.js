/**
 * @param {number[]} nums
 * @return {number}
 */
var maxSubArray = function (nums) {
  // Prefix-sum view: best = max over j of (prefix[j] - smallest earlier prefix).
  let prefix = 0;
  let minPrefix = 0;
  let best = -Infinity;
  for (const v of nums) {
    prefix += v;
    if (prefix - minPrefix > best) best = prefix - minPrefix;
    if (prefix < minPrefix) minPrefix = prefix;
  }
  return best;
};
