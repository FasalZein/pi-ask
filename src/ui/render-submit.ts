import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { wrapText } from "../text.ts";
import type { AskState } from "../types.ts";
import { pushSavedNote, pushWrappedText } from "./render-helpers.ts";
import type { Theme } from "./render-types.ts";
import {
	buildReviewScreenModel,
	type ReviewQuestionModel,
} from "./view-models/review.ts";

interface ReviewWindow {
	followFocus?: boolean;
	mouseReview?: { start: number; end: number; maxTop: number };
	reviewPageRows: number;
	reviewScrollTop: number;
}
type RowCallback = (index: number, start: number, end: number) => void;
interface ReviewLines {
	ends: number[];
	lines: string[];
	starts: number[];
}

export function renderSubmitScreen(
	lines: string[],
	state: AskState,
	theme: Theme,
	width: number,
	reviewShortcutHint?: string,
	onActionRow?: RowCallback,
	onReviewRow?: RowCallback,
	reviewWindow?: ReviewWindow,
	availableRows = 24,
	pageKeys = { up: "Shift+↑", down: "Shift+↓" },
	focusedRow?: number
) {
	const model = buildReviewScreenModel(state);
	const answered = model.questions.filter(
		(question) => !question.unanswered
	).length;
	lines.push(
		theme.fg(
			"accent",
			` Review · ${answered} of ${model.questions.length} answered`
		)
	);
	lines.push("");
	const review = renderReviewRows(model.questions, theme, width, focusedRow);
	const actionLines: string[] = [];
	const actionRows: Array<{ start: number; end: number }> = [];
	renderReviewActions(
		actionLines,
		model.actions,
		theme,
		width,
		focusedRow,
		(index, start, end) => {
			actionRows[index] = { start, end };
		}
	);
	const hintLines: string[] = [];
	appendReviewHint(hintLines, reviewShortcutHint, theme, width);
	let room =
		availableRows - lines.length - actionLines.length - hintLines.length;
	if (room <= 3 && hintLines[0] === "") {
		hintLines.shift();
		room++;
	}
	if (room <= 3) {
		lines.pop();
		room++;
	}
	const separator = room > 3;
	const reviewStart = lines.length;
	const windowed = windowReviewRows(
		review,
		theme,
		reviewWindow,
		room - (separator ? 1 : 0),
		pageKeys,
		focusedRow
	);
	if (reviewWindow) {
		reviewWindow.mouseReview = {
			start: reviewStart,
			end: reviewStart + windowed.lines.length,
			maxTop: Math.max(0, review.lines.length - windowed.pageSize),
		};
	}
	reportVisibleRows(review, windowed, lines.length, onReviewRow);
	lines.push(...windowed.lines);
	if (separator) {
		lines.push("");
	}
	const actionOffset = lines.length;
	lines.push(...actionLines, ...hintLines);
	for (const [index, row] of actionRows.entries()) {
		onActionRow?.(index, actionOffset + row.start, actionOffset + row.end);
	}
}

function reportVisibleRows(
	review: ReviewLines,
	windowed: ReturnType<typeof windowReviewRows>,
	offset: number,
	onReviewRow?: RowCallback
) {
	const rowOffset = offset + (windowed.indicators ? 1 : 0);
	for (const [index, start] of review.starts.entries()) {
		if (start >= windowed.top && start < windowed.top + windowed.pageSize) {
			onReviewRow?.(
				index,
				rowOffset + start - windowed.top,
				rowOffset + review.ends[index] - windowed.top
			);
		}
	}
}

function renderReviewActions(
	lines: string[],
	actions: ReturnType<typeof buildReviewScreenModel>["actions"],
	theme: Theme,
	width: number,
	focusedRow?: number,
	onActionRow?: RowCallback
) {
	for (const [index, action] of actions.entries()) {
		const start = lines.length;
		const selected = focusedRow === undefined && action.selected;
		const prefix = selected ? " ▶ " : "   ";
		pushWrappedText(
			lines,
			`${index + 1}. ${action.label}`,
			width,
			theme,
			selected ? "accent" : "text",
			prefix,
			prefix
		);
		onActionRow?.(index, start, lines.length);
	}
}

function appendReviewHint(
	lines: string[],
	hint: string | undefined,
	theme: Theme,
	width: number
) {
	if (hint) {
		lines.push("");
		pushWrappedText(lines, hint, width, theme, "dim", " ", " ");
	}
}

