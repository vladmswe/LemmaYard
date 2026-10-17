// Placeholder for package.json scripts owned by later milestones.
// Usage: node scripts/not-implemented.mjs <script-name> <milestone>
const [name = "this script", milestone = "a later milestone"] = process.argv.slice(2);
console.error(`${name}: not implemented yet (${milestone})`);
process.exit(1);
