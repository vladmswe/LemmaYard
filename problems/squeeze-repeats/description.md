A telemetry link is slow, so before sending a log line made of lowercase
letters the device tries to shorten it. It cuts `text` into maximal blocks of
equal neighbouring letters. A block of length `L >= 2` is replaced by its
letter followed by `L` written in decimal; a block of a single letter is left
as it is. For example `"zzzzzzzzzzzyab"` becomes `"z11yab"`.

The device keeps the shortened form only when it is **strictly shorter** than
the original. Return the shortened form in that case, otherwise return `text`
unchanged.

## Constraints

- `0 <= text.length <= 10^5`
- `text` contains only lowercase English letters.
