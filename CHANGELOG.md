# Change Log

## [1.0.0] 19-Oct-2020
- First production release.

## [0.9.5]
- Fix regression in 0.9.4 that broke `Add Server Namespace to Workspace...`.

## [0.9.4]
- Support folder-level settings, snippets and debug configurations for server-side (isfs) workspace folders. This feature requires a `/_vscode` webapp using the %SYS namespace.
- Support webapp-type roots referencing a path that is an ancestor of one or more webapps that use the target namespace. For example `isfs://server/?ns=%SYS&csp` gives access to all %SYS webapps from a single root folder.
- Enhance `Add Server Namespace to Workspace...` command and quickstart button to add webapp-type roots.
- Remove requirement for namespaces to be uppercase in settings.

## [0.9.3]
- Add quickstart button to ObjectScript Explorer view when local folder is open but no `objectscript.conn` settings are available to it.
- Add `Jump to Tag + Offset` command for MACs and INTs, and make it available via click on statusbar field.
- Support server-side editing of other filetypes such as HL7, LUT.
- Output a message when proposed APIs are enabled.
- Connect FileSearchProvider to server. When VS Code is running with the `--enable-proposed-api` switch the QuickOpen field (<kbd>Ctrl/Cmd+p</kbd>) will now search connected servers for classes, routines etc.
- Fix various debugging issues.
- Fix problems with `View Other`.
- Drop first-line 'ROUTINE' entry from label list shown in breadcrumb and Outline panel.
- Pass path of webapp (CSP) files correctly to server-side source control class.
- Support AfterUserAction reload signal from server-side source control class.
- Prepare to coexist with upcoming language server extension.

## [0.9.2]
- Implement `Add Server Namespace to Workspace...` command and surface it on folder context menus in VS Code Explorer.
- Add `Choose Server and Namespace` button to VS Code Explorer view when no folder or workspace is open. This provides a quick way to get started with server-centric development, particularly when combined with the 'just-in-time' connection definition enhancement that arrived in version 0.0.7 of the Server Manager extension.

## [0.9.1]
- Fix problem that caused isfs-type saves to report incorrectly that server version was newer.
- Prevent silent overwrite on retry after an import was initially canceled because of server-side difference.
- Serialize and deduplicate initial credential prompting when a multi-server workspace is opened.
- Make server-side extension pages launch correctly when `intersystems.servers` is used for the connection.
- Fix _tag+line^routine_ display in status bar, and extend it from INTs to MACs.
- Fix broken badges on extension's page.
- Make changes for Theia compatibility.
- Improve README.
- Add missing 0.9.0 CHANGELOG.

