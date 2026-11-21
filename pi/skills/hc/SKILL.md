---
name: hc
description: Run what the shell tool cannot. Make a visible terminal tab appear in the user's Herdr window and type commands into it, for anything interactive (TUI editors and coding agents, scaffold wizards that ask which framework and options while installing, password prompts). Run slow or long commands in the background (npm run dev, builds, tests, watchers) in terminals that outlive the command. Use whenever a command needs a TTY, must keep running, or the user asks for a new tab, a terminal, or a Reqable (proxied, traffic-captured) terminal.
---

# hc

This machine runs Herdr: the `herdr-app` desktop app draws a window of tabs,
and the `hc` core runs each tab's terminal. You are inside one of those
terminals now — `$HC_TERMINAL_ID` is your own address. `<t>` below is any
terminal address: `t17`, a name you gave it, or `machine/t7`.

The shell tool runs one command to completion in a blocking pipe: no TTY, no
background, no interaction. hc terminals are real terminals: they have a PTY,
they keep running after a command ends, and the user can watch and type in
them at the same time as you.

## Make a visible tab and run commands in it

When the user asks for a new tab, or a command needs a TTY (TUI editors and
agents, interactive scaffold wizards that ask questions while installing,
password and confirmation prompts, anything that waits for keypresses):

```sh
herdr-app do tab.new --name gh-auth
# -> {"space":"sp…","tab":"tb…","terminal":"t17"}    keep both ids
```

A new tab appears at once in the user's window, focused, running the default
shell. Optional: `--name`, `--folder` for its working directory (default: the
focused terminal's), `--focus false` to leave the user where they are.
Then type into that tab as the user would:

```sh
hc send t17 "gh auth --help"      # types the command, presses Enter
hc read t17                       # the tab's screen: the command's output
herdr-app do tab.close --id tb… --confirmed true
```

- Send right after `tab.new`, no waiting: the input queues until the shell
  is ready. After sending a command, read once; if the output is not on
  screen yet, read again — the command is still running. Expecting a known
  marker? `hc wait <t> --output X` returns the instant it appears. Never
  sleep. If `hc read` shows a booting screen, read again — never assume
  failure.
- `hc send <t> "text"` types text and presses Enter (`hc send <t> ""` is Enter
  alone); `hc keys <t> enter esc ctrl+c up` presses keys; `hc read <t>` prints
  the screen (`--lines 100` adds history). This is how you drive a TUI: send,
  keys, read. After launching a TUI, one `hc read` confirms it started: a
  shell prompt instead of its interface means the launch failed — do not
  keep typing keys into it.
- Auth and login flows: launch, then one `hc read <t>` — the screen holds the
  URL or code the user must act on. Report it and stop; the user approving it
  is the slow part, so do not poll.
- A coding agent is run this way too: open its tab and send the task as its
  first message. Wait for it with `hc wait <t>` — it returns the instant the
  agent is done, blocked or errors, no sleeps. Steer a running one with
  `hc send <t> "…"`; `hc interrupt <t>` stops its turn.
- The tab's default shell on this machine is plain PowerShell (`pwsh`), not
  proxied: what you `hc send` must be PowerShell syntax. Close with the
  printed tab id, not the terminal address. Every app command with its args:
  `herdr-app commands`.

## A Reqable terminal — a tab whose traffic Reqable captures

Reqable is an HTTP(S) debugging proxy listening on this machine at
127.0.0.1:9000. When the user asks for a "Reqable terminal" or a proxy
terminal, open the tab through the `rq.cmd` wrapper instead of the
default shell:

```sh
herdr-app do tab.new --name reqable --argv '["rq.cmd","pwsh","-NoLogo"]'
# -> {"space":"sp…","tab":"tb…","terminal":"t17"}    a proxied pwsh
```

Everything run in that tab goes through Reqable with its CA trusted (node,
python, ruby; curl needs `-k`) and appears in Reqable's traffic list. To
check captures, use the reqable MCP tools — discover their current names
and args from the tool list, they change between versions. A normal tab is
not proxied; to capture a single command anywhere, prefix it with `rq.cmd`.

## Background: servers, builds, watchers (no visible tab)

```sh
hc run --bg --name dev --cwd C:/dev/app npm run dev
hc wait dev --output "ready"     # or keep working: the exit note arrives as your next input
hc read dev --lines 100
```

- `--bg` is required: without it the program's whole screen streams into your
  output. Without `--bg`, `run` waits like a shell and returns the exit code —
  fast commands only.
- A watcher that must outlive this session: `--outlive-parent` (your
  terminals end with you by default).
- Never sleep, never poll. `hc wait <t>` returns the instant it exits, blocks
  or errors. `reason: timeout` is a check-in, not a failure — wait again.
  `--output X` cannot match text printed before the wait started — `hc read`
  first. Several at once: `hc wait --children any|all`.
- One-shot with exact output, no terminal: `hc exec <cmd>` (ends it after 60 s
  by default).

## Rules

- Only touch terminals you started — `hc ls` shows the user's other work.
- Never `hc server stop` or restart the core unless asked.
- Done with one you started: `hc kill <t> && hc rm <t>`; for a tab,
  `herdr-app do tab.close --id <tab> --confirmed true`.
- Exact arguments anytime: `hc <cmd> --help`; every app command:
  `herdr-app commands`.

