export const UI_DIMENSIONS = {
	boxMinWidth: 10,
	boxPadding: 1,
	callLabelTruncateWidth: 50,
	editorBarPadding: 2,
	editorMinWidth: 8,
	// Keeps editor bars and the preview box off the last column; some terminals extend its color into the padding.
	contentRightMargin: 1,
	previewWideMinWidth: 90,
	previewMinRightWidth: 24,
	previewLeftMinWidth: 22,
	previewLeftMaxWidth: 34,
	previewLeftRatio: 0.34,
} as const;

export const UI_TEXT = {
	// One focus pointer for option rows and review actions; unfocused rows pad to the same width.
	cursor: " ▶ ",
	cursorBlank: "   ",
	recommendedMarker: "(recommended)",
	questionNoteTitle: "Note:",
	unanswered: "unanswered",
	editorPlaceholderInput: "Type your answer",
	editorPlaceholderNote: "Add a note",
} as const;
