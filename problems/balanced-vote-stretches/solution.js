/**
 * @param {string} votes
 * @return {number}
 */
var countBalanced = function (votes) {
  const n = votes.length;
  // Balances lie in [-n, n]; shift by n to index an array.
  const seen = new Array(2 * n + 1).fill(0);
  let balance = n;
  seen[balance] = 1;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = votes[i];
    if (v === "Y") balance++;
    else if (v === "N") balance--;
    total += seen[balance];
    seen[balance]++;
  }
  return total;
};
