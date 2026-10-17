// Randomness of the lobby draw (docs/specs/rooms.md §2.8): Web Crypto in
// production. Integration tests replace this module (vi.mock) with a seeded
// generator so draws through the route handlers are reproducible.
import { cryptoRng, type Rng } from "@/lib/rooms/rng";

export function sessionRng(): Rng {
  return cryptoRng();
}
