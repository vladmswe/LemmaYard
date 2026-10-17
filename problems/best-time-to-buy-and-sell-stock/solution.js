/**
 * @param {number[]} prices
 * @return {number}
 */
var maxProfit = function (prices) {
  // Walk from the last day backwards, remembering the best later selling price.
  let maxAhead = 0;
  let profit = 0;
  for (let i = prices.length - 1; i >= 0; i--) {
    maxAhead = Math.max(maxAhead, prices[i]);
    profit = Math.max(profit, maxAhead - prices[i]);
  }
  return profit;
};
