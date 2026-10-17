/**
 * @param {number} n
 * @return {number}
 */
var climbStairs = function (n) {
  let prev = 1; // ways to reach step i - 1
  let cur = 1; // ways to reach step i
  for (let i = 2; i <= n; i++) {
    const next = prev + cur;
    prev = cur;
    cur = next;
  }
  return cur;
};
