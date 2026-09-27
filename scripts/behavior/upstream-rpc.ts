/** Adapt upstream's TUI-only tool to RPC for the in-process behavior bridge. */
import { pathToFileURL } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// Pi extension entry points require a default export.
// biome-ignore lint/style/noDefaultExport: Pi loads the default export from -e.
export default async function upstreamRpc(pi: ExtensionAPI): Promise<void> {
	const entry = process.env.PI_ASK_BEHAVIOR_UPSTREAM_ENTRY;
	if (!entry) {
		throw new Error("PI_ASK_BEHAVIOR_UPSTREAM_ENTRY is required");
	}
	const { default: upstream } = await import(pathToFileURL(entry).href);
	const wrapped = new Proxy(pi, {
		get(target, key, receiver) {
			if (key !== "registerTool") {
				return Reflect.get(target, key, receiver);
			}
			return (tool: Parameters<ExtensionAPI["registerTool"]>[0]) => {
				pi.registerTool({
					...tool,
					execute: (id, params, signal, onUpdate, ctx) => {
						if (ctx.mode !== "rpc") {
							return tool.execute(id, params, signal, onUpdate, ctx);
						}
						const ui = {
							...ctx.ui,
							custom: (create: (...args: unknown[]) => unknown) =>
								new Promise((resolve) => {
									// No terminal rendering occurs. The bridge answers the started event.
									create(
										{
											requestRender() {
												return;
											},
										},
										{},
										{},
										resolve
									);
								}),
						};
						return tool.execute(id, params, signal, onUpdate, {
							...ctx,
							mode: "tui",
							ui,
						} as ExtensionContext);
					},
				});
			};
		},
	});
	await upstream(wrapped);
}
