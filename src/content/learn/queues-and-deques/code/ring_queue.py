class RingQueue:
    def __init__(self, capacity=8):
        self._data = [None] * capacity
        self._head = 0  # slot of the front value
        self._size = 0  # tail is (head + size) % capacity

    def enqueue(self, value):
        if self._size == len(self._data):  # @line queue.enqueue.full
            self._grow()
        tail = (self._head + self._size) % len(self._data)  # @line queue.enqueue.write
        self._data[tail] = value
        self._size += 1

    def dequeue(self):
        if self._size == 0:  # @line queue.dequeue.empty
            raise IndexError("dequeue from empty queue")
        value = self._data[self._head]  # @line queue.dequeue.read
        self._data[self._head] = None
        self._head = (self._head + 1) % len(self._data)
        self._size -= 1
        return value

    def peek(self):
        if self._size == 0:  # @line queue.peek.empty
            raise IndexError("peek at empty queue")
        return self._data[self._head]  # @line queue.peek.read

    def size(self):
        return self._size

    def _grow(self):
        old, cap = self._data, len(self._data)
        self._data = [None] * (2 * cap)  # @line queue.grow.alloc
        for i in range(self._size):
            self._data[i] = old[(self._head + i) % cap]  # @line queue.grow.copy
        self._head = 0  # @line queue.grow.done
