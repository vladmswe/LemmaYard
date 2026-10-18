/**
 * @param {number[]} heights
 * @return {number[]}
 */
var bannerWidths = function (heights) {
  const n = heights.length;
  // Two passes, each with a stack of indices of strictly increasing heights.
  const reachLeft = new Array(n);
  const reachRight = new Array(n);
  let stack = [];
  for (let i = 0; i < n; i++) {
    while (stack.length > 0 && heights[stack[stack.length - 1]] >= heights[i]) stack.pop();
    reachLeft[i] = stack.length > 0 ? stack[stack.length - 1] + 1 : 0;
    stack.push(i);
  }
  stack = [];
  for (let i = n - 1; i >= 0; i--) {
    while (stack.length > 0 && heights[stack[stack.length - 1]] >= heights[i]) stack.pop();
    reachRight[i] = stack.length > 0 ? stack[stack.length - 1] - 1 : n - 1;
    stack.push(i);
  }
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = reachRight[i] - reachLeft[i] + 1;
  return out;
};
