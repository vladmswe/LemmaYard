/**
 * @param {number[]} nums
 * @return {number[]}
 */
var productExceptSelf = function (nums) {
  // Count zeros and multiply the non-zero values; every answer follows from that.
  let zeros = 0;
  let nonZeroProduct = 1;
  for (const x of nums) {
    if (x === 0) zeros++;
    else nonZeroProduct *= x;
  }
  return nums.map((x) => {
    if (zeros > 1) return 0;
    if (zeros === 1) return x === 0 ? nonZeroProduct : 0;
    return nonZeroProduct / x;
  });
};
