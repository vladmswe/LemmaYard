// Injected randomness for the problem draw (spec §2.8): production uses
// `crypto.getRandomValues`, tests use a seeded generator so draws reproduce.

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** Mulberry32: tiny, fast, good enough for picking among a few problems. */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Web Crypto backed RNG (Node 22 and browsers both expose `globalThis.crypto`). */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return () => {
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  };
}

/** Uniform pick; `items` must be non-empty. */
export function pickOne<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error("pickOne: empty list");
  const i = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[i];
}
