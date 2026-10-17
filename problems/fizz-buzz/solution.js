/**
 * @param {number} n
 * @return {string[]}
 */
var fizzBuzz = function (n) {
  const res = new Array(n);
  let three = 0;
  let five = 0;
  for (let i = 1; i <= n; i++) {
    three++;
    five++;
    if (three === 3 && five === 5) {
      res[i - 1] = "FizzBuzz";
      three = 0;
      five = 0;
    } else if (three === 3) {
      res[i - 1] = "Fizz";
      three = 0;
    } else if (five === 5) {
      res[i - 1] = "Buzz";
      five = 0;
    } else {
      res[i - 1] = String(i);
    }
  }
  return res;
};
