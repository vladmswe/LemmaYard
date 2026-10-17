def merge(a, b):
    """a and b are sorted; returns one sorted list with all their values."""
    c = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:  # @line merge.compare
            c.append(a[i])  # @line merge.takeA
            i += 1
        else:
            c.append(b[j])  # @line merge.takeB
            j += 1
    # one list ran out: the rest of the other is already sorted
    c.extend(a[i:])  # @line merge.restA
    c.extend(b[j:])  # @line merge.restB
    return c
