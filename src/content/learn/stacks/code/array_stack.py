class ArrayStack:
    def __init__(self):
        self._data = [None] * 4
        self._size = 0  # top is always index self._size - 1

    def push(self, value):
        if self._size == len(self._data):  # @line stack.push.grow
            self._data = self._data + [None] * len(self._data)  # copy into twice the room
        self._data[self._size] = value  # @line stack.push.write
        self._size += 1

    def pop(self):
        if self._size == 0:  # @line stack.pop.empty
            raise IndexError("pop from empty stack")
        self._size -= 1
        value = self._data[self._size]  # @line stack.pop.read
        self._data[self._size] = None
        return value

    def peek(self):
        if self._size == 0:  # @line stack.peek.empty
            raise IndexError("peek at empty stack")
        return self._data[self._size - 1]  # @line stack.peek.read

    def is_empty(self):
        return self._size == 0

    def to_list(self):
        return self._data[:self._size]
