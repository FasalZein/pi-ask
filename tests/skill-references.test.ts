import assert from "node:assert/strict";
import test from "node:test";
import { successfulResponse } from "../src/ask-tool-helpers.ts";
import type { AskResult } from "../src/types.ts";

const commands = [
	{
		name: "skill:tdd",
		source: "skill",
		description: "Test first",
		sourceInfo: { path: "/skills/tdd/SKILL.md" },
	},
	{
		name: "skill:review",
		source: "skill",
		sourceInfo: { path: "/skills/review/SKILL.md" },
	},
	{
		name: "skill:other",
		source: "extension",
		sourceInfo: { path: "/wrong/SKILL.md" },
	},
] as never;

function submitted(note: string, customText = ""): AskResult {
	return {
		cancelled: false,
		mode: "submit",
		questions: [{ id: "q", label: "Goal", prompt: "Choose", type: "single" }],
		answers: {
			q: {
				values: ["custom"],
				labels: [customText || "Speed"],
				indices: [],
				...(customText ? { customText } : {}),
				note,
			},
		},
	};
}

test("submitted notes and custom answers add one pointer per distinct known skill", () => {
	const result = submitted(
		"Use /skill:tdd then /skill:review and /skill:tdd",
		"Follow /skill:review"
	);
	assert.deepEqual(successfulResponse(result, commands), {
		content: [
			{
				type: "text",
				text: "Goal: Follow /skill:review\nGoal note: Use /skill:tdd then /skill:review and /skill:tdd\nRead skill /skill:review: /skills/review/SKILL.md\nRead skill /skill:tdd: /skills/tdd/SKILL.md",
			},
		],
		details: {
			...result,
			resolvedSkills: [
				{ name: "review", path: "/skills/review/SKILL.md" },
				{ name: "tdd", path: "/skills/tdd/SKILL.md" },
			],
		},
	});
});

test("unknown and non-skill tokens leave the result byte-identical", () => {
	for (const note of [
		"No reference",
		"Use /skill:missing",
		"Use /skill:other",
		"url/x/skill:tdd",
	]) {
		const result = submitted(note);
		assert.deepEqual(successfulResponse(result, commands), {
			content: [{ type: "text", text: `Goal: Speed\nGoal note: ${note}` }],
			details: result,
		});
	}
});

test("sentence punctuation does not hide a known skill", () => {
	const response = successfulResponse(
		submitted("Use /skill:tdd. Then compare."),
		commands
	);
	assert.equal(
		response.content[0].text,
		"Goal: Speed\nGoal note: Use /skill:tdd. Then compare.\nRead skill /skill:tdd: /skills/tdd/SKILL.md"
	);
});

test("elaboration notes add skill paths without altering the recorded note", () => {
	const result: AskResult = {
		...submitted(""),
		mode: "elaborate",
		elaboration: {
			instruction: "",
			nextAction: "clarify_then_reask",
			items: [
				{
					target: { kind: "question" },
					question: {
						id: "q",
						label: "Goal",
						prompt: "Choose",
						type: "single",
						options: [],
					},
					answered: false,
					note: "Explain /skill:tdd",
				},
			],
		},
	};
	const response = successfulResponse(result, commands);
	assert.equal(
		response.content[0].text,
		'User asked to elaborate on question "Choose" with note "Explain /skill:tdd"\nFirst answer the user\'s note directly using the question and option context; re-ask only the affected question if a choice is still needed.\nRead skill /skill:tdd: /skills/tdd/SKILL.md'
	);
	assert.deepEqual(response.details.resolvedSkills, [
		{ name: "tdd", path: "/skills/tdd/SKILL.md" },
	]);
	assert.equal(
		response.details.elaboration?.items[0].note,
		"Explain /skill:tdd"
	);
});
