/**
 * @param {number} servers
 * @param {number[]} jobs
 * @return {number[]}
 */
var serverFinishTimes = function (servers, jobs) {
  const finish = new Array(servers).fill(0);
  // Binary min-heap of machine numbers ordered by (finish time, number).
  const heap = [];
  for (let k = 0; k < servers; k++) heap.push(k);
  const less = (a, b) => finish[a] < finish[b] || (finish[a] === finish[b] && a < b);
  const siftDown = (i) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && less(heap[l], heap[m])) m = l;
      if (r < heap.length && less(heap[r], heap[m])) m = r;
      if (m === i) return;
      [heap[i], heap[m]] = [heap[m], heap[i]];
      i = m;
    }
  };
  for (const length of jobs) {
    // The root is the machine idle the earliest; it stays the root's key to update.
    finish[heap[0]] += length;
    siftDown(0);
  }
  return finish;
};
