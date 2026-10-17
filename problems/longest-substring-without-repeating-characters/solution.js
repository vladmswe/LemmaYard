/**
 * @param {string} s
 * @return {number}
 */
var lengthOfLongestSubstring = function (s) {
  const inWindow = new Set();
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    while (inWindow.has(ch)) {
      inWindow.delete(s[left]);
      left++;
    }
    inWindow.add(ch);
    best = Math.max(best, right - left + 1);
  }
  return best;
};
