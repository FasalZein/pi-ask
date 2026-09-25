import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// A new process models loading pi-ask once with the chosen prompt mode.
const probe = `
import { registerAskTool } from "./src/ask-tool.ts";
import { DEFAULT_ASK_CONFIG } from "./src/config/defaults.ts";
import { getAskConfigStore } from "./src/config/store.ts";
await getAskConfigStore().ensureLoaded();
getAskConfigStore().setConfig({ ...DEFAULT_ASK_CONFIG, notifications: { ...DEFAULT_ASK_CONFIG.notifications, enabled: false } });
let tool;
registerAskTool({ registerTool(value) { tool = value; }, appendEntry() {}, getCommands() { return []; } });
const params = { questions: [{ id: "goal", label: "Goal", prompt: "Choose a goal", options: [{ value: "speed", label: "Speed" }] }] };
const theme = { fg(_color, text) { return text; }, bg(_color, text) { return text; } };
async function interactive(keys) {
  let component;
  const pending = tool.execute("call", params, undefined, () => {}, {
    cwd: process.cwd(), mode: "tui", ui: {
      setWorkingVisible() {},
      custom(callback) {
        return new Promise(resolve => {
          component = callback({ requestRender() {} }, theme, {}, resolve);
        });
      },
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  for (const key of keys) component.handleInput(key);
  return pending;
}
const cases = {
  submitted: await interactive(["1", "\\r"]),
  elaborated: await interactive(["1", "\\x1b[B", "\\r"]),
  cancelled: await interactive(["\\x1b"]),
  invalid: await tool.execute("invalid", { questions: [] }, undefined, () => {}, { mode: "print" }),
  unavailable: await tool.execute("print", params, undefined, () => {}, { mode: "print" }),
  aborted: await tool.execute("abort", params, AbortSignal.abort(), () => {}, { mode: "tui" }),
};
console.log(JSON.stringify(Object.fromEntries(Object.entries(cases).map(([name, response]) => [name, {
  content: response.content[0].text,
  rendered: tool.renderResult(response, undefined, theme).text,
  mode: response.details.mode,
  cancelled: response.details.cancelled,
}]))));
`;

function run(mode: string) {
	const env = { ...process.env };
	env.PI_ASK_PROMPT_MODE = mode;
	const result = spawnSync(
		process.execPath,
		["--input-type=module", "--eval", probe],
		{
			cwd: new URL("..", import.meta.url),
			env,
			encoding: "utf8",
			timeout: 10_000,
		}
	);
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as Record<
		string,
		{ content: string; rendered: string; mode: string; cancelled: boolean }
	>;
}

test("compact and full results contain the same answers without a follow-up hint", () => {
	const full = run("full");
	const compact = run("compact");
	assert.equal(full.submitted.content, "Goal: Speed");
	assert.equal(full.elaborated.mode, "elaborate");
	assert.equal(compact.submitted.content, full.submitted.content);
	assert.equal(compact.elaborated.content, full.elaborated.content);
	for (const kind of ["cancelled", "invalid", "unavailable", "aborted"]) {
		assert.equal(compact[kind].content, full[kind].content, kind);
		assert.equal(compact[kind].cancelled, true, kind);
	}
	for (const kind of Object.keys(full)) {
		assert.equal(compact[kind].rendered, full[kind].rendered, kind);
	}
});
