The array `prices` lists the price of one share on consecutive days:
`prices[i]` is the price on day `i`.

You may make at most one trade: buy one share on some day, then sell it on a
strictly later day. Return the largest profit (sell price minus buy price) you
can get. If no trade makes money, do not trade and return `0`.

## Constraints

- `1 <= prices.length <= 10^4`
- `0 <= prices[i] <= 10^4`

## Notes

Selling has to happen after buying, so the cheapest day overall is not always
the right day to buy: it may come after every good selling day.
