/**
 * @param {string} s
 * @return {string}
 */
var reverseString = function (s) {
  const out = [];
  for (let i = s.length - 1; i >= 0; i--) out.push(s[i]);
  return out.join("");
};
