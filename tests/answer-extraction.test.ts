import assert from "node:assert/strict";
import test from "node:test";
import {
	collectExtractionBusinessIssues,
	createExtractionContext,
	extractAskParams,
	extractionCandidateFromContent,
	parseExtractionCandidate,
	repairExtractionParams,
	selectExtractionModel,
} from "../src/answer-extraction.ts";

function model(provider: string, id: string) {
	return { provider, id } as never;
}

const validExtraction = {
	questions: [
		{
			id: "direction",
			prompt: "Which direction?",
			options: [
				{ value: "a", label: "A" },
				{ value: "b", label: "B" },
			],
		},
	],
};

function extractionResponse(stopReason: "deferred" | "toolUse") {
	return {
		stopReason,
		content: [
			{
				type: "toolCall",
				id: "call-1",
				name: "ask_user",
				arguments: validExtraction,
			},
		],
	} as never;
}

test("deferred extraction is retried before accepting a valid tool call", async () => {
	let calls = 0;
	const retries: number[] = [];
	const params = await extractAskParams({
		assistantText: "Which direction: A or B?",
		model: model("fake", "extractor"),
		complete: () => {
			calls++;
			return Promise.resolve(
				extractionResponse(calls === 1 ? "deferred" : "toolUse")
			);
		},
		retries: 1,
		timeoutMs: 1000,
		onRetry: (attempt) => retries.push(attempt),
	});

	assert.deepEqual(params, validExtraction);
	assert.equal(calls, 2);
	assert.deepEqual(retries, [1]);
});

test("repeated deferred extraction reaches the existing failure path", async () => {
	let calls = 0;
	const retries: number[] = [];
	await assert.rejects(
		extractAskParams({
			assistantText: "Which direction: A or B?",
			model: model("fake", "extractor"),
			complete: () => {
				calls++;
				return Promise.resolve(extractionResponse("deferred"));
			},
			retries: 2,
			timeoutMs: 1000,
			onRetry: (attempt) => retries.push(attempt),
		}),
		{
			message:
				"Question extraction did not return a valid ask_user tool call or JSON fallback after retries.",
		}
	);
	assert.equal(calls, 3);
	assert.deepEqual(retries, [1, 2]);
});

test("selectExtractionModel uses first configured model with auth", async () => {
	const first = model("missing", "a");
	const second = model("ok", "b");
	const result = await selectExtractionModel(
		{
			model: model("fallback", "c"),
			scopedModels: [],
			modelRegistry: {
				find(provider: string, _id: string) {
					if (provider === "missing") {
						return first;
					}
					if (provider === "ok") {
						return second;
					}
				},
				getApiKeyAndHeaders(candidate: { provider: string }) {
					if (candidate.provider === "ok") {
						return Promise.resolve({ ok: true, apiKey: "key" });
					}
					return Promise.resolve({ ok: false, error: "no" });
				},
			},
		} as never,
		[
			{ provider: "missing", id: "a" },
			{ provider: "ok", id: "b" },
		]
	);

	assert.deepEqual(result, {
		model: second,
		usedFallback: false,
	});
});

test("selectExtractionModel respects the current session model scope", async () => {
	const configured = model("configured", "a");
	const fallback = model("fallback", "b");
	const result = await selectExtractionModel(
		{
			model: fallback,
			scopedModels: [{ model: fallback }],
			modelRegistry: {
				find() {
					return configured;
				},
				getApiKeyAndHeaders() {
					return Promise.resolve({ ok: true, apiKey: "key" });
				},
			},
		} as never,
		[{ provider: "configured", id: "a" }]
	);

	assert.deepEqual(result, {
		model: fallback,
		usedFallback: true,
	});
});

test("selectExtractionModel rejects a fallback outside the current session scope", async () => {
	const fallback = model("fallback", "a");
	const result = await selectExtractionModel(
		{
			model: fallback,
			scopedModels: [{ model: model("allowed", "b") }],
			modelRegistry: {
				find() {
					return;
				},
			},
		} as never,
		[]
	);

	assert.deepEqual(result, {
		error: "No available extraction model in the current session model scope.",
	});
});

