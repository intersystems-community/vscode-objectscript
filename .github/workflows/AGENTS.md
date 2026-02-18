# Workflow Guidelines

## Scope

These instructions apply to files under `.github/workflows/`.

## General CI Rules

- Keep workflows idempotent and safe for scheduled re-runs.
- Prefer explicit shell safety in script blocks: `set -euo pipefail`.
- Use clear step names and stable step outputs for control flow.
- Avoid destructive git operations unless strictly required and justified by workflow logic.

## Branch Governance

- Never push directly to `master` from workflows.
- Use dedicated bot branches for automation flows.
- Changes to protected branches must enter via Pull Request.
- Prefer merge commit strategy when repository governance requires audit-friendly history.

## Upstream Sync Workflow (`sync-upstream.yml`)

- Purpose: synchronize fork changes from `intersystems-community/vscode-objectscript` into this fork.
- Schedule: daily at `03:00 UTC` (equivalent to `00:00 America/Sao_Paulo`).
- Invariants:
  - Sync branch is `bot/sync-upstream-master`.
  - No direct writes to `master`.
  - PR only flow (`bot/sync-upstream-master` -> `master`).
  - Merge mode must be merge commit (`--merge`), not squash/rebase.
- Safety behavior:
  - Exit with no action if upstream tip is already contained in base.
  - Only create PR when there is real diff between base and sync branch.
  - Preserve manual work on sync branch when present; avoid blind reset.
  - Treat auto-merge as best-effort (must not fail the whole job if unavailable).
- Conflict behavior:
  - Keep sync branch available for manual resolution.
  - Comment on PR with manual resolution instructions when possible.

## Repository Setup Requirements

- GitHub Actions enabled.
- `GITHUB_TOKEN` permissions include:
  - `contents: write`
  - `pull-requests: write`
- Repository allows merge commits (and optional auto-merge).
- Optional secret `GOOGLE_CHAT_WEBHOOK_URL` for Chat notifications.
