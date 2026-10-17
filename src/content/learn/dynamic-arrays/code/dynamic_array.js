class DynamicArray {
  constructor(capacity = 1) {
    this.min = capacity;
    this.capacity = capacity;
    this.data = new Array(capacity).fill(null);
    this.size = 0;
  }

  append(value) {
    if (this.size === this.capacity) this.resize(this.capacity * 2); // @line dynarray.append.grow
    this.data[this.size] = value; // @line dynarray.append.write
    this.size += 1;
  }

  pop() {
    if (this.size === 0) throw new RangeError("pop from empty array"); // @line dynarray.pop.empty
    this.size -= 1;
    const value = this.data[this.size]; // @line dynarray.pop.read
    this.data[this.size] = null;
    if (4 * this.size <= this.capacity && Math.floor(this.capacity / 2) >= this.min) { // @line dynarray.pop.shrink
      this.resize(Math.floor(this.capacity / 2));
    }
    return value;
  }

  get(i) {
    if (i < 0 || i >= this.size) throw new RangeError("index out of range");
    return this.data[i];
  }

  resize(newCapacity) {
    const newData = new Array(newCapacity).fill(null); // @line dynarray.resize.alloc
    for (let i = 0; i < this.size; i++) newData[i] = this.data[i]; // @line dynarray.resize.copy
    this.data = newData; // @line dynarray.resize.swap
    this.capacity = newCapacity;
  }

  snapshot() { return [this.data.slice(0, this.size), this.capacity]; }
}
