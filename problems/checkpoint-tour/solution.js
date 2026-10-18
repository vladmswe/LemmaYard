/**
 * @param {number[][]} points
 * @return {number}
 */
var shortestTour = function (points) {
  const n = points.length;
  const dist = points.map((a) => points.map((b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])));
  const full = 1 << n;
  // best[mask * n + v]: shortest run from 0 stamping exactly `mask`, standing at v.
  const best = new Float64Array(full * n).fill(Infinity);
  best[1 * n + 0] = 0;
  for (let mask = 1; mask < full; mask += 2) {
    for (let v = 0; v < n; v++) {
      const here = best[mask * n + v];
      if (here === Infinity) continue;
      for (let w = 0; w < n; w++) {
        const bit = 1 << w;
        if (mask & bit) continue;
        const cand = here + dist[v][w];
        const idx = (mask | bit) * n + w;
        if (cand < best[idx]) best[idx] = cand;
      }
    }
  }
  let answer = Infinity;
  for (let v = 0; v < n; v++) answer = Math.min(answer, best[(full - 1) * n + v]);
  return answer;
};
