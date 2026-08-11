import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = { source: null, destination: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") options.source = path.resolve(argv[++index]);
    else if (arg === "--destination") options.destination = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.source || !options.destination) {
    throw new Error("Usage: node sync-macos-runtime.mjs --source <repo> --destination <runtime-dir>");
  }
  return options;
}

const RUNTIME_ENTRIES = [
  "scripts/autoskin-macos.sh",
  "scripts/autoskin-menubar-macos.sh",
  "scripts/configure-base-theme.mjs",
  "scripts/generate-quick-theme-macos.mjs",
  "scripts/injector.mjs",
  "scripts/install-dream-skin.ps1",
  "scripts/install-dream-skin.sh",
  "scripts/lib/mac-common.sh",
  "scripts/macos-capture.mjs",
  "scripts/macos-launch-agent.mjs",
  "scripts/quick-theme-macos.sh",
  "scripts/restore-dream-skin.ps1",
  "scripts/restore-dream-skin.sh",
  "scripts/set-theme.mjs",
  "scripts/start-dream-skin.ps1",
  "scripts/start-dream-skin.sh",
  "scripts/sync-macos-runtime.mjs",
  "scripts/verify-dream-skin.ps1",
  "scripts/verify-dream-skin.sh",
  "scripts/watch-dream-skin.ps1",
  "scripts/watch-dream-skin.sh",
  "assets/renderer-inject.js",
  "assets/runtime",
  "styles/dream",
  "themes",
];
const EXECUTABLE_RUNTIME_FILES = RUNTIME_ENTRIES.filter((entry) => entry.endsWith(".sh"));
const options = parseArgs(process.argv.slice(2));

if (options.source === options.destination) {
  console.log(options.destination);
  process.exit(0);
}

for (const entry of RUNTIME_ENTRIES) {
  const stat = await fs.stat(path.join(options.source, entry)).catch(() => null);
  if (!stat) throw new Error(`Runtime source is missing ${entry}: ${options.source}`);
}

const parent = path.dirname(options.destination);
const privateThemes = path.join(parent, "themes-private");
const next = `${options.destination}.next-${process.pid}`;
const previous = `${options.destination}.previous-${process.pid}`;
await fs.mkdir(parent, { recursive: true });
await fs.mkdir(privateThemes, { recursive: true });
await fs.rm(next, { recursive: true, force: true });
await fs.rm(previous, { recursive: true, force: true });
await fs.mkdir(next, { recursive: true });

try {
  for (const entry of RUNTIME_ENTRIES) {
    const source = path.join(options.source, entry);
    const destination = path.join(next, entry);
    const stat = await fs.stat(source);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, {
      recursive: stat.isDirectory(),
      preserveTimestamps: true,
    });
  }
  // GitHub's archive installer does not preserve executable bits. Normalize
  // every runtime shell entry explicitly so a downloaded Skill behaves like a
  // git clone after the first bootstrap.
  for (const entry of EXECUTABLE_RUNTIME_FILES) {
    await fs.chmod(path.join(next, entry), 0o755);
  }
  const sourcePrivateThemes = path.join(options.source, "themes-private");
  const sourcePrivateStat = await fs.stat(sourcePrivateThemes).catch(() => null);
  if (sourcePrivateStat) {
    const sourceReal = await fs.realpath(sourcePrivateThemes);
    const destinationReal = await fs.realpath(privateThemes);
    if (sourceReal !== destinationReal) {
      await fs.cp(sourcePrivateThemes, privateThemes, { recursive: true, preserveTimestamps: true });
    }
  }
  await fs.symlink("../themes-private", path.join(next, "themes-private"), "dir");
  await fs.writeFile(path.join(next, ".runtime.json"), JSON.stringify({
    installedAt: new Date().toISOString(),
    sourceRoot: options.source,
  }, null, 2) + "\n");

  const existing = await fs.stat(options.destination).catch(() => null);
  if (existing) await fs.rename(options.destination, previous);
  try {
    await fs.rename(next, options.destination);
  } catch (error) {
    if (existing) await fs.rename(previous, options.destination).catch(() => {});
    throw error;
  }
  await fs.rm(previous, { recursive: true, force: true });
} catch (error) {
  await fs.rm(next, { recursive: true, force: true });
  throw error;
}

console.log(options.destination);
