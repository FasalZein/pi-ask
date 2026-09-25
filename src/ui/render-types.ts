import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Editor } from "@earendil-works/pi-tui";
import type {
	getAnswer,
	getCurrentQuestion,
	getRenderableOptions,
} from "../state/selectors.ts";
import type { AskDisplayOption, AskState } from "../types.ts";

export type Theme = ExtensionContext["ui"]["theme"];

export interface QuestionRenderContext {
	editor: Editor;
	lines: string[];
	onOptionRow?: (index: number, start: number, end: number) => void;
	onPreviewBox?: (rows: number) => void;
	onPreviewScrollTop?: (top: number) => void;
	options: ReturnType<typeof getRenderableOptions>;
	previewMaxRows?: number;
	previewScrollHint?: string;
	previewScrollTop?: number;
	question: NonNullable<ReturnType<typeof getCurrentQuestion>>;
	state: AskState;
	theme: Theme;
	width: number;
}

export interface OptionDetailRenderContext {
	answer: ReturnType<typeof getAnswer>;
	editor: Editor;
	lines: string[];
	option: AskDisplayOption | undefined;
	questionId: string;
	selected?: boolean;
	state: AskState;
	theme: Theme;
	width: number;
	withGap?: boolean;
}
