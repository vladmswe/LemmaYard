/**
 * @param {number} n
 * @param {number[][]} rules
 * @return {number[]}
 */
var taskOrder = function (n, rules) {
  const after = Array.from({ length: n }, () => []);
  const waiting = new Array(n).fill(0);
  for (const [a, b] of rules) {
    after[a].push(b);
    waiting[b]++;
  }
  // Binary min-heap of ready jobs.
  const heap = [];
  const push = (x) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p] <= heap[i]) break;
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
        if (l < heap.length && heap[l] < heap[m]) m = l;
        if (r < heap.length && heap[r] < heap[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (let v = 0; v < n; v++) if (waiting[v] === 0) push(v);
  const order = [];
  while (heap.length > 0) {
    const v = pop();
    order.push(v);
    for (const w of after[v]) if (--waiting[w] === 0) push(w);
  }
  return order.length === n ? order : [];
};
