/**
 * @param {number[]} load
 * @param {number} k
 * @param {number} limit
 * @return {number}
 */
var longestAlarmStreak = function (load, k, limit) {
  const n = load.length;
  if (k > n) return 0;
  // prefix[i] = load[0] + ... + load[i - 1]
  const prefix = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + load[i];
  let best = 0;
  let streak = 0;
  for (let s = 0; s + k <= n; s++) {
    if (prefix[s + k] - prefix[s] > limit) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
  }
  return best;
};
