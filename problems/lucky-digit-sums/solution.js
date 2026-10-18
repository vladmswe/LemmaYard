/**
 * @param {number} lo
 * @param {number} hi
 * @param {number} k
 * @return {number}
 */
var countLucky = function (lo, hi, k) {
  const digitSum = (x) => {
    let s = 0;
    while (x > 0) {
      s += x % 10;
      x = Math.floor(x / 10);
    }
    return s;
  };
  let count = 0;
  for (let x = lo; x <= hi; x++) {
    if (digitSum(x) % k === 0) count++;
  }
  return count;
};
