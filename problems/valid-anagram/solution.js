/**
 * @param {string} s
 * @param {string} t
 * @return {boolean}
 */
var isAnagram = function (s, t) {
  if (s.length !== t.length) return false;
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  for (const ch of t) {
    const left = freq.get(ch);
    if (!left) return false;
    freq.set(ch, left - 1);
  }
  return true;
};