test("extraction business rules flag option spam", () => {
	const issues = collectExtractionBusinessIssues({
		questions: [
			{
				id: "q",
				prompt: "Pick one",
				options: [
					{ value: "a", label: "A" },
					{ value: "b", label: "B" },
					{ value: "c", label: "C" },
					{ value: "d", label: "D" },
					{ value: "e", label: "E" },
				],
			},
		],
	});

	assert.deepEqual(issues, ["questions[0].options has 5 items; max is 4"]);
});

test("repairExtractionParams caps options while preserving other", () => {
	const repaired = repairExtractionParams({
		questions: [
			{
				id: "q",
				prompt: "Pick one",
				options: [
					{ value: "a", label: "A" },
					{ value: "b", label: "B" },
					{ value: "c", label: "C" },
					{ value: "d", label: "D" },
					{ value: "other", label: "Other" },
				],
			},
		],
	});

	assert.deepEqual(
		repaired.questions[0]?.options.map((option) => option.value),
		["a", "b", "c", "other"]
	);
});

test("repairExtractionParams drops generic conversational prompts", () => {
	const repaired = repairExtractionParams({
		questions: [
			{
				id: "generic",
				prompt: "How can I help you today?",
				options: [{ value: "help", label: "Help me" }],
			},
		],
	});

	assert.deepEqual(repaired.questions, []);
});

test("selectExtractionModel validates fallback model auth", async () => {
	const fallback = model("fallback", "c");
	const result = await selectExtractionModel(
		{
			model: fallback,
			scopedModels: [],
			modelRegistry: {
				find() {
					return;
				},
				getApiKeyAndHeaders() {
					return Promise.resolve({ ok: false, error: "no auth" });
				},
			},
		} as never,
		[]
	);

	assert.deepEqual(result, {
		error: "No auth for fallback chat model: fallback/c.",
	});
});

test("extraction context includes the tool and preceding turn", () => {
	const context = createExtractionContext({
		assistantText: "Which direction: A or B?",
		attempt: 0,
		lastError: "",
		lastResponse: "",
		previousUserText: "Choose an implementation direction.",
	});

	assert.equal(context.tools?.[0]?.name, "ask_user");
	assert.equal(context.tools?.length, 1);
	assert.equal(
		(context.systemPrompt ?? "").includes("Never add recommendation metadata."),
		true
	);
	const prompt = JSON.stringify(context.messages[0]?.content);
	assert.equal(prompt.includes("Choose an implementation direction."), true);
	assert.equal(prompt.includes("Which direction: A or B?"), true);
});

test("tool-call arguments become the extraction candidate", () => {
	const candidate = extractionCandidateFromContent([
		{ type: "thinking", thinking: "ignored" },
		{
			type: "toolCall",
			id: "call-1",
			name: "ask_user",
			arguments: {
				title: "Direction",
				questions: [
					{
						id: "direction",
						prompt: "Which direction?",
						options: [{ value: "a", label: "A" }],
					},
				],
			},
		},
	] as never);
	const result = parseExtractionCandidate(candidate);

	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.params.title, "Direction");
	}
});

test("tool-call arguments take precedence over text", () => {
	const candidate = extractionCandidateFromContent([
		{ type: "text", text: "not JSON" },
		{
			type: "toolCall",
			id: "call-1",
			name: "ask_user",
			arguments: { questions: [] },
		},
	] as never);

	assert.equal(parseExtractionCandidate(candidate).ok, true);
});

test("multiple tool calls are rejected", () => {
	const candidate = extractionCandidateFromContent([
		{
			type: "toolCall",
			id: "call-1",
			name: "ask_user",
			arguments: { questions: [] },
		},
		{
			type: "toolCall",
			id: "call-2",
			name: "ask_user",
			arguments: { questions: [] },
		},
	] as never);

	assert.equal(parseExtractionCandidate(candidate).ok, false);
});

test("fenced text remains a fallback", () => {
	const result = parseExtractionCandidate('```json\n{"questions":[]}\n```');
	assert.equal(result.ok, true);
});

test("semantic validation issues are returned for retry feedback", () => {
	const result = parseExtractionCandidate(
		JSON.stringify({
			questions: [
				{
					id: "duplicate",
					prompt: "First?",
					options: [{ value: "a", label: "A" }],
				},
				{
					id: "duplicate",
					prompt: "Second?",
					options: [{ value: "b", label: "B" }],
				},
			],
		})
	);

	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(
			result.issues.some((issue) => issue.includes("duplicate")),
			true
		);
	}
});
