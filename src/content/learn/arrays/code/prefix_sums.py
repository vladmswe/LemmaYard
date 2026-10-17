def prefix_sums(a):
    p = [0] * (len(a) + 1)  # @line prefix.build.init
    for i in range(len(a)):
        p[i + 1] = p[i] + a[i]  # @line prefix.build.step
    return p


def range_sum(p, l, r):
    """Sum of a[l], ..., a[r - 1]: the half-open range [l, r)."""
    return p[r] - p[l]  # @line prefix.query
