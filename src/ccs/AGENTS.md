# Agent Instructions (src/ccs/)

Scope: everything under `src/ccs/` (Consistem fork layer).

## Quick Links

- `src/ccs/config/settings.ts` (`objectscript.ccs.*` settings contract)
- `src/ccs/core/http.ts` (HTTP client factory)
- `src/ccs/sourcecontrol/routes.ts` (internal API route table)

## Purpose (Keep Merges Easy)

- This directory exists to isolate Consistem-specific behavior from upstream code.
- Prefer implementing new Consistem rules/features here and exposing them via `src/ccs/index.ts`, with minimal wiring in `src/extension.ts`.

## Ownership & Wiring

- Expose public entrypoints from `src/ccs/index.ts` and keep call sites in `src/extension.ts` small.
- Commands in this layer use the `vscode-objectscript.ccs.*` namespace and are typically shown under the “Consistem” category in `package.json`.
- If a CCS feature replaces upstream behavior (ex.: F12 / go to definition), always provide a safe fallback to the default VS Code command when CCS resolution fails.

## Settings Contract (objectscript.ccs.*)

- Settings are read on-demand via `getCcsSettings()` (`src/ccs/config/settings.ts`).
- Keys live under `objectscript.ccs.*` (ex.: `endpoint`, `requestTimeout`, `debugLogging`, `flags`).
- Treat these as a stable contract for Consistem users: avoid breaking changes; sanitize inputs in `settings.ts` (not scattered across features).

## Server Integrations (Internal APIs)

- CCS calls are routed through `SourceControlApi` (`src/ccs/sourcecontrol/client.ts`) and the route table in `src/ccs/sourcecontrol/routes.ts`.
- Default base URL is derived from the active Atelier connection; it can be overridden via `objectscript.ccs.endpoint` (see `src/ccs/config/settings.ts`).
- Keep new endpoints behind a small `clients/*Client.ts` wrapper and typed response shapes in `src/ccs/core/types.ts`.
- Treat `src/ccs/sourcecontrol/routes.ts` as the source of truth; if you update routes, update this doc (or remove stale endpoint notes).

### Current Internal Endpoints (as of this fork)

Base path: `GET/POST {baseURL}/api/sourcecontrol/vscode` (see `BASE_PATH` in `src/ccs/sourcecontrol/routes.ts`).

- `POST /resolveContextExpression`
  - Used by: `vscode-objectscript.ccs.resolveContextExpression` (`src/ccs/commands/contextHelp.ts`)
  - Behavior: sends routine + selected/line expression; may return preview content and a `textExpression` to insert.
- `POST /getGlobalDocumentation`
  - Used by: `vscode-objectscript.ccs.getGlobalDocumentation` (`src/ccs/commands/globalDocumentation.ts`)
  - Behavior: fetches “global documentation” text for the selection/query.
- `POST /namespaces/{NAMESPACE}/resolveDefinition`
  - Used by: F12 / Ctrl+Click path via CCS definition lookup (`src/ccs/features/definitionLookup/*` + `src/ccs/commands/goToDefinitionLocalFirst.ts`)
  - Behavior: resolves symbols using Consistem’s internal server logic; should fall back to VS Code default when it can’t resolve.
- `POST /namespaces/{NAMESPACE}/createItem`
  - Used by: `vscode-objectscript.ccs.createItem` (`src/ccs/commands/createItem.ts`)
  - Behavior: creates a class/routine on the server and returns a file path to open locally.
- `POST /namespaces/{NAMESPACE}/unitTests/runUnitTests`
  - Used by: unit test runner integration (`src/commands/unitTest.ts` via `src/ccs/sourcecontrol/routes.ts`)
  - Behavior: runs server-side tests and returns structured results/console output.
- `POST /namespaces/{NAMESPACE}/localizarGatilhos`
  - Used by: `vscode-objectscript.ccs.locateTriggers` (`src/ccs/commands/locateTriggers.ts`)
  - Behavior: locates triggers and supports opening returned locations.
- `POST /namespaces/{NAMESPACE}/obterGatilhosPorEmpresa`
  - Used by: `vscode-objectscript.ccs.locateTriggersByCompany` (`src/ccs/commands/locateTriggers.ts`)
  - Behavior: returns available company accounts and trigger counts for a routine.

## Reliability & UX

- Use `requestTimeout` from `objectscript.ccs` settings and respect VS Code’s `http.proxyStrictSSL`.
- Prefer non-blocking UX: progress notifications for long calls, graceful fallback when CCS resolution fails (e.g., fall back to VS Code’s default definition).
- User-facing strings in this layer are typically PT-BR; keep tone consistent and actionable.

## Logging & Errors

- Use `logDebug/logInfo/logWarn/logError` (`src/ccs/core/logging.ts`) instead of ad-hoc output.
- For errors coming from HTTP calls, surface a short message to the user and log details only when `debugLogging` is enabled.

## HTTP & Security

- Create HTTP clients via `createHttpClient()` (`src/ccs/core/http.ts`); don’t instantiate `axios` directly elsewhere in this folder.
- Never log credentials, auth headers, or full URLs that could embed secrets.
