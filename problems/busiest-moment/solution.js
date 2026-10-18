/**
 * @param {number[][]} sessions
 * @return {number[]}
 */
var busiestMoment = function (sessions) {
  const starts = sessions.map((s) => s[0]).sort((a, b) => a - b);
  const ends = sessions.map((s) => s[1]).sort((a, b) => a - b);
  let i = 0;
  let j = 0;
  let online = 0;
  let best = 0;
  let when = 0;
  while (i < starts.length) {
    const t = Math.min(starts[i], ends[j]);
    while (j < ends.length && ends[j] === t) {
      online--;
      j++;
    }
    while (i < starts.length && starts[i] === t) {
      online++;
      i++;
    }
    if (online > best) {
      best = online;
      when = t;
    }
  }
  return [best, when];
};
