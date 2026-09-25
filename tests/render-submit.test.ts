import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "../src/state/create.ts";
import {
	applyNumberShortcut,
	enterOptionNoteMode,
	enterQuestionNoteMode,
	saveNote,
} from "../src/state/transitions.ts";
import { renderSubmitScreen } from "../src/ui/render-submit.ts";

function plainTheme() {
	return {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	} as never;
}

test("review lists aligned answers before actions at wide and narrow widths", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Storage",
				prompt: "Storage?",
				options: [{ value: "pg", label: "PostgreSQL" }],
			},
			{
				id: "q2",
				label: "Name",
				prompt: "Name?",
				options: [{ value: "app", label: "App" }],
			},
		],
	});
	state = applyNumberShortcut(state, 1);
	for (const width of [48, 80, 140]) {
		const lines: string[] = [];
		renderSubmitScreen(lines, state, plainTheme(), width);
		assert.deepEqual(lines, [
			" Review · 1 of 2 answered",
			"",
			"   ✓ Storage  PostgreSQL",
			"   – Name     not answered",
			"",
			" ▶ 1. Submit",
			"   2. Elaborate",
			"   3. Cancel",
		]);
	}
});

test("focused review row is marked and actions lose their focus marker", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Color",
				prompt: "Color?",
				options: [{ value: "blue", label: "Blue" }],
			},
		],
	});
	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		80,
		undefined,
		undefined,
		undefined,
		undefined,
		24,
		{ up: "Shift+↑", down: "Shift+↓" },
		0
	);
	assert.equal(lines[2], " ▶ – Color  not answered");
	assert.equal(lines[4], "   1. Submit");
});

test("submit screen can show a review shortcut hint below the actions", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Color",
				prompt: "Pick one color.",
				options: [{ value: "blue", label: "Blue" }],
			},
		],
	});

	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		50,
		"Press 1, 2, or 3 twice to confirm a review action."
	);

	assert.equal(
		lines.includes(" Press 1, 2, or 3 twice to confirm a review"),
		true
	);
	assert.equal(lines.includes(" action."), true);
});

test("submit screen shows notes only for answered questions in submit mode", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Single",
				prompt: "Pick one primary demo style.",
				options: [{ value: "code", label: "Code demo" }],
			},
			{
				id: "q2",
				label: "Multi",
				prompt: "Pick any extra things to include.",
				options: [{ value: "extra", label: "Extra" }],
			},
		],
	});

	state = enterQuestionNoteMode(state, "q1");
	state = saveNote(state, "Question note");
	state = applyNumberShortcut(state, 1);
	state = enterOptionNoteMode(state, "q1", "code");
	state = saveNote(state, "Option note");
	state = enterQuestionNoteMode(state, "q2");
	state = saveNote(state, "Second note");

	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), 140);

	const text = lines.join("\n");
	assert(text.includes("✓ Single  Code demo"));
	assert(text.includes("Question note"));
	assert(text.includes("Code demo Note: Option note"));
	assert(text.includes("– Multi   not answered"));
	assert(!text.includes("Second note"));
	assert(!text.includes("Pick any extra things to include."));
	const answerIndex = lines.findIndex((line) => line.includes("✓ Single"));
	const questionNoteIndex = lines.findIndex((line) =>
		line.includes("Question note")
	);
	const optionNoteIndex = lines.findIndex((line) =>
		line.includes("Code demo Note: Option note")
	);
	assert(answerIndex < questionNoteIndex);
	assert(questionNoteIndex < optionNoteIndex);
	assert(lines[questionNoteIndex]?.startsWith("     "));
	assert(lines[optionNoteIndex]?.startsWith("     "));
	assert(!text.includes("Pick one primary demo style."));
});

test("submit screen shows all notes when elaborate action is selected", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Single",
				prompt: "Pick one primary demo style.",
				options: [
					{ value: "code", label: "Code demo" },
					{ value: "slides", label: "Slides demo" },
				],
			},
			{
				id: "q2",
				label: "Multi",
				prompt: "Pick any extra things to include.",
				options: [{ value: "extra", label: "Extra" }],
			},
		],
	});

	state = enterQuestionNoteMode(state, "q1");
	state = saveNote(state, "Question note");
	state = applyNumberShortcut(state, 1);
	state = enterOptionNoteMode(state, "q1", "code");
	state = saveNote(state, "Selected option note");
	state = enterOptionNoteMode(state, "q1", "slides");
	state = saveNote(state, "Unselected option note");
	state = enterQuestionNoteMode(state, "q2");
	state = saveNote(state, "Second note");
	state = { ...state, activeSubmitActionIndex: 1 };

	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), 80);

	assert(lines.some((line) => line.includes("Question note")));
	assert(lines.some((line) => line.includes("Selected option note")));
	assert(lines.some((line) => line.includes("Unselected option note")));
	assert(lines.some((line) => line.includes("Slides demo Note:")));
	assert(lines.some((line) => line.includes("Second note")));
});

test("submit screen renders multi-select option notes under their related answers", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Multi",
				prompt: "Pick extras",
				type: "multi",
				options: [
					{ value: "follow-up", label: "Follow-up action" },
					{ value: "docs", label: "Docs demo" },
				],
			},
		],
	});

	state = applyNumberShortcut(state, 1);
	state = applyNumberShortcut(state, 2);
	state = enterOptionNoteMode(state, "q1", "follow-up");
	state = saveNote(state, "First note");
	state = enterOptionNoteMode(state, "q1", "docs");
	state = saveNote(state, "Second note");

	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), 140);

	const text = lines.join("\n");
	assert(text.includes("✓ Multi  Follow-up action, Docs demo"));
	assert(text.includes("Follow-up action Note: First note"));
	const answerIndex = lines.findIndex((line) => line.includes("✓ Multi"));
	const firstNoteIndex = lines.findIndex((line) =>
		line.includes("Follow-up action Note: First note")
	);
	const secondNoteIndex = lines.findIndex((line) =>
		line.includes("Docs demo Note: Second note")
	);
	assert(answerIndex < firstNoteIndex);
	assert(firstNoteIndex < secondNoteIndex);
	assert(lines[firstNoteIndex]?.startsWith("     "));
	assert(lines[secondNoteIndex]?.startsWith("     "));
	assert(text.includes("Docs demo Note: Second note"));
});

test("long answers wrap beneath aligned review row without moving the actions", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Color",
				prompt: "Color?",
				options: [{ value: "blue", label: "A long blue selection" }],
			},
		],
	});
	state = applyNumberShortcut(state, 1);
	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), 28);
	assert.equal(lines[2]?.startsWith("   ✓ Color  A long blue"), true);
	assert.equal(
		lines.some((line) => line.includes("1. Submit")),
		true
	);
});

test("note-only questions remain not answered while Elaborate shows their notes", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Name",
				prompt: "Name?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});
	state = enterQuestionNoteMode(state, "q1");
	state = saveNote(state, "Need examples");
	state = { ...state, activeSubmitActionIndex: 1 };
	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), 80);
	assert.equal(lines[0], " Review · 0 of 1 answered");
	assert.equal(lines[2], "   – Name  not answered");
	assert(lines.join("\n").includes("Need examples"));
});
