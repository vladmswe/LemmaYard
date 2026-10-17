// Tiny counting semaphore: bounds how many async tasks run at once in this
// process (used for argon2, src/server/auth/password.ts).

export type Semaphore = {
  /** Runs `task` once a slot is free; the slot is released when it settles. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks running now. */
  active(): number;
  /** Tasks waiting for a slot. */
  waiting(): number;
};

export function createSemaphore(max: number): Semaphore {
  let running = 0;
  const queue: (() => void)[] = [];

  function release() {
    const next = queue.shift();
    if (next) next();
    else running -= 1;
  }

  async function acquire(): Promise<void> {
    if (running < max) {
      running += 1;
      return;
    }
    // The releasing task hands its slot over, so `running` stays the same.
    await new Promise<void>((resolve) => queue.push(resolve));
  }

  return {
    async run(task) {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    active: () => running,
    waiting: () => queue.length,
  };
}
