/**
 * @param {string} s
 * @return {boolean}
 */
var isValid = function (s) {
  const pending = [];
  const closerFor = { "(": ")", "[": "]", "{": "}" };
  for (const ch of s) {
    if (ch in closerFor) {
      pending.push(closerFor[ch]);
    } else if (pending.length === 0 || pending.pop() !== ch) {
      return false;
    }
  }
  return pending.length === 0;
};
