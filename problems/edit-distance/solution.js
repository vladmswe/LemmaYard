/**
 * @param {string} word1
 * @param {string} word2
 * @return {number}
 */
var minDistance = function (word1, word2) {
  const n = word1.length;
  const m = word2.length;
  // d[i][j] = cost to turn the first i chars of word1 into the first j chars of word2
  const d = [];
  for (let i = 0; i <= n; i++) {
    d.push(new Int32Array(m + 1));
    d[i][0] = i;
  }
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[i - 1][j - 1] + (word1[i - 1] === word2[j - 1] ? 0 : 1);
      const del = d[i - 1][j] + 1;
      const ins = d[i][j - 1] + 1;
      d[i][j] = Math.min(sub, del, ins);
    }
  }
  return d[n][m];
};
