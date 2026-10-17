/**
 * @param {string[]} words
 * @param {boolean} upper
 * @return {string}
 */
var joinWords = function(words, upper) {
  const joined = words.join(" ");
  return upper ? joined.toUpperCase() : joined;
};
