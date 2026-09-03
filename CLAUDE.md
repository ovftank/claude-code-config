# Coding style: lazy senior dev

Lazy = efficient, not careless. Best code is code never written. Before writing code, stop at the first rung that holds:

1. Needed at all? (YAGNI)
2. Already exists in this codebase? Reuse it, don't rewrite.
3. Stdlib covers it? Use it.
4. Native platform feature covers it? Use it.
5. Installed dependency covers it? Use it.
6. One-liner? Write one line.
7. Otherwise: minimum code that works.

Climb only after understanding the problem — read the task and the code it touches, trace the real flow end to end first.

Bug fix = root cause: grep every caller of the touched function and fix the shared function once, not just the path the ticket names.

Rules: no unrequested abstractions/dependencies/boilerplate; deletion over addition, boring over clever, fewest files; shortest diff wins once the problem is understood; question complex requests ("does Y already cover it?"); between equal-size stdlib options pick the edge-case-correct one, not the flimsier one; mark cut corners (global lock, O(n²) scan, naive heuristic) with a `note:` comment naming the ceiling and upgrade path.

Not lazy about: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, real-hardware calibration, anything explicitly requested. Non-trivial logic needs one runnable check (assert-based demo or small test file, no frameworks); trivial one-liners don't.

# CLI tools available on this machine

Prefer these over slower/less capable alternatives when applicable. All confirmed installed and on PATH — invoke by bare name, never with a full path.

- `rg` (ripgrep). Prefer over `grep` for plain text/regex search.
- `fd`. Prefer over `find`. `fd -e py`, `fd -t f`, `fd -x <cmd>` to exec per result.
- `eza` — `ls` replacement. `eza -la --tree -L 2`, `--git` to show git status per file.
- `jq` — JSON processor. Always validate JSON edits with `jq empty <file>`.
- `gh` (GitHub CLI). Prefer over raw GitHub API calls for issues, PRs, gists, releases, etc. (`gh issue create`, `gh pr create`, `gh repo clone`...). Already authenticated (account `ovftank`) — use it instead of unauthenticated API requests, which hit rate limits fast.

## srcwalk — smart code reading built specifically for AI agents

Prefer over raw Read/`rg` when exploring an unfamiliar repo — cheaper on tokens than reading whole files or grepping blind. Start with `srcwalk guide` to learn the rest of its commands.

## ast-grep — structural code search/rewrite, prefer over `rg`/regex for syntax-aware matches

Use when the match depends on code structure, not just text — e.g. "every call to `foo()` with 2+ args", "all `class` declarations extending `Base`", or a structural rewrite across many files.

- Search: `ast-grep run -p '<pattern>' -l <lang> [path]`
- Rewrite (dry-run diff by default): `ast-grep run -p '<pattern>' -r '<replacement>' -l <lang> [path]`
- Apply non-interactively: add `-U`/`--update-all`. Never use `-i`/`--interactive` from Bash — it opens a TUI confirmation session that needs a real TTY and will hang.
- `--json` for structured output when parsing results programmatically.

## uv — the only way to run Python on this machine

Never run `python`, `python3`, or `pip` directly — always go through `uv`.

- `uv run <script.py>` — run a script, auto-resolving deps declared via inline `# /// script` metadata (no manual venv needed).
- `uv add <pkg>` / `uv remove <pkg>` — manage deps in the current project's `pyproject.toml`, not `pip install`.
- `uv tool run <tool>` (or `uvx <tool>`) — run a CLI tool from PyPI in an ephemeral env, without installing globally.
- Prefer a Python script (via `uv run`) over the Edit tool when a line contains Nerd Font PUA glyphs (icons) — the Edit tool's exact-string match unreliably fails on those bytes even when copied verbatim from a fresh Read.

