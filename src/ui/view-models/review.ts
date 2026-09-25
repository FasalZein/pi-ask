import { SUBMIT_CHOICES } from "../../constants/text.ts";
import {
	type ReviewAnswer,
	shouldRenderAnswersIndividually,
	toReviewAnswer,
} from "../../state/result.ts";
import type { AskState } from "../../types.ts";

export interface ReviewSelectionModel {
	label: string;
	note?: string;
}

export interface ReviewQuestionModel {
	answerText?: string;
	extraOptionNotes?: Array<{ label: string; note: string }>;
	label: string;
	note?: string;
	selections?: ReviewSelectionModel[];
	unanswered: boolean;
}

export function buildReviewScreenModel(state: AskState) {
	const showAllNotes = state.activeSubmitActionIndex === 1;
	return {
		actions: SUBMIT_CHOICES.map((label, index) => ({
			label,
			selected: index === state.activeSubmitActionIndex,
		})),
		questions: state.questions.map((question) =>
			toReviewQuestionModel(
				question.label,
				toReviewAnswer(question, state.answers[question.id], showAllNotes)
			)
		),
	};
}

function toReviewQuestionModel(
	label: string,
	answer: ReviewAnswer | undefined
): ReviewQuestionModel {
	if (!answer) {
		return { label, unanswered: true };
	}
	return {
		answerText: shouldRenderAnswersIndividually(answer)
			? undefined
			: answer.labels.join(", "),
		extraOptionNotes: answer.extraOptionNotes,
		label,
		note: answer.note,
		selections: shouldRenderAnswersIndividually(answer)
			? answer.labels.map((selectionLabel, index) => ({
					label: selectionLabel,
					note: answer.optionNotes?.[answer.values[index] ?? selectionLabel],
				}))
			: undefined,
		unanswered: answer.values.length === 0 && !answer.customText,
	};
}
