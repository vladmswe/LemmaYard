/**
 * @param {number[]} values
 * @param {number[][]} queries
 * @return {number[]}
 */
var countInRanges = function (values, queries) {
  const sorted = values.slice().sort((a, b) => a - b);
  // Number of elements strictly less than x.
  const countBelow = (x) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return queries.map(([lo, hi]) => (lo > hi ? 0 : countBelow(hi + 1) - countBelow(lo)));
};
