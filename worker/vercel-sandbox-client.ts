// The real `SandboxClient` on top of `@vercel/sandbox` (docs/specs/judge-prod.md).
// On Vercel the SDK authenticates with the deployment's OIDC token; nothing
// here reads or passes credentials. Every VM: 1 vCPU, all egress denied
// (DNS included), no environment, not persistent (no snapshot on stop).
import { Sandbox } from "@vercel/sandbox";

import type { SandboxClient, SandboxCommand, SandboxCreateOptions, SandboxRunOptions, SandboxVm } from "./vercel-sandbox-executor";
import { VM_DIR } from "./vercel-sandbox-executor";

/** The exact `Sandbox.create` options; exported for the unit test. */
export function createParams(options: SandboxCreateOptions) {
  return {
    image: options.image,
    resources: { vcpus: 1 },
    timeout: options.timeoutMs,
    networkPolicy: "deny-all" as const,
    persistent: false,
  };
}

export function vercelSandboxClient(): SandboxClient {
  return {
    async create(options: SandboxCreateOptions): Promise<SandboxVm> {
      const sandbox = await Sandbox.create(createParams(options));
      return {
        async writeFiles(files) {
          await sandbox.writeFiles(files);
        },
        async run({ cmd, args, timeoutMs, onOutput }: SandboxRunOptions): Promise<SandboxCommand> {
          const command = await sandbox.runCommand({ cmd, args, cwd: VM_DIR, detached: true, timeoutMs });
          const done = (async () => {
            // The log stream ends when the command exits, so every frame has
            // arrived before the exit code is read.
            for await (const log of command.logs()) {
              onOutput(log.stream === "stderr" ? "stderr" : "stdout", Buffer.from(log.data, "utf8"));
            }
            const finished = await command.wait();
            return { exitCode: Number.isInteger(finished.exitCode) ? finished.exitCode : null };
          })();
          return {
            done,
            kill: () => command.kill("SIGKILL"),
          };
        },
        async stop() {
          await sandbox.stop();
        },
      };
    },
  };
}
