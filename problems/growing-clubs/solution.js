/**
 * @param {number} n
 * @param {number[][]} friendships
 * @return {number[]}
 */
var largestClubAfterEach = function (n, friendships) {
  // Union by rank with full path compression (iterative two-pass find).
  const parent = new Int32Array(n);
  const rank = new Uint8Array(n);
  const count = new Int32Array(n).fill(1);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  let largest = 1;
  const out = [];
  for (const [a, b] of friendships) {
    let ra = find(a);
    let rb = find(b);
    if (ra !== rb) {
      if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
      parent[rb] = ra;
      if (rank[ra] === rank[rb]) rank[ra]++;
      count[ra] += count[rb];
      if (count[ra] > largest) largest = count[ra];
    }
    out.push(largest);
  }
  return out;
};
