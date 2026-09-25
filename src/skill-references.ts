import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type SkillCommands = ReturnType<ExtensionAPI["getCommands"]>;
export interface ResolvedSkill {
	name: string;
	path: string;
}

const TRAILING_PERIODS = /\.+$/;
const SKILL_TOKEN = /(^|\s)\/skill:([a-zA-Z0-9._-]+)(?=$|\s|[,:;.!?)}\]])/g;

export function getSkillCommands(commands: SkillCommands) {
	return commands.filter((command) => command.source === "skill");
}

export function resolveSkillReferences(
	texts: string[],
	commands: SkillCommands
): ResolvedSkill[] {
	const skills = new Map(
		getSkillCommands(commands).map((command) => [
			command.name.slice("skill:".length),
			command.sourceInfo.path,
		])
	);
	const resolved = new Map<string, string>();
	for (const text of texts) {
		for (const match of text.matchAll(SKILL_TOKEN)) {
			const name = match[2];
			const skillName = skills.has(name)
				? name
				: name.replace(TRAILING_PERIODS, "");
			const path = skills.get(skillName);
			if (path) {
				resolved.set(skillName, path);
			}
		}
	}
	return [...resolved].map(([name, path]) => ({ name, path }));
}
