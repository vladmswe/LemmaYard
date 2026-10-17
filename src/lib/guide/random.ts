// Seeded randomness for guide generators and "Random" presets.
// Generators never call Math.random: the seed travels inside the input.

/** Returns a deterministic PRNG in [0, 1) (mulberry32). Same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] (inclusive) from `rng`. */
export function randomInt(rng: () => number, min: number, max: number): number {
  if (max < min) throw new RangeError(`randomInt: max ${max} < min ${min}`);
  return min + Math.floor(rng() * (max - min + 1));
}

/** Returns a shuffled copy (Fisher-Yates); the input array is not changed. */
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** Picks one element of a non-empty array. */
export function pick<T>(items: readonly T[], rng: () => number): T {
  if (items.length === 0) throw new RangeError("pick: empty array");
  return items[Math.floor(rng() * items.length)] as T;
}
