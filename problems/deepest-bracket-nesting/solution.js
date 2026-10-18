/**
 * @param {string} text
 * @return {number}
 */
var deepestNesting = function (text) {
  const opening = "([{";
  const closing = ")]}";
  const stack = [];
  let deepest = 0;
  for (const ch of text) {
    const o = opening.indexOf(ch);
    if (o >= 0) {
      stack.push(o);
      if (stack.length > deepest) deepest = stack.length;
      continue;
    }
    const c = closing.indexOf(ch);
    if (c >= 0) {
      if (stack.length === 0 || stack.pop() !== c) return -1;
    }
  }
  return stack.length === 0 ? deepest : -1;
};
