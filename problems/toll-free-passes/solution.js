/**
 * @param {number} n
 * @param {number[][]} roads
 * @param {number} passes
 * @param {number} source
 * @param {number} target
 * @return {number}
 */
var cheapestRoute = function (n, roads, passes, source, target) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v, toll] of roads) {
    adj[u].push([v, toll]);
    adj[v].push([u, toll]);
  }
  const layers = passes + 1;
  // dist[v * layers + k]: cheapest toll to reach v having used k passes.
  const dist = new Array(n * layers).fill(Infinity);
  // Binary min-heap of [cost, state].
  const heap = [];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  dist[source * layers] = 0;
  push([0, source * layers]);
  while (heap.length > 0) {
    const [d, state] = pop();
    if (d > dist[state]) continue;
    const v = Math.floor(state / layers);
    const k = state % layers;
    if (v === target) return d;
    for (const [w, toll] of adj[v]) {
      const paid = w * layers + k;
      if (d + toll < dist[paid]) {
        dist[paid] = d + toll;
        push([d + toll, paid]);
      }
      if (k < passes && d < dist[paid + 1]) {
        dist[paid + 1] = d;
        push([d, paid + 1]);
      }
    }
  }
  return -1;
};
