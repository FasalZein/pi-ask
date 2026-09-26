import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Each process loads the extension once, as pi does.
const probe = `
import askExtension from "./src/index.ts";
const active = ["read", "ask_user", "bash"];
const handlers = new Map();
const pi = {
  on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
  registerTool() {}, registerCommand() {}, registerEntryRenderer() {}, registerShortcut() {},
  events: { on() {}, emit() {} },
  getActiveTools() { return [...active]; },
  setActiveTools(names) { active.splice(0, active.length, ...names); },
};
askExtension(pi);
const results = [];
for (const mode of ["print", "json", "rpc", "tui"]) {
  for (const initial of [
    ["read", "ask_user", "bash"],
    ["read", "bash"], // A --tools allowlist that excludes ask_user.
    ["ask_user"], // A --tools allowlist that excludes other tools.
  ]) {
    active.splice(0, active.length, ...initial);
    for (const handler of handlers.get("session_start")) {
      handler({ reason: "new" }, { mode, hasUI: mode === "rpc" || mode === "tui" });
    }
    results.push({ mode, initial, active: [...active] });
  }
}
console.log(JSON.stringify(results));
`;

function activeTools() {
	const env = { ...process.env };
	const result = spawnSync(
		process.execPath,
		["--input-type=module", "--eval", probe],
		{
			cwd: new URL("..", import.meta.url),
			env,
			encoding: "utf8",
		}
	);
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as Array<{
		mode: string;
		initial: string[];
		active: string[];
	}>;
}

// Headless sessions keep ask_user so the model gets the "Needs user input" result (#54).
test("every session mode leaves active tools unchanged", () => {
	for (const { mode, initial, active } of activeTools()) {
		assert.deepEqual(active, initial, `${mode} with ${initial.join(", ")}`);
	}
});
