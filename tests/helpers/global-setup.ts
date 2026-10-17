import { ensureTestDatabase } from "./db";

/** Vitest global setup for integration tests: create + migrate the test DB once. */
export default async function setup() {
  const name = await ensureTestDatabase();
  console.log(`[integration] using database ${name}`);
}
