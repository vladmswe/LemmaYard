/**
 * @param {string} start
 * @param {string} goal
 * @param {string[]} words
 * @return {number}
 */
var countShortestLadders = function (start, goal, words) {
  const MOD = 1000000007;
  if (start === goal) return 1;
  const dictionary = new Set(words);
  if (!dictionary.has(goal)) return 0;
  const seen = new Set([start]);
  let ways = new Map([[start, 1]]);
  while (ways.size > 0) {
    const next = new Map();
    for (const [word, count] of ways) {
      for (let i = 0; i < word.length; i++) {
        const head = word.slice(0, i);
        const tail = word.slice(i + 1);
        for (let code = 97; code <= 122; code++) {
          const ch = String.fromCharCode(code);
          if (ch === word[i]) continue;
          const cand = head + ch + tail;
          if (dictionary.has(cand) && !seen.has(cand)) {
            next.set(cand, ((next.get(cand) || 0) + count) % MOD);
          }
        }
      }
    }
    if (next.has(goal)) return next.get(goal);
    for (const w of next.keys()) seen.add(w);
    ways = next;
  }
  return 0;
};
