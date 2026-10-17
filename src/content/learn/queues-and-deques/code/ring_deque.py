class RingDeque:
    def __init__(self, capacity=8):
        self._data = [None] * capacity
        self._head = 0  # slot of the front value
        self._size = 0  # the back value sits at (head + size - 1) % capacity

    def push_back(self, value):
        if self._size == len(self._data):  # @line deque.pushBack.full
            self._grow()
        self._data[(self._head + self._size) % len(self._data)] = value  # @line deque.pushBack.write
        self._size += 1

    def push_front(self, value):
        if self._size == len(self._data):  # @line deque.pushFront.full
            self._grow()
        self._head = (self._head - 1 + len(self._data)) % len(self._data)  # @line deque.pushFront.write
        self._data[self._head] = value
        self._size += 1

    def pop_front(self):
        if self._size == 0:  # @line deque.popFront.empty
            raise IndexError("pop from empty deque")
        value = self._data[self._head]  # @line deque.popFront.read
        self._head = (self._head + 1) % len(self._data)
        self._size -= 1
        return value

    def pop_back(self):
        if self._size == 0:  # @line deque.popBack.empty
            raise IndexError("pop from empty deque")
        self._size -= 1
        return self._data[(self._head + self._size) % len(self._data)]  # @line deque.popBack.read

    def _grow(self):
        old, cap = self._data, len(self._data)
        self._data = [None] * (2 * cap)  # @line deque.grow.alloc
        for i in range(self._size):
            self._data[i] = old[(self._head + i) % cap]  # @line deque.grow.copy
        self._head = 0  # @line deque.grow.done
