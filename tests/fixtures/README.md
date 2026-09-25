# Full-mode reference text

`full-mode-v1.2.0.json` was generated from upstream v1.2.0, commit `49482b7`, with:

```sh
pnpm install --frozen-lockfile
node tests/fixtures/generate-full-mode.mjs
```

The generator reads `git show 49482b7:<path>` for the upstream source and runs those modules in a temporary directory. It uses this worktree's installed dependencies, but never imports this worktree's `src/`. The prompt snippet and config sentence come from the upstream source text. The config sentence replaces only the absolute configuration-document path with `<CONFIGURATION_DOC_PATH>`; the package name stays as it appears upstream. The sample ask and validation issue in the generator fix the variable parts of result text. Do not regenerate the fixture after changing current model-facing text to make the test pass.
