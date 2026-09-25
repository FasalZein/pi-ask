import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Each process loads the extension once, as pi does when selecting the prompt mode.
const probe = `
import askExtension from "./src/index.ts";
const active = ["read", "ask_user", "bash"];
const handlers = new Map();
const pi = {
  on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
  registerTool() {}, registerCommand() {}, registerEntryRenderer() {},
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

function activeTools(mode: "compact" | "full") {
	const env = { ...process.env };
	env.PI_ASK_PROMPT_MODE = mode;
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

test("compact mode removes only active ask_user in print and JSON sessions", () => {
	for (const { mode, initial, active } of activeTools("compact")) {
		assert.deepEqual(
			active,
			mode === "print" || mode === "json"
				? initial.filter((name) => name !== "ask_user")
				: initial,
			`${mode} with ${initial.join(", ")}`
		);
	}
});

test("full mode leaves every active tool unchanged in every session mode", () => {
	for (const { mode, initial, active } of activeTools("full")) {
		assert.deepEqual(active, initial, mode);
	}
});
