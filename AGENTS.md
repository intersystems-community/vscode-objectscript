# Repository Guidelines

## Quick Links

- `package.json` (commands, settings, contributes)
- `src/extension.ts` (activation + registration hub)
- `src/ccs/index.ts` (Consistem fork entrypoints)

## Project Structure & Module Organization

- `src/`: TypeScript source for the VS Code extension.
  - `src/commands/`, `src/providers/`, `src/explorer/`, `src/api/`, `src/utils/`: feature modules.
  - `src/test/`: extension integration test harness.
- `src/ccs/`: **Consistem fork layer** (custom commands/providers/integrations kept isolated to reduce upstream merge conflicts).
- `syntaxes/` and `language-configuration*.json*`: language grammar + editor configuration for ObjectScript.
- `snippets/`: VS Code snippet definitions.
- `webview/`: webview assets used by the extension UI.
- `images/`: icons and documentation images.
- `test-fixtures/`: workspace fixtures used by integration tests.

## Consistem Fork Notes (Merge-Safe Customizations)

- Prefer implementing Consistem-only behavior inside `src/ccs/` and wiring it up from `src/extension.ts` (command registration, providers, settings).
- This fork talks to **two** server surfaces:
  - Official upstream integration via Atelier (`/api/atelier/...`) for standard features.
  - Consistem internal SourceControl API under `src/ccs/sourcecontrol/` (default base path: `/api/sourcecontrol/vscode`), derived from the active Atelier connection and optionally overridden via `objectscript.ccs.endpoint`.
- If you must change upstream-owned modules, keep the diff small and route Consistem logic through `src/ccs/` to make future upstream updates easier.

## Hierarchical Agent Instructions

This repo uses “Hierarchical Agent Instructions”: folders may contain their own `AGENTS.md` with **more specific** rules.

- When working on files under a directory, follow the closest `AGENTS.md` in that directory tree.
- This repository keeps a minimal, common structure:
  - Root `AGENTS.md` (general rules and contributor guide)
  - `src/AGENTS.md` (TypeScript/VS Code extension conventions)
  - `src/ccs/AGENTS.md` (Consistem fork layer conventions)

## Build, Test, and Development Commands

- `npm install`: installs dependencies (also runs `postinstall` to sync VS Code API typings).
- `npm run compile`: production build (`webpack` + `tsc`).
- `npm run webpack-dev`: development bundle in watch mode.
- `npm run watch`: TypeScript watch build (useful for typechecking).
- `npm test`: runs integration tests via `@vscode/test-electron` (downloads VS Code and installs dependent extensions).
- `npm run lint` / `npm run lint-fix`: runs ESLint on `src/**`.
- `npm run package`: produces a `.vsix` via `vsce package`.

For interactive debugging, use VS Code’s `Run and Debug` launch config (see `.vscode/launch.json`) to start an “Extension Development Host”.

## Dependency Changes

- Prefer reusing existing dependencies; adding new runtime deps increases extension size and supply-chain surface area.
- When you do add/remove deps, keep `package.json` and `package-lock.json` in sync and ensure `npm run compile` stays clean.

## Coding Style & Naming Conventions

- Indentation: 2 spaces (see `.editorconfig`).
- Formatting: Prettier settings in `.prettierrc` (e.g., `printWidth: 120`).
- Linting: ESLint flat config in `eslint.config.mjs`; keep changes lint-clean.
- Prefer descriptive names; keep VS Code command IDs under the existing `vscode-objectscript.*` namespace.

## Testing Guidelines

- Framework: Mocha (TDD UI) running inside a VS Code test instance.
- Location/pattern: add tests in `src/test/suite/` using `*.test.ts` naming.
- Keep tests hermetic: rely on `test-fixtures/` instead of a real server when possible.

## Commit & Pull Request Guidelines

- Commit messages typically use an imperative subject and often include a PR reference, e.g. `Fix unit test failure (#73)`.
- Work on a branch (not `master`). PRs should include: problem statement, approach, testing notes, and screenshots for UI/webview changes.
- Keep CI green; governance requires PMC review/approvals (see `GOVERNANCE.md` and `CONTRIBUTING.md`). If a change is user-facing, update `CHANGELOG.md`.
