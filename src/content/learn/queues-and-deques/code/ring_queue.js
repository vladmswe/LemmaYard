class RingQueue {
  constructor(capacity = 8) {
    this.data = new Array(capacity).fill(null);
    this.head = 0; // slot of the front value
    this.count = 0; // tail is (head + count) % capacity
  }

  enqueue(value) {
    if (this.count === this.data.length) this.grow(); // @line queue.enqueue.full
    const tail = (this.head + this.count) % this.data.length; // @line queue.enqueue.write
    this.data[tail] = value;
    this.count += 1;
  }

  dequeue() {
    if (this.count === 0) throw new Error("dequeue from empty queue"); // @line queue.dequeue.empty
    const value = this.data[this.head]; // @line queue.dequeue.read
    this.data[this.head] = null;
    this.head = (this.head + 1) % this.data.length;
    this.count -= 1;
    return value;
  }

  peek() {
    if (this.count === 0) throw new Error("peek at empty queue"); // @line queue.peek.empty
    return this.data[this.head]; // @line queue.peek.read
  }

  size() {
    return this.count;
  }

  grow() {
    const old = this.data;
    const cap = old.length;
    this.data = new Array(2 * cap).fill(null); // @line queue.grow.alloc
    for (let i = 0; i < this.count; i++) this.data[i] = old[(this.head + i) % cap]; // @line queue.grow.copy
    this.head = 0; // @line queue.grow.done
  }
}
