/**
 * @param {number[][]} intervals
 * @return {number[][]}
 */
var merge = function (intervals) {
  const order = intervals.map((iv) => [iv[0], iv[1]]);
  order.sort((a, b) => a[0] - b[0]);
  const out = [];
  let curStart = order[0][0];
  let curEnd = order[0][1];
  for (let i = 1; i < order.length; i++) {
    const [s, e] = order[i];
    if (s > curEnd) {
      out.push([curStart, curEnd]);
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  out.push([curStart, curEnd]);
  return out;
};
