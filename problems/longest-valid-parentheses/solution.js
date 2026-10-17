/**
 * @param {string} s
 * @return {number}
 */
var longestValidParentheses = function (s) {
  // Two linear scans with open/close counters, one in each direction.
  let best = 0;
  let open = 0;
  let close = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") open++;
    else close++;
    if (open === close) best = Math.max(best, 2 * close);
    else if (close > open) open = close = 0;
  }
  open = close = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === "(") open++;
    else close++;
    if (open === close) best = Math.max(best, 2 * open);
    else if (open > close) open = close = 0;
  }
  return best;
};
