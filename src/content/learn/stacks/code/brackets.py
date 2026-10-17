PAIRS = {")": "(", "]": "[", "}": "{"}


def is_balanced(text):
    stack = []
    for ch in text:
        if ch in "([{":
            stack.append(ch)  # @line brackets.push
        elif ch not in PAIRS:
            continue  # @line brackets.skip
        elif not stack:  # @line brackets.empty
            return False
        elif stack.pop() != PAIRS[ch]:  # @line brackets.match
            return False
    return not stack  # @line brackets.end
