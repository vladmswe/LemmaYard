/**
 * @param {string} text
 * @return {string}
 */
var squeeze = function (text) {
  const parts = [];
  let run = 0;
  for (let i = 0; i < text.length; i++) {
    run++;
    if (i + 1 === text.length || text[i + 1] !== text[i]) {
      parts.push(run >= 2 ? text[i] + run : text[i]);
      run = 0;
    }
  }
  const squeezed = parts.join("");
  return squeezed.length < text.length ? squeezed : text;
};
