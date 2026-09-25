import assert from "node:assert/strict";
import test from "node:test";
import { createAskAutocompleteProvider } from "../src/ui/autocomplete.ts";

const SKILL_MENU_ITEM = /skill:tdd/;

test("ask autocomplete explicitly triggers on file mention marker", () => {
	const provider = createAskAutocompleteProvider(process.cwd());

	assert.deepEqual(provider.triggerCharacters, ["@"]);
});

test("ask editor offers pi skill commands after /skill: mid-note and completes at the cursor", async () => {
	const provider = createAskAutocompleteProvider(process.cwd(), [
		{
			name: "skill:tdd",
			description: "Test first",
			source: "skill",
			sourceInfo: {
				path: "/skills/tdd/SKILL.md",
				source: "test",
				scope: "user",
				origin: "top-level",
			},
		},
		{
			name: "skill:other",
			source: "extension",
			sourceInfo: {
				path: "/other",
				source: "test",
				scope: "user",
				origin: "top-level",
			},
		},
	]);
	const lines = ["Please use /skill:td after this"];
	const col = "Please use /skill:td".length;
	const suggestions = await provider.getSuggestions(lines, 0, col, {
		signal: new AbortController().signal,
	});
	assert.deepEqual(suggestions?.items, [
		{ value: "skill:tdd", label: "skill:tdd", description: "Test first" },
	]);
	assert.ok(suggestions);
	assert.deepEqual(
		provider.applyCompletion(
			lines,
			0,
			col,
			suggestions.items[0],
			suggestions.prefix
		),
		{
			lines: ["Please use /skill:tdd after this"],
			cursorLine: 0,
			cursorCol: "Please use /skill:tdd".length,
		}
	);
});

test("skill menu opens after prose and on a later line in the embedded editor", async () => {
	const { SkillReferenceEditor } = await import(
		"../src/ui/skill-reference-editor.ts"
	);
	const identity = (text: string) => text;
	const editor = new SkillReferenceEditor(
		{
			requestRender() {
				/* No screen redraw is needed for the test. */
			},
			terminal: { rows: 40 },
		} as never,
		{
			borderColor: identity,
			selectList: {
				description: identity,
				noMatch: identity,
				scrollInfo: identity,
				selectedPrefix: identity,
				selectedText: identity,
			},
		}
	);
	editor.setAutocompleteProvider(
		createAskAutocompleteProvider(process.cwd(), [
			{
				name: "skill:tdd",
				source: "skill",
				sourceInfo: {
					path: "/skills/tdd/SKILL.md",
					source: "test",
					scope: "user",
					origin: "top-level",
				},
			},
		])
	);
	for (const initial of ["Use ", "First line\nUse "]) {
		editor.setText(initial);
		for (const char of "/skill:") {
			editor.handleInput(char);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.match(editor.render(80).join("\n"), SKILL_MENU_ITEM);
		editor.handleInput("\t");
		assert.equal(editor.getText(), `${initial}/skill:tdd `);
	}
});
