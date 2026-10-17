class Stack {
  // A stack on a JavaScript array: push and pop at the end.
  #items = [];

  push(value) {
    this.#items.push(value); // @line fixture.stack.push
  }

  pop() {
    if (this.#items.length === 0) { // @line fixture.stack.checkEmpty
      throw new RangeError("pop from an empty stack");
    }
    return this.#items.pop(); // @line fixture.stack.pop
  }

  peek() {
    if (this.#items.length === 0) { // @line fixture.stack.checkEmpty
      throw new RangeError("peek at an empty stack");
    }
    return this.#items[this.#items.length - 1]; // @line fixture.stack.peek
  }

  snapshot() {
    // Bottom to top, as a new array.
    return [...this.#items];
  }
}
