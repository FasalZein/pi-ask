import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { UI_TEXT } from "../constants/ui.ts";
import type { AskState } from "../types.ts";
import {
	fitPageHint,
	pushSavedNote,
	pushWrappedText,
} from "./render-helpers.ts";
import type { Theme } from "./render-types.ts";
import {
	buildReviewScreenModel,
	type ReviewQuestionModel,
	type ReviewScreenModel,
} from "./view-models/review.ts";

/** Scroll state for the review answers on short terminals. */
interface ReviewWindow {
	mouseReview?: { start: number; end: number; maxTop: number };
	reviewPageRows: number;
	reviewScrollTop: number;
}
type RowCallback = (index: number, start: number, end: number) => void;
interface PageKeys {
	down: string;
	up: string;
}
interface ReviewColumn {
	/** Row range of the scrollable answers inside the column, if they scroll. */
	answers?: { start: number; end: number; maxTop: number };
	lines: string[];
}

// Rows for the "more above" and "more below" indicators.
const INDICATOR_ROWS = 2;
const ACTION_SEPARATOR = " │ ";
// Both indicators and at least one answer row.
const MIN_REVIEW_ROWS = 3;
const BLOCK_INDENT = "    ";
const ANSWER_INDENT = "      ";

export function renderSubmitScreen(
	lines: string[],
	state: AskState,
	theme: Theme,
	width: number,
	reviewShortcutHint?: string,
	onActionRow?: RowCallback,
	reviewWindow?: ReviewWindow,
	availableRows = Number.POSITIVE_INFINITY,
	pageKeys: PageKeys = { up: "Shift+↑", down: "Shift+↓" }
) {
	const model = buildReviewScreenModel(state);
	const hintLines = renderReviewShortcutHint(reviewShortcutHint, theme, width);
	const offset = lines.length;
	const actionLines = renderActionBar(model, theme, width);
	lines.push(...actionLines);
	reportActionRows(model, actionLines.length, offset, onActionRow);
	let room = availableRows - actionLines.length - hintLines.length;
	// On very short terminals, the hint's leading blank goes to the answers.
	if (reviewWindow && room < MIN_REVIEW_ROWS && hintLines[0] === "") {
		hintLines.shift();
		room++;
	}
	const review = renderReviewAnswers(
		model,
		theme,
		width,
		room,
		reviewWindow,
		pageKeys
	);
	reportReviewRegion(reviewWindow, review, lines.length);
	lines.push(...review.lines, ...hintLines);
}

function reportActionRows(
	model: ReviewScreenModel,
	rows: number,
	offset: number,
	onActionRow?: RowCallback
) {
	// One bar row holds all actions; a narrow fallback gives each action a row.
	for (const index of model.actions.keys()) {
		const row = rows === 1 ? 0 : index;
		onActionRow?.(index, offset + row, offset + row + 1);
	}
}

function reportReviewRegion(
	reviewWindow: ReviewWindow | undefined,
	review: ReviewColumn,
	offset: number
) {
	if (reviewWindow && review.answers) {
		reviewWindow.mouseReview = {
			start: offset + review.answers.start,
			end: offset + review.answers.end,
			maxTop: review.answers.maxTop,
		};
	}
}

/** Answers under the action bar; the blank separator row doubles as the "above" indicator. */
function renderReviewAnswers(
	model: ReviewScreenModel,
	theme: Theme,
	width: number,
	maxRows: number,
	reviewWindow: ReviewWindow | undefined,
	pageKeys: PageKeys
): ReviewColumn {
	const answers: string[] = [];
	const starts: number[] = [];
	for (const [index, question] of model.questions.entries()) {
		starts.push(answers.length);
		renderReviewQuestion(answers, question, index, theme, width);
		if (index < model.questions.length - 1) {
			answers.push("");
		}
	}

	if (!reviewWindow || 1 + answers.length <= maxRows) {
		if (reviewWindow) {
			reviewWindow.reviewScrollTop = 0;
			reviewWindow.reviewPageRows = answers.length;
		}
		return { lines: ["", ...answers] };
	}

	const indicators = maxRows >= MIN_REVIEW_ROWS;
	const rows = Math.max(1, maxRows - (indicators ? INDICATOR_ROWS : 0));
	const maxTop = Math.max(0, answers.length - rows);
	const top = Math.max(0, Math.min(reviewWindow.reviewScrollTop, maxTop));
	reviewWindow.reviewScrollTop = top;
	reviewWindow.reviewPageRows = rows;
	const above = starts.filter((start) => start < top).length;
	const below = starts.filter((start) => start >= top + rows).length;
	const indicator = (full: string, compact: string) =>
		indicators ? [theme.fg("dim", fitPageHint(full, compact, width))] : [];
	const start = indicators ? 1 : 0;
	return {
		answers: { start, end: start + rows, maxTop },
		lines: [
			...indicator(
				above ? ` ↑ ${above} more above · ${pageKeys.up}` : "",
				`↑ ${above} more`
			),
			...answers.slice(top, top + rows),
			...indicator(
				below ? ` ↓ ${below} more below · ${pageKeys.down}` : "",
				`↓ ${below} more`
			),
		],
	};
}

function renderReviewQuestion(
	lines: string[],
	question: ReviewQuestionModel,
	index: number,
	theme: Theme,
	width: number
) {
	pushWrappedText(
		lines,
		question.label,
		width,
		theme,
		"accent",
		` ${theme.fg("dim", `${index + 1}.`)} `,
		BLOCK_INDENT
	);
	// A note-only question stays unanswered, but Elaborate still shows its note.
	if (question.note) {
		pushSavedNote({
			lines,
			note: question.note,
			width,
			theme,
			indent: BLOCK_INDENT,
		});
	}
	if (question.unanswered) {
		lines.push(
			truncateToWidth(
				`${BLOCK_INDENT}${theme.fg("warning", UI_TEXT.unanswered)}`,
				width
			)
		);
		return;
	}

	for (const selection of question.selections ?? []) {
		pushWrappedText(
			lines,
			`→ ${selection.label}`,
			width,
			theme,
			"success",
			BLOCK_INDENT,
			ANSWER_INDENT
		);
		if (selection.note) {
			pushSavedNote({
				lines,
				note: selection.note,
				width,
				theme,
				indent: ANSWER_INDENT,
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
			BLOCK_INDENT,
			ANSWER_INDENT
		);
	}

	for (const optionNote of question.extraOptionNotes ?? []) {
		pushSavedNote({
			lines,
			note: optionNote.note,
			width,
			theme,
			indent: ANSWER_INDENT,
			label: optionNote.label,
		});
	}
}

function renderActionBar(
	model: ReviewScreenModel,
	theme: Theme,
	width: number
): string[] {
	const items = model.actions.map(({ label, selected }, index) => {
		const text = ` ${index + 1} ${label} `;
		return selected
			? theme.bg("selectedBg", theme.fg("accent", text))
			: theme.fg("muted", text);
	});
	const bar = ` ${items.join(theme.fg("dim", ACTION_SEPARATOR))}`;
	// Too narrow for one row: one action per row, same styling.
	if (visibleWidth(bar) > width) {
		return items.map((item) => truncateToWidth(` ${item}`, width));
	}
	return [bar];
}

function renderReviewShortcutHint(
	hint: string | undefined,
	theme: Theme,
	width: number
): string[] {
	const lines: string[] = [];
	if (hint) {
		lines.push("");
		pushWrappedText(lines, hint, width, theme, "dim", " ", " ");
	}
	return lines;
}
