class FixedArray {
  constructor(capacity = 10) {
    this.data = new Array(capacity).fill(null);
    this.size = 0;
  }

  insertAt(i, value) {
    if (this.size === this.data.length) { // @line array.insert.full
      throw new RangeError("array is full");
    }
    if (i < 0 || i > this.size) { // @line array.insert.range
      throw new RangeError("index out of range");
    }
    for (let k = this.size - 1; k >= i; k--) { // from the end
      this.data[k + 1] = this.data[k]; // @line array.insert.shift
    }
    this.data[i] = value; // @line array.insert.write
    this.size += 1;
  }

  removeAt(i) {
    if (i < 0 || i >= this.size) { // @line array.remove.range
      throw new RangeError("index out of range");
    }
    const value = this.data[i]; // @line array.remove.read
    for (let k = i; k < this.size - 1; k++) {
      this.data[k] = this.data[k + 1]; // @line array.remove.shift
    }
    this.size -= 1;
    this.data[this.size] = null; // @line array.remove.clear
    return value;
  }

  snapshot() {
    return this.data.slice(0, this.size);
  }
}
