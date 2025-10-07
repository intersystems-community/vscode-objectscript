# CCS Change Log

## [3.2.0] 06-Oct-2025

> Based on [InterSystems VSCode ObjectScript v3.2.0 changelog](https://github.com/intersystems-community/vscode-objectscript/blob/v3.2.0/CHANGELOG.md)

- Enhancements
  - Add ObjectScript enter rules for semicolon (`;`) continuation on line break (#5)
  - Auto-indent dot syntax on Enter for `objectscript`/`objectscript-int` (replicates leading dots) (#6)
  - Added `resolveContextExpression` command: posts current line/routine to API, inserts returned code on success, shows error otherwise (#7)
  - Reorganize CCS module structure into `src/ccs/` with separated folders for config, core, sourcecontrol, and commands (#12)
  - Add `core/` and centralized `config/` scaffolds for internal module structuring (#14)
  - Introduce `ContextExpressionClient` and centralized route handling for CCS API calls (#15)
  - Reorganize SourceControl API into dedicated `clients/` folder (#16)
  - Add Ctrl+Q to fetch global documentation from selection and print to Output (#17)
  - Unify Go to Definition (F12) and Ctrl+Click through CCS API resolution (#20)
- Fixes
  - Prevent unwanted semicolon insertion on ObjectScript line breaks (#13)
  - Fix prettier `Insert enter` error in ObjectScript editor rules (#10)
  - Ensure consistent indentation and formatting for `.mac` and `.int` routines (#11)
