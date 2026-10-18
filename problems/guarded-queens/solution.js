/**
 * @param {string[]} board
 * @return {number}
 */
var countQueenLayouts = function (board) {
  const n = board.length;
  const full = (1 << n) - 1;
  const blocked = board.map((row) => {
    let mask = 0;
    for (let c = 0; c < n; c++) if (row[c] === "x") mask |= 1 << c;
    return mask;
  });
  const place = (r, cols, diag, anti) => {
    if (r === n) return 1;
    let total = 0;
    let free = full & ~(cols | diag | anti | blocked[r]);
    while (free) {
      const bit = free & -free;
      free ^= bit;
      total += place(r + 1, cols | bit, ((diag | bit) << 1) & full, (anti | bit) >> 1);
    }
    return total;
  };
  return place(0, 0, 0, 0);
};
