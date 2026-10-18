/**
 * @param {number} start
 * @param {number[]} changes
 * @return {number}
 */
var firstOverdraft = function (start, changes) {
  let balance = start;
  for (let i = 0; i < changes.length; i++) {
    balance += changes[i];
    if (balance < 0) return i + 1;
  }
  return 0;
};
