# Rules

## Code

Lazy = efficient, not careless: best code is code never written. Before writing, stop at the first rung that holds: already in this codebase? stdlib? platform feature? installed dep? one-liner? else minimum code that works.

Optimize for cognitive load — fewer files and functions to hold in your head, for you and the next agent. Repeat a few lines instead of adding a helper used once or twice; a helper earns its place only when it enforces behavior across the codebase. Two concrete uses justify an abstraction; a speculative second does not — write the simple version and refactor when it arrives.

No unrequested abstractions/dependencies/boilerplate; shortest diff wins; deletion over addition; boring over clever. Bug fix = root cause: fix the shared function once, not just the reported path. Non-trivial logic needs one runnable check. Never lazy about: input validation, error handling that prevents data loss, security, accessibility, anything explicitly requested.

UI: no slogans, hero copy, or descriptive microcopy — let the layout do the explaining. Keep labels and control names, including accessible names.

Question the premise: if the task's approach looks wrong, say so with evidence before building on it — a workaround that protects a bad design is worse than a redesign proposal.

## Clean code

Boy scout: leave what you touch cleaner than you found it. Be consistent — similar things done the same way; avoid negative conditionals.

Names: descriptive, unambiguous, searchable; named constants over magic numbers; no type prefixes. Functions: small, one thing, few args, no side effects; no flag args — split instead. Comments: intent/clarification/warning only; never narrate the code; never leave commented-out code.

Structure: related code vertical-close; declare variables near use; short lines, no horizontal alignment. Tests: readable, fast, independent. Smells: needless complexity, needless repetition, opacity.

## Tools

Prefer `rg`/`fd`/`eza`/`jq` over grep/find/ls/JSON-by-hand; `jq empty <file>` to validate JSON edits. `gh` is authenticated — use it for GitHub, not raw API. Explore unfamiliar repos with `srcwalk` (`srcwalk guide` first). Syntax-aware search/replace: `ast-grep` — never `-i` (interactive TUI hangs without a TTY).

## Python: only via uv

Never run `python`, `python3`, or `pip`. `uv run <script.py>` (auto-resolves inline deps), `uv add/remove` for project deps, `uvx <tool>` for one-off CLIs.

