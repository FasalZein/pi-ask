# Changelog

# 1.1.1 (2026-10-05)

### Bug Fixes

* Paging hints fit narrow terminals. When the full hint with its page key does not fit, it shortens to `↑ N more` / `↓ N more`. Before, pi exited with "Rendered line exceeds terminal width". Thanks to @edxeth (#13).

# 1.1.0 (2026-10-05)

pi-ask now needs pi 0.99.0 or later (ADR 0010). On older pi, pin `pi install git:github.com/FasalZein/pi-ask@v1.0.1`.

### Features

* `ask_user` registers with `exposure: "model-only"`. The model calls it directly; codemode scripts cannot call it.
* An `ask_user` call with an invalid payload returns an error result (`isError: true`), so the model sees a failed call.

### Bug Fixes

* In pi fullscreen mode, page hints show only keys that reach the form. Keys that pi's transcript takes (by default PageUp, PageDown, Home, End, and Ctrl+Shift+↑/↓) are skipped, and remapped pi keybindings are respected.
* pi-ask no longer sets the terminal title, which left the tab title blank after every ask.
* The tool description limits a specific requested decision to that one question. In behavior harness runs, GLM 5.3 flash no longer added unrequested questions (0 of 3 runs, before 2 of 3).
* Page hints say "1 more option" and show `pageUp` instead of `page↑`.

# 1.0.1 (2026-09-30)

### Features

* The Review tab shows a one-row action bar (`1 Submit │ 2 Elaborate │ 3 Cancel`) above numbered question blocks. ↑↓ moves between the actions.

### Bug Fixes

* Note and custom-answer editors wrap long text at word boundaries. Lines no longer lose their last characters to `...`.
* Long answers and notes on the Review tab and long form titles wrap without `...`.
* Editor bars and the preview box end 1 column before the right edge.
* The stacked preview box starts at column 1, and box text has 1 space of padding on each side.
* Side-by-side previews show each description once, in the box heading.
* A blank row separates the prompt from the question note.
* Editor placeholders read `Add a note` and `Type your answer`.
* The settings overlay has square corners in pi's border color.

# 1.0.0 (2026-09-27)

This is the first release of the standalone repository `FasalZein/pi-ask`. pi-ask started as a fork of `@eko24ive/pi-ask` 1.2.0. The fork releases 1.3.0 and 1.4.0 and their history are in `FasalZein/pi-ask-fork-archive`.

**Note for users of the fork:** a pinned ref such as `@v1.4.0` does not exist in this repository. Use `pi install git:github.com/FasalZein/pi-ask` or `pi install git:github.com/FasalZein/pi-ask@v1.0.0`.

Changes since fork 1.4.0:

### Features

* Skills that you name with `/skill:name` in an answer or note load after the ask result.
* Typing `/` in answer and note editors opens the list of pi skills. Tab inserts the selected skill. Enter keeps the literal text.
* Question tabs show `○` for unanswered and `●` for answered questions.
* `Ctrl+V` (pi's paste image key) pastes a clipboard image into answer and note editors as a file path.
* The preview box uses only the rows it needs and fits the free terminal height.

### Bug Fixes

* The settings overlay keeps a fixed height, pads the cursor row, and shows how many settings are hidden above and below.
* Options and review actions use the same ` ▶ ` focus pointer. Footers stay on one line. Option notes align with the option description.
* Revert ask behavior changes that the user did not request: the ask tool has no question limit, hidden configuration advice appears only for `/ask-settings`, `pi-ask setting`, `pi-ask settings`, `keymap`, or `keybinding`, and the settings focus pointer matches the question and review screens.
* The pi-better-skills integration uses the stable request channel `pi-better-skills:request`, version 1.

### Documentation

* The README is rewritten.

### Maintenance

* The behavior harness installs the upstream baseline into a temporary prefix.
