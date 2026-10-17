/**
 * @param {string} text1
 * @param {string} text2
 * @return {number}
 */
var longestCommonSubsequence = function (text1, text2) {
  const n = text1.length;
  const m = text2.length;
  const width = m + 1;
  // dp[i * width + j] = LCS length of the suffixes text1[i:] and text2[j:]
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (text1.charCodeAt(i) === text2.charCodeAt(j)) {
        dp[i * width + j] = dp[(i + 1) * width + j + 1] + 1;
      } else {
        const down = dp[(i + 1) * width + j];
        const right = dp[i * width + j + 1];
        dp[i * width + j] = down > right ? down : right;
      }
    }
  }
  return dp[0];
};
