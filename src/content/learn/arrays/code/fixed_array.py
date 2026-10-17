class FixedArray:
    def __init__(self, capacity=10):
        self.data = [None] * capacity
        self.size = 0

    def insert_at(self, i, value):
        if self.size == len(self.data):  # @line array.insert.full
            raise IndexError("array is full")
        if not 0 <= i <= self.size:  # @line array.insert.range
            raise IndexError("index out of range")
        for k in range(self.size - 1, i - 1, -1):  # from the end
            self.data[k + 1] = self.data[k]  # @line array.insert.shift
        self.data[i] = value  # @line array.insert.write
        self.size += 1

    def remove_at(self, i):
        if not 0 <= i < self.size:  # @line array.remove.range
            raise IndexError("index out of range")
        value = self.data[i]  # @line array.remove.read
        for k in range(i, self.size - 1):
            self.data[k] = self.data[k + 1]  # @line array.remove.shift
        self.size -= 1
        self.data[self.size] = None  # @line array.remove.clear
        return value

    def snapshot(self):
        return self.data[:self.size]
