# Recovery pairs orphaned asks per request, not in the session file

When pi crashes during an ask flow, the session keeps an `ask_user` tool call with no tool result. Recovery reopens it and delivers the answers as a user message. Without a fix, pi-ai inserts a synthetic `No result provided` error result before every request, so the model sees an error before the answers.

The extension API cannot write a tool result: `ctx.sessionManager` is read-only, and boundary drafts have no tool-result type. So pi-ask adds a `context` handler that inserts one constant, non-error tool result for each recovered ask on every outgoing request. The session file stays unpaired on disk. Do not "fix" this by writing the session through private APIs. The inserted text is constant, so the provider cache prefix stays stable.
