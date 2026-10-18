/**
 * @param {string[]} searches
 * @param {string[]} prefixes
 * @return {string[]}
 */
var favorites = function (searches, prefixes) {
  const counts = new Map();
  for (const q of searches) counts.set(q, (counts.get(q) || 0) + 1);
  const makeNode = () => ({ next: new Map(), count: 0, word: "" });
  const root = makeNode();
  for (const [word, c] of counts) {
    let node = root;
    for (let depth = 0; ; depth++) {
      if (c > node.count || (c === node.count && word < node.word)) {
        node.count = c;
        node.word = word;
      }
      if (depth === word.length) break;
      const ch = word[depth];
      let nxt = node.next.get(ch);
      if (!nxt) {
        nxt = makeNode();
        node.next.set(ch, nxt);
      }
      node = nxt;
    }
  }
  return prefixes.map((p) => {
    let node = root;
    for (const ch of p) {
      node = node.next.get(ch);
      if (!node) return "";
    }
    return node.word;
  });
};
