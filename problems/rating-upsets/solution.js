/**
 * @param {number[]} ratings
 * @param {number} gap
 * @return {number}
 */
var countUpsets = function (ratings, gap) {
  const values = [...new Set(ratings)].sort((a, b) => a - b);
  const size = values.length;
  const tree = new Array(size + 1).fill(0);
  // Index of the first value >= x.
  const lowerBound = (x) => {
    let lo = 0;
    let hi = size;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let total = 0;
  for (let i = ratings.length - 1; i >= 0; i--) {
    const x = ratings[i];
    for (let k = lowerBound(x - gap); k > 0; k -= k & -k) total += tree[k];
    for (let k = lowerBound(x) + 1; k <= size; k += k & -k) tree[k]++;
  }
  return total;
};
