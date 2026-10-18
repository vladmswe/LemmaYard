/**
 * @param {number[]} readings
 * @param {number} margin
 * @return {number}
 */
var countSpikes = function (readings, margin) {
  let count = 0;
  for (let i = 1; i + 1 < readings.length; i++) {
    const here = readings[i];
    if (here - readings[i - 1] > margin && here - readings[i + 1] > margin) count++;
  }
  return count;
};
