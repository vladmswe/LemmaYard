/**
 * @param {string[]} words
 * @return {number}
 */
var countTwinPairs = function (words) {
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  let total = 0;
  for (const [w, c] of counts) {
    const r = w.split("").reverse().join("");
    if (r === w) {
      total += (c * (c - 1)) / 2;
    } else if (w < r && counts.has(r)) {
      total += c * counts.get(r);
    }
  }
  return total;
};
