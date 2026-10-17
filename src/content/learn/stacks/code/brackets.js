const PAIRS = { ")": "(", "]": "[", "}": "{" };

function isBalanced(text) {
  const stack = [];
  for (const ch of text) {
    if ("([{".includes(ch)) {
      stack.push(ch); // @line brackets.push
    } else if (!Object.hasOwn(PAIRS, ch)) {
      continue; // @line brackets.skip
    } else if (stack.length === 0) { // @line brackets.empty
      return false;
    } else if (stack.pop() !== PAIRS[ch]) { // @line brackets.match
      return false;
    }
  }
  return stack.length === 0; // @line brackets.end
}
