/**
 * @param {number[][]} matrix
 * @return {number}
 */
var average = function(matrix) {
  const values = matrix.flat();
  return values.reduce((a, b) => a + b, 0) / values.length;
};
