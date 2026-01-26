# Agent Instructions (src/)

Scope: everything under `src/`.

## Quick Links

- `src/extension.ts` (activation + registration hub)
- `src/utils/index.ts` (shared utilities + `handleError()`)
- `src/test/suite/` (integration tests)

## Architecture & Boundaries

- `src/extension.ts` is the main activation/registration hub. New commands/providers should be registered here.
- Treat `src/ccs/` as the **Consistem customization layer**. Prefer adding new Consistem rules, APIs, and UX there to keep upstream merges clean.
- Avoid coupling Consistem features deeply into upstream modules; keep adapters thin and move behavior into `src/ccs/`.

## Commands, IDs, and Configuration

- Keep command IDs in the existing namespace:
  - Upstream: `vscode-objectscript.*`
  - Consistem: `vscode-objectscript.ccs.*` (category “Consistem” in `package.json`).
- When you add a new command:
  1) add it to `package.json` under `contributes.commands` (and keybindings/menus if needed),
  2) register it in `src/extension.ts`,
  3) add telemetry event wiring if the surrounding pattern does.
- When you add/update settings:
  - define them in `package.json` under `contributes.configuration`,
  - keep Consistem-specific keys under `objectscript.ccs.*` (see `src/ccs/AGENTS.md`).

## Error Handling & Logging

- Prefer `handleError()` for user-facing error surfacing.
- Avoid `console.*` for runtime logging; follow the established Output channel / logging utilities patterns.
- Don’t leak credentials or full URLs with embedded auth in logs.

## Style

- 2-space indentation (see `.editorconfig`), Prettier + ESLint enforced.
- Match existing patterns (async/await, early returns, explicit typing where it adds clarity).

## Performance & UX

- Providers run frequently; avoid doing network calls per keystroke.
- Prefer progress notifications (`withProgress`) for operations that may take noticeable time.
