import "./fixtures/full-prompt-mode.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	invalidPayloadResponse,
	nonInteractiveResponse,
	successfulResponse,
} from "../src/ask-tool-helpers.ts";
import askExtension from "../src/index.ts";
import { createInitialState } from "../src/state/create.ts";
import { toAskResult } from "../src/state/result.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(
	readFileSync(resolve(root, "tests/fixtures/full-mode-v1.2.0.json"), "utf8")
);
const params = {
	questions: [
		{
			id: "goal",
			label: "Goal",
			prompt: "What should I optimize for?",
			options: [
				{ value: "speed", label: "Speed" },
				{ value: "safety", label: "Safety" },
			],
		},
	],
};

// This test observes registered text and tool responses, not the constants that feed them.
test("full-mode registered text matches upstream v1.2.0", async () => {
	const handlers = new Map<
		string,
		(event: { systemPrompt: string }) => Promise<{ systemPrompt: string }>
	>();
	let tool:
		| {
				description: string;
				promptSnippet: string;
				promptGuidelines: string[];
				parameters: unknown;
		  }
		| undefined;
	askExtension({
		on(
			name: string,
			handler: (event: {
				systemPrompt: string;
			}) => Promise<{ systemPrompt: string }>
		) {
			handlers.set(name, handler);
		},
		registerTool(registered: typeof tool) {
			tool = registered;
		},
		registerShortcut() {
			// Main-editor shortcuts are outside this test seam.
		},
		registerCommand() {
			// Registration is outside the golden-text seam.
		},
		registerEntryRenderer() {
			// Transcript display is outside the model-facing text seam.
		},
		events: {
			on() {
				// Remote events are outside the golden-text seam.
			},
			emit() {
				// No event is emitted during registration.
			},
		},
	} as never);
	assert.ok(tool);
	assert.equal(tool.description, golden.description);
	assert.equal(tool.promptSnippet, golden.promptSnippet);
	assert.deepEqual(tool.promptGuidelines, golden.promptGuidelines);
	assert.equal(JSON.stringify(tool.parameters), golden.parameters);

	const beforeStart = handlers.get("before_agent_start");
	assert.ok(beforeStart);
	const result = await beforeStart({ systemPrompt: "base" });
	const actualSentence = result.systemPrompt.slice("base\n\n".length);
	assert.equal(
		actualSentence.replace(
			resolve(root, "docs/configuration.md"),
			"<CONFIGURATION_DOC_PATH>"
		),
		golden.configSentence
	);
});

test("full-mode result content matches upstream v1.2.0", () => {
	const state = createInitialState(params);
	const base = toAskResult(state);
	const submitted = {
		...base,
		answers: { goal: { values: ["speed"], labels: ["Speed"], indices: [1] } },
	};
	const elaborated = {
		...base,
		mode: "elaborate" as const,
		elaboration: {
			items: [
				{
					target: { kind: "question" as const },
					question: { ...state.questions[0], type: "single" as const },
					note: "Compare tradeoffs",
					answer: submitted.answers.goal,
					answered: true,
				},
			],
			instruction: "",
			nextAction: "clarify_then_reask" as const,
		},
	};
	const results = {
		cancelled: successfulResponse({ ...base, cancelled: true }).content[0].text,
		submitted: successfulResponse(submitted).content[0].text,
		elaborated: successfulResponse(elaborated).content[0].text,
		nonInteractive: nonInteractiveResponse(state).content[0].text,
		invalidPayload: invalidPayloadResponse(params, [
			{ path: "questions[0].id", message: "Question 1: id is required" },
		]).content[0].text,
	};
	for (const [name, actual] of Object.entries(results)) {
		assert.equal(actual, golden.results[name], `${name} model-facing content`);
	}
});
