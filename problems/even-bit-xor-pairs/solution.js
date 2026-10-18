/**
 * @param {number[]} nums
 * @return {number}
 */
var countEvenXorPairs = function (nums) {
  const counts = [0, 0];
  for (const x of nums) {
    let v = x;
    let parity = 0;
    while (v > 0) {
      parity ^= v & 1;
      v >>>= 1;
    }
    counts[parity]++;
  }
  return (counts[0] * (counts[0] - 1)) / 2 + (counts[1] * (counts[1] - 1)) / 2;
};
