import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import { createInitialState } from "../src/state/create.ts";
import { renderAskScreen } from "../src/ui/render.ts";

function mockEditor() {
	return {
		getText() {
			return "";
		},
		render() {
			return [];
		},
	} as never;
}

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

test("wide header shows question progress and text tabs without overflow markers", () => {
	const state = createInitialState({
		title: "Demo",
		questions: [
			{
				id: "q1",
				label: "One",
				prompt: "One",
				options: [{ value: "a", label: "A" }],
			},
			{
				id: "q2",
				label: "Two",
				prompt: "Two",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme: plainTheme(),
		width: 120,
		editor: mockEditor(),
	});

	assert.equal(lines[1], ` Demo${" ".repeat(120 - 5 - 15)}Question 1 of 2`);
	assert.equal(lines[3], " One   Two  │ Review 0/2 ");
});

test("narrow tab strip keeps active middle tab visible", () => {
	const state = createInitialState({
		title: "Demo",
		questions: [
			{
				id: "q1",
				label: "One",
				prompt: "One",
				options: [{ value: "a", label: "A" }],
			},
			{
				id: "q2",
				label: "Two",
				prompt: "Two",
				options: [{ value: "a", label: "A" }],
			},
			{
				id: "q3",
				label: "Three",
				prompt: "Three",
				options: [{ value: "a", label: "A" }],
			},
			{
				id: "q4",
				label: "Four",
				prompt: "Four",
				options: [{ value: "a", label: "A" }],
			},
			{
				id: "q5",
				label: "Five",
				prompt: "Five",
				options: [{ value: "a", label: "A" }],
			},
		],
	});
	state.activeTabIndex = 2;

	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme: plainTheme(),
		width: 28,
		editor: mockEditor(),
	});

	assert.equal(lines[1]?.endsWith("Question 3 of 5"), true);
	assert.equal(lines[3]?.includes("Three"), true);
	assert.equal(lines[3]?.includes("One"), false);
	assert.equal(lines[3]?.includes("›"), true);
	assert.equal(lines[3]?.includes("‹"), true);
});

test("narrow tab strip keeps submit tab visible when active", () => {
	const state = createInitialState({
		title: "Demo",
		questions: [
			{
				id: "q1",
				label: "One",
				prompt: "One",
				options: [{ value: "a", label: "A" }],
			},
			{
				id: "q2",
				label: "Two",
				prompt: "Two",
				options: [{ value: "a", label: "A" }],
			},
			{
				id: "q3",
				label: "Three",
				prompt: "Three",
				options: [{ value: "a", label: "A" }],
			},
		],
	});
	state.activeTabIndex = state.questions.length;
	state.view = { kind: "submit" };

	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme: plainTheme(),
		width: 24,
		editor: mockEditor(),
	});

	assert.equal(lines[1]?.endsWith("Review"), true);
	assert.equal(lines[3]?.includes("Review 0/3"), true);
	assert.equal(lines[3]?.includes("Three"), false);
	assert.equal(lines[3]?.includes("›"), false);
});

test("tab window stays within narrow widths and marks only hidden sides", () => {
	const state = createInitialState({
		title: "Demo",
		questions: ["One", "Two", "Three", "Four", "Five"].map((label) => ({
			id: label,
			label,
			prompt: label,
			options: [{ value: "a", label: "A" }],
		})),
	});
	for (const width of [24, 28, 29, 30, 31, 32, 60]) {
		state.activeTabIndex = 2;
		const lines = renderAskScreen({
			config: DEFAULT_ASK_CONFIG,
			state,
			theme: plainTheme(),
			width,
			editor: mockEditor(),
		});
		assert.equal(lines[3]?.includes("Three"), true);
		assert.ok((lines[3]?.length ?? 0) <= width);
		if (width === 60) {
			assert.equal(lines[3], " One   Two   Three   Four   Five  │ Review 0/5 ");
		}
	}
});

test("answered tabs and review count follow committed answers", () => {
	const state = createInitialState({
		title: "Demo",
		questions: ["One", "Two"].map((label) => ({
			id: label,
			label,
			prompt: label,
			options: [{ value: "a", label: "A" }],
		})),
	});
	state.answers.One = { selected: [{ index: 1, label: "A", value: "a" }] };
	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme: plainTheme(),
		width: 80,
		editor: mockEditor(),
	});
	assert.equal(lines[3], " One ✓   Two  │ Review 1/2 ");
	state.activeTabIndex = 2;
	state.view = { kind: "submit" };
	const review = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme: plainTheme(),
		width: 80,
		editor: mockEditor(),
	});
	assert.equal(review[1]?.endsWith("Review"), true);
	assert.equal(review[3], " One ✓   Two  │ Review 1/2 ");
});

test("long titles leave the question counter visible", () => {
	const state = createInitialState({
		title: "A very long project name that fills the header",
		questions: [
			{
				id: "q1",
				prompt: "Pick",
				options: [{ value: "a", label: "A" }],
			},
		],
	});
	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme: plainTheme(),
		width: 30,
		editor: mockEditor(),
	});
	assert.equal(lines[1]?.endsWith("Question 1 of 1"), true);
	assert.ok(visibleWidth(lines[1] ?? "") <= 30);
});

test("only the active tab gets a filled background", () => {
	const state = createInitialState({
		title: "Demo",
		questions: ["One", "Two"].map((label) => ({
			id: label,
			label,
			prompt: label,
			options: [{ value: "a", label: "A" }],
		})),
	});
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return `{${text}}`;
		},
	} as never;
	const question = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme,
		width: 80,
		editor: mockEditor(),
	});
	assert.equal(question[3], "{ One }  Two  │ Review 0/2 ");
	state.activeTabIndex = 2;
	state.view = { kind: "submit" };
	const review = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme,
		width: 80,
		editor: mockEditor(),
	});
	assert.equal(review[3], " One   Two  {│ Review 0/2 }");
});

test("footer hints wrap into exact lines on narrow screens", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Features",
				prompt: "Pick features",
				type: "multi",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme: plainTheme(),
		width: 26,
		editor: mockEditor(),
	});

	assert.deepEqual(lines.slice(-7, -1), [
		" ↑↓ move",
		" Space/1-9 toggle",
		" Tab question",
		" Enter continue",
		" N/Shift+N note · T type",
		" Esc dismiss · ? settings",
	]);
});

test("footer keeps earlier hint chunk on the first wrapped line", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "One",
				prompt: "One",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme: plainTheme(),
		width: 22,
		editor: mockEditor(),
	});

	assert.deepEqual(lines.slice(-7, -1), [
		" ↑↓ move · 1-9 pick",
		" Tab question",
		" Enter confirm",
		" N/Shift+N note",
		" T type · Esc dismiss",
		" ? settings",
	]);
});

test("footer hints can be hidden without affecting frame rendering", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "One",
				prompt: "One",
				options: [{ value: "a", label: "A" }],
			},
		],
	});
	const config = {
		...DEFAULT_ASK_CONFIG,
		behaviour: {
			...DEFAULT_ASK_CONFIG.behaviour,
			showFooterHints: false,
		},
	};

	const lines = renderAskScreen({
		config,
		state,
		theme: plainTheme(),
		width: 22,
		editor: mockEditor(),
	});

	assert.equal(lines.at(-1), "──────────────────────");
	assert.equal(lines.join("\n").includes("? settings"), false);
	assert.equal(lines.join("\n").includes("Enter confirm"), false);
});