## [0.9.0]
- Change publisher id to be 'intersystems-community'.
- Refresh correctly from server after isfs-type save and compile.
- Swap the two sides displayed by a compare invoked after local file import conflict. Server copy is now on the left, to match convention elsewhere in VS Code.
- Fix `Import and Compile Current File`.
- Exclude invalid commands from Command Palette.
- New documentation site using [GitHub Pages](https://intersystems-community.github.io/vscode-objectscript/).
- Add API functions for use by other extensions.
- Upgrade vulnerable dependencies.

## [0.8.9]
- Fix saving of isfs-type server-side editing, broken in 0.8.8.
- Implement double-click opening from ObjectScript Explorer.
- Make ObjectScript Explorer handle non-isfs multi-server multi-root workspace correctly.
- Reload VS Code Explorer tree after successful connection.
- Fix some issues with `export.addCategory` setting:
    - Resolve error when non-string was used as folder value.
    - If setting contains multiple patterns, check all of them, in given order.
- Fix server-side searching of isfs-type root that uses `intersystems.servers` for its connection.
    - Server-side searching uses a VS Code API that is still (1.48) at "proposed" stage. See [here](https://github.com/intersystems-community/vscode-objectscript/issues/126#issuecomment-674089387) for instructions on how to use this pre-release feature.
- No longer use progress indicator when server-side source control displays a page.
- Do not call server-side AfterUserAction if not necessary.
- Upgrade vulnerable dependencies.

## [0.8.8]
- Fix retrieval of password when `objectscript.conn.server` defers to Server Manager.
- Fix command completions, broken in 0.8.7.
- Improve ObjectScript Explorer:
    - Files that will be loaded from local workspace now show their filetype icon and a full path tooltip.
    - Fix rare case where code would load from wrong place.
- Skip compilation of local CSP files for now.
- Improve handling of server modification date comparisons.
- Fix incorrect `Studio Action "Changed Namespace" not supported` message in output channel.
- New `objectscript.autoShowTerminal` option controlling whether terminal shows automatically when connected to docker-compose. Default is `false`.
- Add CONTRIBUTING.md document.
- Improve README information about username and password in settings.

## [0.8.7]
- Use `intersystems.servers` object for more flexible connection definitions.
- Recommend [intersystems-community.servermanager](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) extension for management of `intersystems.servers` definitions.
- Support server-side source control and other server-side commands.
- Add `isfs-readonly` scheme to give readonly access to server code.
- Improve class snippets and implement snippets for routines.
- Be less strict about spaces in header of routines.
- Handle `objectscript.format.commandCase` set to invalid value.
- Make command titles conform to VS Code style.
- Support compilation for more file types.
- Display CSP and Other files in ObjectScript Explorer.
- Add option to show system files in ObjectScript Explorer.
- Make `View Another Namespace...` command in ObjectScript Explorer only apply to the selected server.
- Fix several issues with terminal in Docker.
- Fix some debugging issues.
- Respect original EndOfLine in file when loading changes from server.
- Alert on import error.
- Resolve diagnostic issue in html style block.
- Added diagnostic to warn if non-latin characters found in class element.
- Webpack extension to reduce size.

## [0.8.6] - 2020-04-23
- Support $ETRAP system variable.
- Fix opening Docker terminal.

## [0.8.5] - 2020-04-20
- Fix errors in embedded JS code.
- Fix diagnostic error for values in quotes.

## [0.8.3] - 2020-03-23
- Support for custom address in isfs.
- Multi select in explorer view for mass export.

## [0.8.2] - 2020-03-04
- Show current place (label+pos^routine) in status bar for INT code.
- Fix syntax highlighting.
- Support for ${namespace} in links.

## [0.8.1] - 2020-02-06
- Some small fixes in filtering for isfs.
- Fixed connection info in Explorer.
- Extra links for server.
- Support creating classes, routines, webapp files on isfs.
- Some fixes in formatting provider.
- Option to suppress error messages.
- Ignore case for script and sql in diagnostics.
- Option to disable `debug this method` action.
- Password prompt, live connection status.

## [0.8.0]
- "Debug this ClassMethod" feature added, to quickly debug any classmethod in a class
- Change variable value while debugging
- When virtual filesystem `isfs://` used, now possible to execute some actions from Studio Source class menu
- Explorer view, new way of generation, should be faster now
- Explorer view, INC files now separate in own Includes folder
- Explorer view, option to show/hide generated items
- Explorer view will be shown only when any folder open
- When used docker-compose to run instance, it's now possible to get connected to a random port from service.
- When used docker-compose it's now very easy to connect to terminal
- Go to routine
- Show warning for deprecated functions, quick fix for `$zobj<xxx>` functions replaced

## [0.7.12]

- **Debugging support, run routine, class or attach to a process**
- **Files in Server Explorer now can be edited**
- Added more details about connection errors
- Improvements in Server Explorer build tree
- Fixed memory leak when exporting large amount of files
- Server view can be opened in explorer as virtual file system with schema `isfs://`
- Option to suppress popup information message about successful compile
- Export, addCategory setting have more flexibility in naming category for exported items
- Formatting for commands and functions, as Word, UPPER or lower
- Some improvements in syntax highlighting
- Some other small fixes

## [0.7.11]

- added export setting "objectscript.export.addCategory" if enabled uses previous behavior, adds category folder to export folder, disabled by default
- added Server actions menu, by clicking on server info from status bar. Open Management portal, Class Reference and toggle connection.
- Class Suggestion in ##class, Extends, As, CompileAfter, DependsOn, PropertyClass
- \$SYSTEM suggestion by Classes from %SYSTEM
- Import and compile folder or file by context menu in File explorer
- Server Explorer, now possible to open any other namespace
- Macros suggestion

## [0.7.10]

- New logo
- Fixed backward compatibility with previous versions of Atelier API
- Fixed issue with license usage, due to loosing cookies
- Some other small fixes

## [0.7.9]

- IMPORTANT: **Connection disabled by default, now**. Set `"objectscript.conn.active": true` to enable it
- Automatically Preview XML files as UDL, (disabled by default, setting `objectscript.autoPreviewXML`)
- Preview XML As UDL by command from Command Palette and from Context Menu
- Fixed highlighting for XData with css in style tag
- Show percent-member in outline
- Multi-root workspace supported now, for different connections
- Multi-root workspace also for server explorer
- Go to definition now goes to real file if such presented, or opens from the server
- Basic syntax highlighting for CSP files, only as HTML
- Added some snippets for class
- Go to Subclass for the current class, available in command palette
- Go to Super class for the current class, available in command palette
- Go To any class/method in the workspace including server (by Cmd+T/Ctrl+T)
- some small fixes in the highlighting, and selecting words/variables
- Intellisense. Show list of methods for ##class(SomeClass)
- Go to macros definition
- Go to definition for methods and properties for self object like `..Name`, `..SomeMethod()`
- Added completion for class parameters
- Export without storage

## [0.7.7]

- Completion for ObjectScript Commands
- Hover documentation for ObjectScript commands
- Text formatter for ObjectScript commands

## [0.7.4]

- Outline improvements
- Hover on system functions with documentation

## [0.7.2]

- Fixed outline's regions
- Better code folding
- Go-To Definition for some cases (As, Extends, Include, ##class)
- Simple completion for system functions and variables, with simple description

## [0.7.0]

- big rewrite of plugin's code, to typescript
- `COS` renamed to `ObjectScript`, affected configuration, language, commands etc.
- Export added in context menu on items in Server Explorer
- Improvements in Syntax highlighting
- Language `ObjectScript Class` class was added, now used just for classes

## [0.6.0]

### Added

- Add "View others files" with shortcut

## [0.5.0]

### Added

- Show outline symbols

## [0.4.0]

### Added

- COS explorer

## [0.3.6]

### Added

- Option "Compile on Save"
- Additional notification window about compilation result

## [0.3.5]

### Added

- Add initial syntax support for ClassQuery
- Add initial syntax support for ForeignKey

### Fixed

- Corrected a bit syntax support for macros

## [0.3.4]

### Added

- Reconnect after change settings

## [0.3.3]

### Added

- Update settings dynamically

## [0.3.2]

### Fixed

- Use fixed version of cos-api4node

## [0.3.1]

### Added

- Export after compile

## [0.2.3]

### Fixed

- Remove unused command

## [0.2.2]

### Added

- Option 'conn.export.folder'
- Option 'conn.export.atelier'
- Export files as Atelier

### Changed

- Configuration syntax

## [0.2.1]

### Fixed

- API encoding

## [0.2.0]

### Added

- Allow https

## [0.1.2]

### Added

- Support \*.mac

## [0.1.1]

### Added

- Additional warnings about compilation

## [0.1.0]

### Added

- Save and compile

## [0.0.6]

### Changed

- Upgrade to cos-api4node v2.0.0

## [0.0.5]

### Fixed

- Do not output connection password

## [0.0.4]

### Added

- Add initial support for \*.inc files

## [0.0.3]

### Added

- Config connection to cos-server
- Export sources (experimental)

## [0.0.1]

- Initial release
