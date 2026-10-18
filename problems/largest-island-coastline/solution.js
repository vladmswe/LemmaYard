/**
 * @param {string[]} grid
 * @return {number}
 */
var coastline = function (grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const land = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === "#";
  const seen = new Uint8Array(rows * cols);
  const stack = [];
  let bestArea = 0;
  let bestCoast = 0;
  for (let start = 0; start < rows * cols; start++) {
    const sr = Math.floor(start / cols);
    const sc = start % cols;
    if (!land(sr, sc) || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let area = 0;
    let coast = 0;
    while (stack.length > 0) {
      const cell = stack.pop();
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      area++;
      for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        if (!land(nr, nc)) {
          coast++;
        } else if (!seen[nr * cols + nc]) {
          seen[nr * cols + nc] = 1;
          stack.push(nr * cols + nc);
        }
      }
    }
    if (area > bestArea || (area === bestArea && coast > bestCoast)) {
      bestArea = area;
      bestCoast = coast;
    }
  }
  return bestCoast;
};
