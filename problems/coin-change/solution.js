/**
 * @param {number[]} coins
 * @param {number} amount
 * @return {number}
 */
var coinChange = function (coins, amount) {
  if (amount === 0) return 0;
  // Breadth-first search over reachable totals: the first level that hits
  // `amount` gives the minimum number of coins.
  const seen = new Uint8Array(amount + 1);
  seen[0] = 1;
  let frontier = [0];
  let steps = 0;
  while (frontier.length > 0) {
    steps++;
    const next = [];
    for (const total of frontier) {
      for (const c of coins) {
        const t = total + c;
        if (t === amount) return steps;
        if (t < amount && !seen[t]) {
          seen[t] = 1;
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return -1;
};
