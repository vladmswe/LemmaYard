class ArrayStack {
  constructor() {
    this.data = new Array(4).fill(null);
    this.size = 0; // top is always index this.size - 1
  }

  push(value) {
    if (this.size === this.data.length) { // @line stack.push.grow
      this.data = this.data.concat(new Array(this.data.length).fill(null)); // copy into twice the room
    }
    this.data[this.size] = value; // @line stack.push.write
    this.size += 1;
  }

  pop() {
    if (this.size === 0) throw new Error("pop from empty stack"); // @line stack.pop.empty
    this.size -= 1;
    const value = this.data[this.size]; // @line stack.pop.read
    this.data[this.size] = null;
    return value;
  }

  peek() {
    if (this.size === 0) throw new Error("peek at empty stack"); // @line stack.peek.empty
    return this.data[this.size - 1]; // @line stack.peek.read
  }

  isEmpty() {
    return this.size === 0;
  }

  toList() {
    return this.data.slice(0, this.size);
  }
}
