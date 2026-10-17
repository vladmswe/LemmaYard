class DynamicArray:
    def __init__(self, capacity=1):
        self._min = capacity
        self._capacity = capacity
        self._data = [None] * capacity
        self._size = 0

    def append(self, value):
        if self._size == self._capacity:  # @line dynarray.append.grow
            self._resize(self._capacity * 2)
        self._data[self._size] = value  # @line dynarray.append.write
        self._size += 1

    def pop(self):
        if self._size == 0:  # @line dynarray.pop.empty
            raise IndexError("pop from empty array")
        self._size -= 1
        value = self._data[self._size]  # @line dynarray.pop.read
        self._data[self._size] = None
        if 4 * self._size <= self._capacity and self._capacity // 2 >= self._min:  # @line dynarray.pop.shrink
            self._resize(self._capacity // 2)
        return value

    def get(self, i):
        if not 0 <= i < self._size:
            raise IndexError("index out of range")
        return self._data[i]

    def _resize(self, new_capacity):
        new_data = [None] * new_capacity  # @line dynarray.resize.alloc
        for i in range(self._size):
            new_data[i] = self._data[i]  # @line dynarray.resize.copy
        self._data = new_data  # @line dynarray.resize.swap
        self._capacity = new_capacity

    def snapshot(self):
        return [self._data[:self._size], self._capacity]
