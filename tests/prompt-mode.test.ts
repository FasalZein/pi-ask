import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { Value } from "typebox/value";
import {
	COMPACT_FOLLOW_UP_HINT,
	PI_ASK_CONFIG_PROMPT,
} from "../src/prompt-text.ts";

// Each process loads the extension once, just as pi does. A mode change after load must not redefine the tool.
const probe = `
import askExtension from "./src/index.ts";
const tools = [];
const pi = {
  on() {}, registerCommand() {},
  registerTool(tool) { tools.push(tool); },
  events: { on() {}, emit() {} },
};
askExtension(pi);
process.env.PI_ASK_PROMPT_MODE = "compact";
askExtension(pi);
console.log(JSON.stringify(tools.map(({ description, promptSnippet, promptGuidelines, parameters }) => ({ description, promptSnippet, promptGuidelines, parameters }))));
`;

function registeredText(mode: string | undefined) {
	const env = { ...process.env };
	if (mode === undefined) {
		env.PI_ASK_PROMPT_MODE = undefined;
	} else {
		env.PI_ASK_PROMPT_MODE = mode;
	}
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
	return {
		tools: JSON.parse(result.stdout),
		warnings: result.stderr.trim() ? result.stderr.trim().split("\n") : [],
	};
}

const compactDescription =
	"Interactive clarification tool for cases where the next step depends on user preferences, missing requirements, or choosing between multiple valid directions. Ask a short structured interview, collect normalized answers, and continue using those answers explicitly instead of guessing.";
const compactGuideline =
	"Use `ask_user` before preference-sensitive decisions (scope, tone, UX, naming, architecture, docs, implementation direction), or when several valid directions exist; ask 1-3 concise questions instead of choosing one path yourself.";
const recommendation =
	"Optional. Set true on an option you recommend for a grounded reason; state the reason in `description`.";

const compact = registeredText("compact");
const full = registeredText(undefined);

test("prompt mode selects fixed compact text at load and preserves all other schema fields", () => {
	assert.deepEqual(compact.warnings, []);
	assert.equal(compact.tools.length, 2);
	assert.deepEqual(compact.tools[0], compact.tools[1]);
	const tool = compact.tools[0];
	assert.equal(tool.description, compactDescription);
	assert.deepEqual(tool.promptGuidelines, [compactGuideline]);
	assert.equal(tool.promptSnippet, full.tools[0].promptSnippet);
	const option =
		tool.parameters.properties.questions.items.properties.options.items;
	assert.equal(option.properties.recommended.description, recommendation);
	const unchanged = structuredClone(tool.parameters);
	unchanged.properties.questions.items.properties.options.items.properties.recommended.description =
		full.tools[0].parameters.properties.questions.items.properties.options.items.properties.recommended.description;
	assert.deepEqual(unchanged, full.tools[0].parameters);
	assert.equal(
		Value.Check(tool.parameters, {
			questions: [
				{
					id: "q",
					prompt: "Pick",
					options: [{ value: "a", label: "A", recommended: true }],
				},
			],
		}),
		true
	);
	assert.equal(
		Value.Check(tool.parameters, {
			questions: [{ id: "q", prompt: "Pick", options: [{ value: "a" }] }],
		}),
		false
	);
});

test("unset, empty, and full preserve full text; unknown mode warns once", () => {
	for (const mode of ["", "full", "not-a-mode"]) {
		const actual = registeredText(mode);
		assert.deepEqual(actual.tools, full.tools, mode);
		assert.equal(actual.warnings.length, mode === "not-a-mode" ? 1 : 0);
	}
});

test("compact rule inventory has a single observed home for each rule", () => {
	const tool = compact.tools[0];
	const descriptions: Record<string, string> = {};
	function collect(node: unknown, path: string) {
		if (!node || typeof node !== "object") {
			return;
		}
		const schema = node as {
			description?: string;
			properties?: Record<string, unknown>;
			items?: unknown;
		};
		if (schema.description) {
			descriptions[path] = schema.description;
		}
		for (const [key, child] of Object.entries(schema.properties ?? {})) {
			collect(child, `${path}.${key}`);
		}
		if (schema.items) {
			collect(schema.items, `${path}[]`);
		}
	}
	collect(tool.parameters, "parameters");
	const homes: Record<string, string> = {
		guideline: tool.promptGuidelines[0],
		followUp: COMPACT_FOLLOW_UP_HINT,
		config: PI_ASK_CONFIG_PROMPT,
		...descriptions,
	};
	// Inventory from the compact-mode rule allocation in spec #1. The result/config
	// homes are prepared here; #16 and #17 wire them into their runtime paths.
	const rules: [string, string, string][] = [
		["G1", "guideline", "before preference-sensitive decisions"],
		["G2", "guideline", "1-3 concise questions"],
		["G3", "parameters.questions[].prompt", "one decision at a time"],
		["G4", "parameters.questions[].id", "stable question identifier"],
		["G5", "parameters.questions[].options", "clear, distinct choices"],
		[
			"G6",
			"parameters.questions[].options[].recommended",
			"Set true on an option you recommend",
		],
		["G7", "parameters.questions[].type", "Question type"],
		["G8", "parameters.questions[].type", "Use `preview` only"],
		["G9", "followUp", "another `ask_user` call, not plain-text choices"],
		["G10", "followUp", "bundle the next 2-3 related decisions"],
		[
			"G11",
			"followUp",
			"ask one at a time only when the next question depends",
		],
		["D1", "parameters.questions[].prompt", "Required direct question"],
		[
			"D2",
			"parameters.questions[].options[].value",
			"Required machine-readable value",
		],
		[
			"D3",
			"parameters.questions[].options[].label",
			"Required short visible option label",
		],
		["C1", "config", "first read"],
	];
	assert.deepEqual(
		rules.map(([id]) => id),
		[
			"G1",
			"G2",
			"G3",
			"G4",
			"G5",
			"G6",
			"G7",
			"G8",
			"G9",
			"G10",
			"G11",
			"D1",
			"D2",
			"D3",
			"C1",
		]
	);
	for (const [id, path, phrase] of rules) {
		assert.ok(
			homes[path]?.includes(phrase),
			`${id}: ${path} must contain ${phrase}`
		);
	}
});

const sentenceBoundary = /(?<=\.)\s+/;
const whitespace = /\s+/g;

test("no normalized rule sentence occurs twice in compact registered tool text", () => {
	const sentences: string[] = [];
	function add(text: string) {
		for (const sentence of text.split(sentenceBoundary)) {
			const normalized = sentence.toLowerCase().replace(whitespace, " ").trim();
			if (normalized) {
				sentences.push(normalized);
			}
		}
	}
	function visit(node: unknown) {
		if (!node || typeof node !== "object") {
			return;
		}
		const schema = node as {
			description?: string;
			properties?: Record<string, unknown>;
			items?: unknown;
		};
		if (schema.description) {
			add(schema.description);
		}
		for (const child of Object.values(schema.properties ?? {})) {
			visit(child);
		}
		if (schema.items) {
			visit(schema.items);
		}
	}
	const tool = compact.tools[0];
	add(tool.description);
	for (const guideline of tool.promptGuidelines) {
		add(guideline);
	}
	visit(tool.parameters);
	assert.equal(new Set(sentences).size, sentences.length);
});
