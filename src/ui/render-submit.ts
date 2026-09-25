import { truncateToWidth } from "@earendil-works/pi-tui";
import { UI_TEXT } from "../constants/ui.ts";
import type { AskState } from "../types.ts";
import {
	mergeColumns,
	pushSavedNote,
	pushWrappedText,
} from "./render-helpers.ts";
import type { Theme } from "./render-types.ts";
import { buildReviewScreenModel } from "./view-models/review.ts";

export function renderSubmitScreen(
	lines: string[],
	state: AskState,
	theme: Theme,
	width: number,
	reviewShortcutHint?: string,
	onActionRow?: (index: number, start: number, end: number) => void,
	onReviewRow?: (index: number, start: number, end: number) => void,
	reviewWindow?: { reviewScrollTop: number; reviewPageRows: number },
	availableRows = 24,
	pageKeys = { up: "Shift+↑", down: "Shift+↓" }
) {
	const reviewStarts: number[] = [];
	const trackReview = (index: number, start: number, end: number) => {
		reviewStarts[index] = start;
		onReviewRow?.(index, start, end);
	};
	const height = Math.max(1, availableRows - (reviewShortcutHint ? 2 : 0));
	const model = buildReviewScreenModel(state, width);
	if (model.layout === "wide") {
		const rightWidth = Math.max(1, width - model.actionColumnWidth - 2);
		const reviewLines = renderSubmitReviewLines(
			model,
			theme,
			rightWidth,
			trackReview
		);
		const actionLines = renderSubmitActions(
			model,
			theme,
			model.actionColumnWidth,
			onActionRow
		);
		const visibleReview = windowReviewLines(
			reviewLines,
			reviewStarts,
			reviewWindow,
			height,
			actionLines.length,
			true,
			theme,
			pageKeys
		);
		for (const line of mergeColumns(
			actionLines,
			visibleReview,
			model.actionColumnWidth,
			width
		)) {
			lines.push(line);
		}
		appendReviewShortcutHint(lines, reviewShortcutHint, theme, width);
		return;
	}

	const reviewLines = renderSubmitReviewLines(model, theme, width, trackReview);
	let reviewLength = reviewLines.length;
	const actionLines = renderSubmitActions(
		model,
		theme,
		width,
		(index, start, end) =>
			onActionRow?.(index, reviewLength + 1 + start, reviewLength + 1 + end)
	);
	const visibleReview = windowReviewLines(
		reviewLines,
		reviewStarts,
		reviewWindow,
		height,
		actionLines.length + 1,
		false,
		theme,
		pageKeys
	);
	reviewLength = visibleReview.length;
	lines.push(...visibleReview);
	lines.push("");
	lines.push(...actionLines);
	appendReviewShortcutHint(lines, reviewShortcutHint, theme, width);
}

function windowReviewLines(
	lines: string[],
	starts: number[],
	window: { reviewScrollTop: number; reviewPageRows: number } | undefined,
	height: number,
	actionRows: number,
	wide: boolean,
	theme: Theme,
	pageKeys: { up: string; down: string }
): string[] {
	if (!window) {
		return lines;
	}
	const available = Math.max(1, height - (wide ? 0 : actionRows));
	window.reviewPageRows = Math.max(1, available - 2);
	if (lines.length <= available) {
		window.reviewScrollTop = 0;
		return lines;
	}
	const pageSize = Math.max(1, available - 2);
	const top = Math.max(
		0,
		Math.min(window.reviewScrollTop, lines.length - pageSize)
	);
	window.reviewScrollTop = top;
	const above = starts.filter((start) => start < top).length;
	const below = starts.filter((start) => start >= top + pageSize).length;
	return [
		theme.fg(
			"dim",
			above ? ` ↑ ${above} more rows above · ${pageKeys.up}` : ""
		),
		...lines.slice(top, top + pageSize),
		theme.fg(
			"dim",
			below ? ` ↓ ${below} more rows below · ${pageKeys.down}` : ""
		),
	];
}

function renderSubmitReviewLines(
	model: ReturnType<typeof buildReviewScreenModel>,
	theme: Theme,
	width: number,
	onReviewRow?: (index: number, start: number, end: number) => void
): string[] {
	const lines: string[] = [];
	pushWrappedText(lines, UI_TEXT.reviewTitle, width, theme, "accent", " ", " ");
	lines.push("");

	for (const [index, question] of model.questions.entries()) {
		const start = lines.length;
		renderReviewQuestion(lines, question, theme, width);
		onReviewRow?.(index, start, lines.length);
		if (index < model.questions.length - 1) {
			lines.push("");
		}
	}

	return lines;
}

function renderReviewQuestion(
	lines: string[],
	question: ReturnType<typeof buildReviewScreenModel>["questions"][number],
	theme: Theme,
	width: number
) {
	pushWrappedText(lines, question.label, width, theme, "text", " ", " ");
	if (question.unanswered) {
		lines.push(
			truncateToWidth(`   ${theme.fg("dim", UI_TEXT.unanswered)}`, width)
		);
		return;
	}

	if (question.note) {
		pushSavedNote({
			lines,
			note: question.note,
			width,
			theme,
			indent: "     ",
		});
	}

	for (const selection of question.selections ?? []) {
		pushWrappedText(
			lines,
			`→ ${selection.label}`,
			width,
			theme,
			"success",
			"   ",
			"     "
		);
		if (selection.note) {
			pushSavedNote({
				lines,
				note: selection.note,
				width,
				theme,
				indent: "     ",
			});
		}
	}

	if (question.answerText) {
		pushWrappedText(
			lines,
			`→ ${question.answerText}`,
			width,
			theme,
			question.isCustomOnly ? "text" : "success",
			"   ",
			"     "
		);
	}

	for (const optionNote of question.extraOptionNotes ?? []) {
		pushSavedNote({
			lines,
			note: optionNote.note,
			width,
			theme,
			indent: "     ",
			label: optionNote.label,
		});
	}
}

function renderSubmitActions(
	model: ReturnType<typeof buildReviewScreenModel>,
	theme: Theme,
	width: number,
	onActionRow?: (index: number, start: number, end: number) => void
): string[] {
	const lines: string[] = [];
	for (const [index, action] of model.actions.entries()) {
		const start = lines.length;
		const prefix = action.selected ? "❯ " : "  ";
		pushWrappedText(
			lines,
			`${index + 1}. ${action.label}`,
			width,
			theme,
			action.selected ? "accent" : "text",
			prefix,
			prefix
		);
		onActionRow?.(index, start, lines.length);
	}
	return lines;
}

function appendReviewShortcutHint(
	lines: string[],
	hint: string | undefined,
	theme: Theme,
	width: number
) {
	if (!hint) {
		return;
	}
	lines.push("");
	pushWrappedText(lines, hint, width, theme, "dim", " ", " ");
}
