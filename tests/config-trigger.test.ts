import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { matchesConfigPrompt } from "../src/config-trigger.ts";

const CONFIG_DOC_REFERENCE = /first read .*docs\/configuration\.md/;

for (const term of [
	"pi-ask",
	"ask_user",
	"ask-user",
	"/ask-settings",
	"ask settings",
	"/answer",
	"/ask:replay",
	"keymap",
	"keybinding",
]) {
	test(`config trigger matches ${term} in any letter case`, () => {
		assert.equal(matchesConfigPrompt(`Please update ${term}`), true);
		assert.equal(
			matchesConfigPrompt(`Please update ${term.toUpperCase()}`),
			true
		);
		assert.equal(
			matchesConfigPrompt(`Please update ${term.toLowerCase()}`),
			true
		);
	});
}

test("unrelated prompts do not trigger configuration advice", () => {
	assert.equal(matchesConfigPrompt("hi"), false);
	assert.equal(
		matchesConfigPrompt("Refactor the database query for speed"),
		false
	);
});

// A separate process selects compact mode before the extension module loads.
const probe = `
import askExtension from "./src/index.ts";
const handlers = new Map();
askExtension({
  on(name, handler) { handlers.set(name, handler); },
  registerTool() {}, registerShortcut() {}, registerCommand() {}, registerEntryRenderer() {},
  events: { on() {}, emit() {} },
});
const beforeStart = handlers.get("before_agent_start");
const visible = [];
const context = { messages: [] };
const sessionManager = {
  getBranch() { return []; },
  buildSessionContext() { return context; },
};
const run = () => beforeStart({ prompt: "Change the ask_user keymap", systemPrompt: "base" }, { sessionManager });
const first = await run();
context.messages.push({ role: "custom", ...first.message });
const repeated = await run();
context.messages.length = 0;
const afterCompaction = await run();
const quiet = await beforeStart({ prompt: "Refactor the query", systemPrompt: "base" }, { sessionManager });
const newerContext = { messages: [{ role: "custom", customType: "pi_ask_config" }] };
const projectionManager = {
  getBranch() { return []; },
  buildSessionProjection() { return newerContext; },
  buildSessionContext() { throw Error("projection should take precedence"); },
};
const projected = await beforeStart({ prompt: "ask_user keybinding", systemPrompt: "base" }, { sessionManager: projectionManager });
console.log(JSON.stringify({ first, repeated, afterCompaction, quiet, projected }));
`;

test("compact extension sends hidden advice once per active context, including pre-0.87 fallback", () => {
	const env = { ...process.env };
	env.PI_ASK_PROMPT_MODE = "compact";
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
	const { first, repeated, afterCompaction, quiet, projected } = JSON.parse(
		result.stdout
	);
	assert.equal("systemPrompt" in first, false);
	assert.equal(first.message.customType, "pi_ask_config");
	assert.equal(first.message.display, false);
	assert.match(first.message.content, CONFIG_DOC_REFERENCE);
	assert.deepEqual(repeated, {});
	assert.deepEqual(afterCompaction, first);
	assert.deepEqual(quiet, {});
	assert.deepEqual(projected, {});
});