function renderReviewRows(
	questions: ReviewQuestionModel[],
	theme: Theme,
	width: number,
	focusedRow?: number
): ReviewLines {
	const labelsWidth = Math.min(
		Math.max(0, width - 18),
		Math.max(...questions.map((question) => visibleWidth(question.label)))
	);
	const lines: string[] = [];
	const starts: number[] = [];
	const ends: number[] = [];
	for (const [index, question] of questions.entries()) {
		starts.push(lines.length);
		renderReviewRow(
			lines,
			question,
			theme,
			width,
			labelsWidth,
			focusedRow === index
		);
		ends.push(lines.length);
	}
	return { lines, starts, ends };
}

function renderReviewRow(
	lines: string[],
	question: ReviewQuestionModel,
	theme: Theme,
	width: number,
	labelsWidth: number,
	focused: boolean
) {
	const status = question.unanswered ? "–" : "✓";
	const answer = getReviewAnswerText(question);
	const prefix = focused ? " ▶ " : "   ";
	const label = truncateToWidth(question.label, labelsWidth);
	const labelPrefix = `${prefix}${status} ${label}${" ".repeat(labelsWidth - visibleWidth(label) + 2)}`;
	const color = focused ? "accent" : getReviewRowColor(question);
	const wrapped = wrapText(
		answer,
		Math.max(1, width - visibleWidth(labelPrefix))
	);
	lines.push(
		truncateToWidth(
			`${theme.fg(color, labelPrefix)}${theme.fg(color, wrapped[0] ?? "")}`,
			width
		)
	);
	const indent = `   ${" ".repeat(labelsWidth + 3)}`;
	for (const line of wrapped.slice(1)) {
		lines.push(truncateToWidth(`${indent}${theme.fg(color, line)}`, width));
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
		if (selection.note) {
			pushSavedNote({
				lines,
				note: selection.note,
				width,
				theme,
				indent: "     ",
				label: selection.label,
			});
		}
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

function getReviewRowColor(question: ReviewQuestionModel): "dim" | "text" {
	return question.unanswered ? "dim" : "text";
}

function getReviewAnswerText(question: ReviewQuestionModel): string {
	if (question.unanswered) {
		return "not answered";
	}
	return (
		question.answerText ??
		question.selections?.map((selection) => selection.label).join(", ") ??
		"not answered"
	);
}

function windowReviewRows(
	review: ReviewLines,
	theme: Theme,
	window: ReviewWindow | undefined,
	availableRows: number,
	pageKeys: { up: string; down: string },
	focusedRow?: number
): { lines: string[]; top: number; pageSize: number; indicators: boolean } {
	if (!window) {
		return {
			lines: review.lines,
			top: 0,
			pageSize: review.lines.length,
			indicators: false,
		};
	}
	const available = Math.max(1, availableRows);
	const indicators = available >= 3;
	const pageSize = Math.max(1, available - (indicators ? 2 : 0));
	window.reviewPageRows = pageSize;
	if (review.lines.length <= available) {
		window.reviewScrollTop = 0;
		return {
			lines: review.lines,
			top: 0,
			pageSize: review.lines.length,
			indicators: false,
		};
	}
	const top = getReviewWindowTop(
		review,
		window.reviewScrollTop,
		pageSize,
		window.followFocus === false ? undefined : focusedRow
	);
	window.reviewScrollTop = top;
	const above = review.starts.filter((start) => start < top).length;
	const below = review.starts.filter((start) => start >= top + pageSize).length;
	return {
		lines: [
			...(indicators
				? [
						theme.fg(
							"dim",
							above ? ` ↑ ${above} more rows above · ${pageKeys.up}` : ""
						),
					]
				: []),
			...review.lines.slice(top, top + pageSize),
			...(indicators
				? [
						theme.fg(
							"dim",
							below ? ` ↓ ${below} more rows below · ${pageKeys.down}` : ""
						),
					]
				: []),
		],
		top,
		pageSize,
		indicators,
	};
}

function getReviewWindowTop(
	review: ReviewLines,
	scrollTop: number,
	pageSize: number,
	focusedRow?: number
): number {
	const maxTop = review.lines.length - pageSize;
	let top = Math.max(0, Math.min(scrollTop, maxTop));
	if (focusedRow === undefined) {
		return top;
	}
	const start = review.starts[focusedRow];
	const end = review.ends[focusedRow];
	if (end - start > pageSize || start < top) {
		top = start;
	} else if (end > top + pageSize) {
		top = Math.min(maxTop, end - pageSize);
	}
	return top;
}
