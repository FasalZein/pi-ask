#!/usr/bin/env bash
set -euo pipefail

# Install the floor in isolation so the working lockfile and dependencies stay current.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
floor="$(mktemp -d)"
trap 'rm -rf "$floor"' EXIT
rsync -a --exclude=.git --exclude=node_modules "$root/" "$floor/"

cd "$floor"
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const packageFile = "package.json";
const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
for (const name of ["pi-agent-core", "pi-ai", "pi-tui", "pi-coding-agent"]) {
  const dependency = `@earendil-works/${name}`;
  if (dependency in pkg.devDependencies) pkg.devDependencies[dependency] = "0.99.0";
}
pkg.devDependencies.typebox = "1.3.27";
writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

const workspaceFile = "pnpm-workspace.yaml";
const workspace = readFileSync(workspaceFile, "utf8");
const floorWorkspace = workspace.replace(/('@earendil-works\/pi-[^']+': )1\.0\.2/g, (_, prefix) => `${prefix}0.99.0`);
if (floorWorkspace === workspace || (floorWorkspace.match(/0\.99\.0/g) ?? []).length !== 4) {
  throw new Error("Expected four pi overrides at 1.0.2");
}
writeFileSync(workspaceFile, floorWorkspace);
NODE
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm test
