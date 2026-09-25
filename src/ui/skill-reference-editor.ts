import { Editor } from "@earendil-works/pi-tui";
import { SKILL_COMPLETION_PREFIX } from "./autocomplete.ts";

// pi-tui only opens slash completion at the start of the first line. Ask notes
// and custom answers need the same menu after prose and on later lines.
export class SkillReferenceEditor extends Editor {
	override handleInput(data: string): void {
		const previousText = this.getText();
		super.handleInput(data);
		if (this.getText() === previousText) {
			return;
		}
		const { line, col } = this.getCursor();
		const before = (this.getLines()[line] ?? "").slice(0, col);
		if (SKILL_COMPLETION_PREFIX.test(before)) {
			// Private in pi-tui 0.84.1: no public request-menu API exists.
			// biome-ignore lint/complexity/useLiteralKeys: pi-tui exposes no public autocomplete trigger.
			this["tryTriggerAutocomplete"]();
		}
	}
}
