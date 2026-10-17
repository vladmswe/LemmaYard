class RingDeque {
  constructor(capacity = 8) {
    this.data = new Array(capacity).fill(null);
    this.head = 0; this.size = 0; // the back value sits at (head + size - 1) % capacity
  }

  pushBack(value) {
    if (this.size === this.data.length) this.grow(); // @line deque.pushBack.full
    this.data[(this.head + this.size) % this.data.length] = value; // @line deque.pushBack.write
    this.size += 1;
  }

  pushFront(value) {
    if (this.size === this.data.length) this.grow(); // @line deque.pushFront.full
    this.head = (this.head - 1 + this.data.length) % this.data.length; // @line deque.pushFront.write
    this.data[this.head] = value;
    this.size += 1;
  }

  popFront() {
    if (this.size === 0) throw new Error("pop from empty deque"); // @line deque.popFront.empty
    const value = this.data[this.head]; // @line deque.popFront.read
    this.head = (this.head + 1) % this.data.length;
    this.size -= 1;
    return value;
  }

  popBack() {
    if (this.size === 0) throw new Error("pop from empty deque"); // @line deque.popBack.empty
    this.size -= 1;
    return this.data[(this.head + this.size) % this.data.length]; // @line deque.popBack.read
  }

  grow() {
    const old = this.data, cap = old.length;
    this.data = new Array(2 * cap).fill(null); // @line deque.grow.alloc
    for (let i = 0; i < this.size; i++) this.data[i] = old[(this.head + i) % cap]; // @line deque.grow.copy
    this.head = 0; // @line deque.grow.done
  }
}
