// Run from the repository root: node tests/fixtures/generate-full-mode.mjs
// Reads upstream v1.2.0 at 49482b7, not the working tree.
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const revision = "49482b7";
const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "pi-ask-v1.2.0-"));
const source = (path) =>
	execFileSync("git", ["show", `${revision}:${path}`], {
		cwd: root,
		encoding: "utf8",
	});
try {
	// Materialize the unchanged upstream modules so every expected value is evaluated from v1.2.0.
	const paths = execFileSync(
		"git",
		["ls-tree", "-r", "--name-only", revision, "src"],
		{ cwd: root, encoding: "utf8" }
	)
		.trim()
		.split("\n");
	for (const path of paths) {
		mkdirSync(join(temporary, path, ".."), { recursive: true });
		writeFileSync(join(temporary, path), source(path));
	}
	writeFileSync(join(temporary, "package.json"), '{"type":"module"}');
	symlinkSync(
		resolve(root, "node_modules"),
		join(temporary, "node_modules"),
		"dir"
	);
	const load = (path) => import(pathToFileURL(join(temporary, path)).href);
	const {
		ASK_TOOL_DESCRIPTION,
		ASK_TOOL_PROMPT_GUIDELINES,
		invalidPayloadResponse,
		nonInteractiveResponse,
		successfulResponse,
	} = await load("src/ask-tool-helpers.ts");
	const { AskParamsSchema } = await load("src/schema.ts");
	const { createInitialState } = await load("src/state/create.ts");
	const { toAskResult } = await load("src/state/result.ts");
	const toolSource = source("src/ask-tool.ts");
	const snippet = toolSource.match(/promptSnippet:\s*"([^"]+)"/)[1];
	const configSource = source("src/index.ts");
	const config = configSource
		.match(/const PI_ASK_CONFIG_PROMPT = `([^`]+)`;/)[1]
		.replace(/\$\{CONFIGURATION_DOC_PATH\}/, "<CONFIGURATION_DOC_PATH>");
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
	const state = createInitialState(params);
	const submitted = {
		...toAskResult(state),
		answers: { goal: { values: ["speed"], labels: ["Speed"], indices: [1] } },
	};
	const elaborated = {
		...toAskResult(state),
		mode: "elaborate",
		elaboration: {
			items: [
				{
					target: { kind: "question" },
					question: { ...state.questions[0], type: "single" },
					note: "Compare tradeoffs",
					answer: submitted.answers.goal,
				},
			],
		},
	};
	const cancelled = { ...toAskResult(state), cancelled: true };
	const fixture = {
		description: ASK_TOOL_DESCRIPTION,
		promptSnippet: snippet,
		promptGuidelines: ASK_TOOL_PROMPT_GUIDELINES,
		parameters: JSON.stringify(AskParamsSchema),
		configSentence: config,
		results: {
			cancelled: successfulResponse(cancelled).content[0].text,
			submitted: successfulResponse(submitted).content[0].text,
			elaborated: successfulResponse(elaborated).content[0].text,
			nonInteractive: nonInteractiveResponse(state).content[0].text,
			invalidPayload: invalidPayloadResponse(params, [
				{ path: "questions[0].id", message: "Question 1: id is required" },
			]).content[0].text,
		},
	};
	writeFileSync(
		join(root, "tests/fixtures/full-mode-v1.2.0.json"),
		`${JSON.stringify(fixture, null, 2)}\n`
	);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
