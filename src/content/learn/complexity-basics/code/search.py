def linear_search(a, target):
    for i in range(len(a)):
        if a[i] == target:  # @line search.linear.compare
            return i  # @line search.linear.found
    return -1  # @line search.linear.notFound


def binary_search(a, target):
    """a must be sorted. Returns the first index holding target, or -1."""
    lo, hi = 0, len(a)  # @line search.binary.init
    while lo < hi:  # the range [lo, hi) is not empty
        mid = (lo + hi) // 2
        if a[mid] < target:  # @line search.binary.compare
            lo = mid + 1  # @line search.binary.right
        else:
            hi = mid  # @line search.binary.left
    if lo < len(a) and a[lo] == target:  # @line search.binary.check
        return lo  # @line search.binary.found
    return -1  # @line search.binary.notFound
