def next_greater(values):
    answer = [-1] * len(values)
    stack = []  # indices whose values never increase from bottom to top
    for i, x in enumerate(values):
        while stack and values[stack[-1]] < x:
            answer[stack.pop()] = x  # @line monotonic.pop
        stack.append(i)  # @line monotonic.push
    return answer
