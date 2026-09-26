import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import { createInitialState } from "../src/state/create.ts";
import { applyNumberShortcut } from "../src/state/transitions.ts";
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
test("wide header keeps all tabs and framing arrows on the tab row", () => {
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

	assert.equal(lines[3], " ←  ☐ One   ☐ Two   ☰ Review  →");
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

	assert.equal(lines[3], " ←  ☐ Three   ☐ Four  →");
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

	assert.equal(lines[3], " ←  ☰ Review  →");
});

test("tab strip avoids truncation at narrow boundary widths", () => {
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

	const expectedByWidth = new Map([
		[28, " ←  ☐ Three   ☐ Four  →"],
		[29, " ←  ☐ Three   ☐ Four  →"],
		[30, " ←  ☐ Three   ☐ Four  →"],
		[31, " ←  ☐ Two   ☐ Three   ☐ Four  →"],
		[32, " ←  ☐ Two   ☐ Three   ☐ Four  →"],
	]);

	for (const [width, expected] of expectedByWidth) {
		const lines = renderAskScreen({
			config: DEFAULT_ASK_CONFIG,
			state,
			theme: plainTheme(),
			width,
			editor: mockEditor(),
		});
		assert.equal(lines[3], expected);
	}
});

// Expected lines match upstream v1.2.0 output for the same state.
test("answered tabs show the checked marker and success color; review stays success", () => {
	let state = createInitialState({
		title: "Demo",
		questions: ["One", "Two"].map((label) => ({
			id: label,
			label,
			prompt: label,
			options: [{ value: "a", label: "A" }],
		})),
	});
	state = applyNumberShortcut(state, 1);
	const theme = {
		fg(color: string, text: string) {
			return `<${color}>${text}</>`;
		},
		bg(color: string, text: string) {
			return `[${color}:${text}]`;
		},
		bold(text: string) {
			return text;
		},
	} as never;
	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme,
		width: 200,
		editor: mockEditor(),
	});
	assert.equal(
		lines[3],
		" <dim>← </><success> ☒ One </> [selectedBg:<text> ☐ Two </>] <success> ☰ Review </><dim> →</>"
	);
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
	assert.equal(question[3], " ← { ☐ One }  ☐ Two   ☰ Review  →");
	state.activeTabIndex = 2;
	state.view = { kind: "submit" };
	const review = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme,
		width: 80,
		editor: mockEditor(),
	});
	assert.equal(review[3], " ←  ☐ One   ☐ Two  { ☰ Review } →");
	assert.equal(review.join("\n").includes("of 2 answered"), false);
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

// Border tokens are part of the pi-native chrome contract.
test("frame rules use pi's border token without recoloring the title", () => {
	const state = createInitialState({
		title: "Demo",
		questions: [
			{ id: "q", prompt: "Pick", options: [{ value: "a", label: "A" }] },
		],
	});
	const calls: [string, string][] = [];
	const theme = {
		fg(color: string, text: string) {
			calls.push([color, text]);
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	} as never;
	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme,
		width: 40,
		editor: mockEditor(),
	});
	assert.equal(lines[0], "─".repeat(40));
	assert.equal(lines.at(-1), "─".repeat(40));
	assert.equal(calls.filter(([, text]) => text === "─".repeat(40)).length, 2);
	assert.ok(
		calls
			.filter(([, text]) => text === "─".repeat(40))
			.every(([color]) => color === "border")
	);
	assert.ok(
		calls.some(([color, text]) => color === "accent" && text.includes("Demo"))
	);
});
