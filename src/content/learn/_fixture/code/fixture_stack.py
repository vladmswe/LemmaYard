class Stack:
    """A stack on a Python list: push and pop at the end."""

    def __init__(self):
        self._items = []

    def push(self, value):
        self._items.append(value)  # @line fixture.stack.push

    def pop(self):
        if not self._items:  # @line fixture.stack.checkEmpty
            raise IndexError("pop from an empty stack")
        return self._items.pop()  # @line fixture.stack.pop

    def peek(self):
        if not self._items:  # @line fixture.stack.checkEmpty
            raise IndexError("peek at an empty stack")
        return self._items[-1]  # @line fixture.stack.peek

    def snapshot(self):
        # Bottom to top, as a new list.
        return list(self._items)
