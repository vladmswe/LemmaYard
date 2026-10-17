function nextGreater(values) {
  const answer = new Array(values.length).fill(-1);
  const stack = []; // indices whose values never increase from bottom to top
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    while (stack.length > 0 && values[stack[stack.length - 1]] < x) {
      answer[stack.pop()] = x; // @line monotonic.pop
    }
    stack.push(i); // @line monotonic.push
  }
  return answer;
}
