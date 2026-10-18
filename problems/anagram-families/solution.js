/**
 * @param {string[]} words
 * @return {number[]}
 */
var anagramFamilies = function (words) {
  // Key: the 26 letter counts of the word.
  const sizes = new Map();
  for (const w of words) {
    const counts = new Array(26).fill(0);
    for (let i = 0; i < w.length; i++) counts[w.charCodeAt(i) - 97]++;
    const key = counts.join(",");
    sizes.set(key, (sizes.get(key) || 0) + 1);
  }
  let shared = 0;
  let largest = 0;
  for (const size of sizes.values()) {
    if (size >= 2) shared++;
    if (size > largest) largest = size;
  }
  return [shared, largest];
};
