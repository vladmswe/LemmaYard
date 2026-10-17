You are given a string `s`. Look at every contiguous piece of it (a substring) in which no character occurs more than once, and return the length of the longest such piece.

A substring must consist of adjacent characters: picking characters from different places of `s` and joining them does not count. The space character is a character like any other, so two spaces in a window count as a repeat.

If `s` is empty, the answer is `0`.

## Constraints

- `0 <= s.length <= 5 * 10^4`
- `s` contains only printable ASCII characters (codes 32 to 126), including the space.

## Notes

- Letter case matters: `'a'` and `'A'` are different characters.
- An approach that inspects each character a constant number of times is enough for the largest inputs.
