/**
 * @param {number} x
 * @return {boolean}
 */
var isPalindrome = function (x) {
  if (x < 0) return false;
  if (x !== 0 && x % 10 === 0) return false;
  // Reverse only the lower half of the digits so the value never grows past x.
  let rest = x;
  let half = 0;
  while (rest > half) {
    half = half * 10 + (rest % 10);
    rest = Math.floor(rest / 10);
  }
  return rest === half || rest === Math.floor(half / 10);
};
