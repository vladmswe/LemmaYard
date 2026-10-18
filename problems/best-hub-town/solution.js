/**
 * @param {number[]} parent
 * @param {number[]} population
 * @param {number[]} roadLength
 * @return {number[]}
 */
var bestHub = function (parent, population, roadLength) {
  const n = parent.length;
  const children = Array.from({ length: n }, () => []);
  for (let v = 1; v < n; v++) children[parent[v]].push(v);
  // BFS order from town 0: every parent comes before its children.
  const order = [0];
  for (let i = 0; i < order.length; i++) for (const c of children[order[i]]) order.push(c);
  const depth = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const v = order[i];
    depth[v] = depth[parent[v]] + roadLength[v];
  }
  const below = population.slice();
  for (let i = n - 1; i >= 1; i--) below[parent[order[i]]] += below[order[i]];
  const totalPop = below[0];
  const cost = new Array(n).fill(0);
  for (let v = 0; v < n; v++) cost[0] += population[v] * depth[v];
  for (let i = 1; i < n; i++) {
    const v = order[i];
    cost[v] = cost[parent[v]] + roadLength[v] * (totalPop - 2 * below[v]);
  }
  let best = 0;
  for (let v = 1; v < n; v++) if (cost[v] < cost[best]) best = v;
  return [best, cost[best]];
};
