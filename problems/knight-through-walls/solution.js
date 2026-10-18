/**
 * @param {string[]} board
 * @return {number}
 */
var knightMoves = function (board) {
  const rows = board.length;
  const cols = board[0].length;
  const jumps = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
  let start = -1;
  let target = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c] === "S") start = r * cols + c;
      else if (board[r][c] === "T") target = r * cols + c;
    }
  }
  const dist = new Int32Array(rows * cols).fill(-1);
  dist[start] = 0;
  let frontier = [start];
  while (frontier.length > 0) {
    const next = [];
    for (const cell of frontier) {
      if (cell === target) return dist[cell];
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      for (const [dr, dc] of jumps) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || board[nr][nc] === "#") continue;
        const id = nr * cols + nc;
        if (dist[id] < 0) {
          dist[id] = dist[cell] + 1;
          next.push(id);
        }
      }
    }
    frontier = next;
  }
  return -1;
};
