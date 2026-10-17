function prefixSums(a) {
  const p = new Array(a.length + 1).fill(0); // @line prefix.build.init
  for (let i = 0; i < a.length; i++) {
    p[i + 1] = p[i] + a[i]; // @line prefix.build.step
  }
  return p;
}

// Sum of a[l], ..., a[r - 1]: the half-open range [l, r).
function rangeSum(p, l, r) {
  return p[r] - p[l]; // @line prefix.query
}
