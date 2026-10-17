// Runs in the browser before the app hydrates.
import { config } from "zod";

// Zod's JIT probes `new Function("")` on the first object parse; under the
// CSP (no 'unsafe-eval', src/server/http/security-headers.ts) that probe is
// caught but still reported as a `securitypolicyviolation`. Jitless parsing
// skips the probe; client-side schemas are small, so speed is unaffected.
config({ jitless: true });
