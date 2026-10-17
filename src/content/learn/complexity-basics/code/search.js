function linearSearch(a, target) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === target) { // @line search.linear.compare
      return i; // @line search.linear.found
    }
  }
  return -1; // @line search.linear.notFound
}

// a must be sorted. Returns the first index holding target, or -1.
function binarySearch(a, target) {
  let lo = 0, hi = a.length; // @line search.binary.init
  while (lo < hi) { // the range [lo, hi) is not empty
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] < target) { // @line search.binary.compare
      lo = mid + 1; // @line search.binary.right
    } else {
      hi = mid; // @line search.binary.left
    }
  }
  if (lo < a.length && a[lo] === target) { // @line search.binary.check
    return lo; // @line search.binary.found
  }
  return -1; // @line search.binary.notFound
}
