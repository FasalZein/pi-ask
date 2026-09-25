/** Fixed behavior set from spec #1. Each case starts in a new RPC session. */
export const cases = [
	{
		id: "naming",
		prompt:
			"We need a name for a new local note-taking tool. Before you choose a name, ask me to choose between two distinct naming directions. Do not decide for me.",
	},
	{
		id: "scope",
		prompt:
			"Plan the first release of a local note-taking tool. Offline-only and cloud sync are both valid scope directions. Ask me which scope I prefer before planning.",
	},
	{
		id: "tone",
		prompt:
			"Design the UI tone for a local note-taking tool. Show two distinct visual tone mockups using a preview-type ask_user question so I can compare them before you choose.",
	},
	{
		id: "note",
		prompt:
			"Ask me which of two onboarding directions to take for a local note-taking tool. I will attach a note to my answer. Respond to my note before moving forward.",
	},
	{
		id: "narrowing",
		prompt:
			"Plan a note-taking tool. Ask first whether this is for solo use or a team. My answer will narrow the path. After I answer, ask the next two related decisions together in one ask_user call, not as plain-text choices. Stop after I answer the second ask.",
	},
	{
		id: "config",
		prompt:
			"Change the ask_user keymap for submit. Before changing any pi-ask settings or keys, read the pi-ask configuration documentation. Do not edit files in this exercise; report the documented setting you would change.",
	},
];
