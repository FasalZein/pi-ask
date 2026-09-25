import { accessSync, constants as fsConstants } from "node:fs";
import { delimiter, join } from "node:path";
import {
	type AutocompleteProvider,
	CombinedAutocompleteProvider,
} from "@earendil-works/pi-tui";
import { getSkillCommands, type SkillCommands } from "../skill-references.ts";

export const SKILL_COMPLETION_PREFIX = /(^|\s)(\/skill:[a-zA-Z0-9._-]*)$/;
const WHITESPACE_START = /^\s/;

const FD_BINARY_NAMES =
	process.platform === "win32"
		? ["fd.exe", "fdfind.exe", "fd", "fdfind"]
		: ["fd", "fdfind"];

/**
 * pi resolves fd internally for its main editor, but that resolver is not part of
 * the public extension API. Custom editors therefore need to supply the fd path
 * themselves when reusing CombinedAutocompleteProvider for `@` file mentions.
 */
export function createAskAutocompleteProvider(
	cwd: string,
	commands: SkillCommands = []
): AutocompleteProvider {
	const fileProvider = new CombinedAutocompleteProvider(
		[],
		cwd,
		findAutocompleteBinary(FD_BINARY_NAMES)
	);
	const skillProvider = new CombinedAutocompleteProvider(
		getSkillCommands(commands).map(({ name, description }) => ({
			name,
			description,
		})),
		cwd
	);
	return {
		triggerCharacters: ["@"],
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const before = (lines[cursorLine] ?? "").slice(0, cursorCol);
			const token = SKILL_COMPLETION_PREFIX.exec(before)?.[2];
			if (token) {
				const suggestions = await skillProvider.getSuggestions(
					[token],
					0,
					token.length,
					{ ...options, force: false }
				);
				return suggestions ? { ...suggestions, prefix: token } : null;
			}
			return fileProvider.getSuggestions(lines, cursorLine, cursorCol, options);
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			if (!prefix.startsWith("/skill:")) {
				return fileProvider.applyCompletion(
					lines,
					cursorLine,
					cursorCol,
					item,
					prefix
				);
			}
			const line = lines[cursorLine] ?? "";
			const after = line.slice(cursorCol);
			const insertion = `/${item.value}${WHITESPACE_START.test(after) ? "" : " "}`;
			const updated = [...lines];
			updated[cursorLine] =
				line.slice(0, cursorCol - prefix.length) + insertion + after;
			return {
				lines: updated,
				cursorLine,
				cursorCol: cursorCol - prefix.length + insertion.length,
			};
		},
		shouldTriggerFileCompletion: (lines, line, col) =>
			fileProvider.shouldTriggerFileCompletion(lines, line, col),
	};
}

function findAutocompleteBinary(binaryNames: readonly string[]): string | null {
	const pathValue = process.env.PATH;
	if (!pathValue) {
		return null;
	}

	const directories = pathValue.split(delimiter).filter(Boolean);
	for (const binaryName of binaryNames) {
		const executablePath = directories
			.map((directory) => join(directory, binaryName))
			.find(isExecutableFile);
		if (executablePath) {
			return executablePath;
		}
	}

	return null;
}

function isExecutableFile(path: string): boolean {
	try {
		accessSync(path, fsConstants.X_OK);
		return true;
	} catch {
		return false;
	}
}
