// `pnpm sandbox:build`: builds the Python, Node and Java sandbox images
// (PLAN.md section 5) with the tags from SANDBOX_IMAGE_PYTHON /
// SANDBOX_IMAGE_NODE / SANDBOX_IMAGE_JAVA and checks size (< 200 MB), user
// (65534) and the baked-in harness files.
// `pnpm sandbox:build java` (or python / node) builds only those images.
// Run it again after every change in sandbox/.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { getEnv } from "@/server/env";

const MAX_IMAGE_BYTES = 200 * 1024 * 1024;

function build(dockerfile: string, tag: string, harnessFiles: string[]) {
  console.log(`\n==> docker build -f ${dockerfile} -t ${tag} sandbox`);
  execFileSync("docker", ["build", "--pull=false", "-f", dockerfile, "-t", tag, "sandbox"], {
    stdio: "inherit",
  });
  const raw = execFileSync(
    "docker",
    ["image", "inspect", "--format", "{{json .Config.User}} {{.Size}}", tag],
    { encoding: "utf8" },
  ).trim();
  const [userJson, sizeText] = raw.split(" ");
  const user = JSON.parse(userJson) as string;
  const size = Number(sizeText);
  if (!user.startsWith("65534")) throw new Error(`${tag}: USER is "${user}", expected 65534`);
  if (!(size < MAX_IMAGE_BYTES)) {
    throw new Error(`${tag}: image size is ${(size / 1e6).toFixed(1)} MB, limit is 200 MB`);
  }
  // With the containerd image store `.Size` is the compressed content size, so
  // also measure the unpacked root filesystem.
  const duOut = execFileSync(
    "docker",
    ["run", "--rm", "--network", "none", "--user", "0", "--entrypoint", "du", tag, "-sxk", "/"],
    { encoding: "utf8" },
  );
  const unpacked = Number.parseInt(duOut, 10) * 1024;
  if (!(unpacked < MAX_IMAGE_BYTES)) {
    throw new Error(`${tag}: unpacked image is ${(unpacked / 1e6).toFixed(1)} MB, limit is 200 MB`);
  }
  // The harness must be inside the image (no bind mounts at run time).
  for (const harness of harnessFiles) {
    execFileSync("docker", ["run", "--rm", "--network", "none", "--entrypoint", "test", tag, "-r", harness], {
      stdio: "inherit",
    });
  }
  const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
  console.log(
    `${tag}: ok (user ${user}, image size ${mb(size)}, unpacked ${mb(unpacked)}, ${harnessFiles.join(", ")} present)`,
  );
}

function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const env = getEnv();
  const images = {
    python: () => build("sandbox/Dockerfile.python", env.SANDBOX_IMAGE_PYTHON, ["/sandbox/harness.py"]),
    node: () => build("sandbox/Dockerfile.node", env.SANDBOX_IMAGE_NODE, ["/sandbox/harness.js"]),
    // The jar holds the compiled runner; the AOT cache is trained at build time.
    java: () =>
      build("sandbox/Dockerfile.java", env.SANDBOX_IMAGE_JAVA, ["/sandbox/harness.jar", "/sandbox/harness.aot"]),
  };
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((name) => !Object.hasOwn(images, name));
  if (unknown.length > 0) throw new Error(`unknown image(s): ${unknown.join(", ")} (use python, node, java)`);
  for (const [name, buildImage] of Object.entries(images)) {
    if (wanted.length === 0 || wanted.includes(name)) buildImage();
  }
}

try {
  main();
} catch (error) {
  console.error("sandbox:build failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
