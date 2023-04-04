# Change Log

## [2.8.0] 04-Apr-2023
- Enhancements
  - Integrate Angular Rule Editor (#1014)
  - Add command to refresh local file contents (#1066) (contributed by @ollitanska)
  - Add `SOAP Wizard` to Server Actions menu (#1107)
  - Add snippet for custom class queries (#1111)
- Fixes
  - Fix api version check in AtelierAPI.getDoc() (#1110)
  - Don't switch Panel to Output tab when starting with proposed API enabled (#1113)
  - Deprecate confusing `objectscript.serverSideEditing` setting (#1116)
  - Upgrade vulnerable dependencies.

## [2.6.0] 27-Feb-2023
- Enhancements
  - Implement async server-side search (#1045) (requires [proposed API enabled](https://github.com/intersystems-community/vscode-objectscript#enable-proposed-apis) and InterSystems IRIS 2023.1+)
  - Add `Switch Namespace` option to Server Actions menu for local workspace folders (#1065) (contributed by @ollitanska)
  - Document Studio keyboard shortcut equivalents (#1076)
  - Improve `isfs` folder creation/modification UX (#1090)
  - Implement `Open Error Location...` command (#1095)
- Fixes
  - Use webview toolkit in Documatic panel (#1074)
  - Fix isfs folder deletion (#1080)
  - Support non-ASCII characters in REST Debug query params (#1081)
  - Fall back to Index for deployed check if query fails (#1083)
  - Correctly set breakpoints in methods with quoted names (#1086)
  - Properly handle other files and packages in server-side projects (#1087)
  - Add charset to REST Debug panel's Content-Type (#1092)
  - Fix namespace pick when trying to connect without permissions on `%SYS` (#1097)
  - Fix server-side search in compiler keywords and values (#1102)
  - Upgrade vulnerable dependencies.

## [2.4.3] 02-Feb-2023
- Fixes
  - Fix deployed check (#1071)
  - Fix opening of `isfs` files from ObjectScript Explorer (#1072)

## [2.4.2] 01-Feb-2023
- Enhancements
  - Use query instead of index for class Deployed checks (#1054)
  - Use `docker compose` command if present (#1057)
  - Trigger reload of any `objectscript://` document after import (#1062)
- Fixes
  - Fix Server Action URL generation (#1053)
  - Use lowercase for workspace folder state connection keys (#1055)
  - Update local workspace mtime record when exporting (#1059)
  - Fix import of binary files such as webapp images (#1064)
  - Upgrade vulnerable dependencies.

## [2.4.1] 12-Jan-2023
- Fixes
  - Fix 'No file system provider found' errors when debugging local file (#1047)

## [2.4.0] 10-Jan-2023
- Enhancements
  - Show server name in Status Bar (#1017)
  - Server-side search: use include/exclude specs (#1021)
  - Add commands for creating new files (#1029)
  - Add `FileDecoration` for Generated files (#1035)
  - Add command for importing local files into server-side workspace folder (#1036)
  - Document new Language Server setting (#1037)
  - Add support for debugging REST services (#1043)
- Fixes
  - Hide `-injection` languages from selector (#1011)
  - Properly report matches in Storage definitions (#1025)
  - Fix debug breakpoint mapping when Language Server is absent (#1031)
  - Don't call `openTextDocument` in debugger (#1042) 
  - Upgrade vulnerable dependencies.

## [2.2.0] 31-Oct-2022
- Enhancements
  - Add features to ease migration from Studio (see [Migrating from Studio documentation page](https://intersystems-community.github.io/vscode-objectscript/studio/) for details) (#1003)
  - Improve CodeLenses (#1007)
- Fixes
  - Improve export error logging (#998)
  - Fix uncaught errors (#1001)
  - Skip triggering refreshes at end of some checkConnection calls (#1006)
  - Fix uncaught errors reported when no workspace is open (#1008)
  - Upgrade vulnerable dependencies.

## [2.0.0] 04-Oct-2022
- Enhancements
  - Use Server Manager version 3's enhanced security for stored passwords. Explicit permission must be given by the user before Server Manager will provide a connection's stored password to this extension. This feature previewed in the 1.x pre-releases, which 2.0.0 supersedes.
  - Add `Copy Invocation` CodeLens alongside `Debug this Method`. Hideable using the `objectscript.debug.copyToClipboard` setting (#974)
  - Add `objectscript.importOnSave` setting to control whether saving a client-side file updates code on the connected server. Default is `true` (#985)

## [1.8.2] 08-Aug-2022
- Enhancements
  - Support `objectscript` and `objectscript-class` as the info string for [fenced code blocks](https://spec.commonmark.org/0.30/#fenced-code-blocks) when editing Markdown. However coloring does not render in preview (#964)
- Fixes
  - Handle some previously uncaught errors (#966)
  - Dispose of all event handlers when deactivating (#967)

## [1.8.1] 25-Jul-2022
- Fixes
  - New class should ignore `objectscript.export.folder` setting (#938)
  - Get correct host port number for connection to docker-compose with multiple services (#941)
  - Don't split dots in names of 'other' files into folders on export (#536, #866, #930)
  - Fix issue with copying class file overwriting inheritance (contributed by @yannip1234) (#954)
  - Show correct tag+offset^routine in status bar when in procedure block code (#957)
  - Use correct isfs connection when attaching to a process for debugging (#958)
  - Fix uncaught errors reported in VS Code extension view UI (#937)
  - Upgrade vulnerable dependencies.

## [1.8.0] 20-Apr-2022
- Enhancements
  - Add support for server-side projects (#851)
  - Implement isfs folder rename and deletion (#923, #922)
  - Support "mapped" flag for isfs and export filters, to exclude packages mapped from other databases (#931) 

## [1.6.0] 06-Apr-2022
Minimum VS Code version is now 1.66.0
- Enhancements
  - Colorize text in Output channel (API has finalized) (#910)
  - Add `objectscript.export.exactFilter` setting (#913)
  - Improve error message when debugging fails to start (#908)
- Fixes
  - Align `objectscript.openClassContracted` setting with Studio's behavior (#876)
  - Properly handle errors when previewing XML as UDL (#906)
  - Fix importing of web app files (#777)
  - Correctly use `http.proxyStrictSSL` setting (#919)
  - Fix problems caused by extension running on server and VS Code UI in web browser (#911)
  - Upgrade vulnerable dependencies.

## [1.4.4] 21-Mar-2022
- Enhancements
  - Compile asynchronously to avoid timing out (#890)
  - Add `objectscript.explorer.alwaysShowServerCopy` setting to make ObjectScript Explorer always open server-side code, even when local copy exists (#494)
  - Move issue reporting instructions from README to [documentation](https://intersystems-community.github.io/vscode-objectscript/feedback/) (#874)
- Fixes
  - Fix syncing of local CSP files (#886)
  - Stop logging `Non-JSON response` messages to Output (#853)
  - Fix server-side searching of CSP files (requires proposed API enabled - see README) (#896)
  - User-level `server` setting in `objectscript.conn` no longer overrides a workspace-level `docker-compose` setting (#898)
  - Ignore `objectscript.conn.docker-compose` when running in dev container (#900)
  - Upgrade vulnerable dependencies.

## [1.4.3] 28-Feb-2022
- Enhancements
  - Add `objectscript.openClassContracted` setting (#876)
- Fixes
  - Fix 1.4.2 regression that broke server-side editing from ObjectScript Explorer and reloading of open documents when reopening isfs workspaces (#879)

## [1.4.2] 23-Feb-2022
- Enhancements
  - Generate content when a new local class or routine is created (#867)
  - Add file icons (#822)
  - Support file copying in Explorer, with some [limitations](https://github.com/intersystems-community/vscode-objectscript/issues/854#issuecomment-1036318435) (#857)
  - Colorize text in Output channel when using VS Code 1.65 with proposed APIs enabled (#831)
  - Improve server-side searching (requires proposed API enabled - see README) (#852)
  - Add a distinct languageId (`objectscript-int`) for INT routines (#823)
- Fixes
  - Make `Open Terminal in Docker` command work with newer Docker versions (#734)
  - Fix case where Quick Open (which requires proposed API) could open a file more than once (#861)
  - Avoid unnecessary Language Server work when importing or compiling a folder (#858, #859)
  - Activate extension correctly based on file-extensions present in workspace (#868)
  - Upgrade vulnerable dependencies.

## [1.4.1] 14-Jan-2022
- Fixes
  - Version 1.4.0 is failing to activate (#827)

## [1.4.0] 14-Jan-2022
- Enhancements
  - Make `Ctrl / Cmd+T` lookup (Open Symbol by Name) check all servers connected to a multi-root workspace (#815)
  - Improve exporting (#818)
  - Improve client-side DFI workflow (#808)
  - Improve behavior when no Source Control class is enabled (#171)
- Fixes
  - Displace incorrectly-published pre-release version.
  - Point to correct line when debugging through code with multi-line method arguments (#804)
  - Show menu options from correct namespace for `Studio Actions` in ObjectScript Explorer (#812)
  - Fix `Attempted Edit` Studio Action handling (#781)
  - Properly return options for the Server Command menu for isfs-readonly files (#811)
  - Remove `vscode-objectscript-output` language from selector (#805)

## [1.2.2] 07-Dec-2021
- Fixes
  - Exporting not working with new version 1.2.1 (#799)

## [1.2.0] 02-Dec-2021
- Enhancements
  - Overhaul `WorkspaceSymbolProvider` (#772)
  - Add `Open Shell in Docker` option to Server Actions menu (#778)
  - Preliminary web extension support (#782)
  - Check all local folders in multi-root workspace for local copy of file (#785)
- Fixes
  - Fix `FileSystemProvider` mtime caching (#770)
  - Comply with new VS Code policy for scoping access to VS Code proposed API (#771)
  - Append .pkg to package name when passed to source control / server command extensions (#776)
  - Improve error messaging for Studio Actions (#784)
  - Upgrade vulnerable dependencies (#787)

## [1.1.1] 09-Nov-2021
- Fixes
    - Debugger: Breakpoint with no hitCondition cannot be set (#766)

## [1.1.0] 08-Nov-2021
- Enhancements
    - Add 'Show Class Documentation Preview' button and command.
    - Improve how line comment markers carry over when newline is entered (#541)
    - Allow server-side source control class UserAction method call with Action=3 to launch an http/s  or ftp/s URL in the external browser (contributed by @a-boertien).
    - Add support for conditional breakpoints.
    - Improve documentation.
- Fixes
    - Prevent save of isfs class if filename doesn't match the class it defines (#410)
    - Refresh ObjectScript Explorer after export (#502)
    - Improve message when `/api/atelier` web application is disabled or missing (#752)
    - Correctly handle dots in routine names, preventing two copies of the same routine from being opened concurrently (#748)
    - Handle multiple selections when performing compile or delete from ObjectScript Explorer (#746)
    - Revert document instead of attempting an undo when server-side source control signals this is necessary.
    - Resolve issue causing unusable authentication page after CSP timeout.
    - Fix XML to UDL conversion.
    - Upgrade vulnerable dependencies.

## [1.0.14] 20-Sep-2021
- Require confirmation before compiling all code in namespace (#677)
- Respect `maxResults` parameter when running server-side search (#713)
- Handle multiple spaces between `Class` keyword and classname (#717)
- Report license starvation connection error properly (#721)
- Display AfterUserAction errors reported by server-side source control (#701)
- Preserve user edit if it triggered a successful checkout in server-side source control (#703)
- Fix failing `Go to Definition` from CSP file when working with isfs (#727)
- Support 'Open Document' action by server-side source control (#731)
- Upgrade vulnerable dependency.

## [1.0.13] 09-Jul-2021
- Add Watchpoint support to debugging (#697)
- Make QuickOpen respect any `filter=xxx` query parameter on the isfs folder definition (#593)
- Fix unexpected alerts about server-side copy being newer when working with isfs (#683)
- Always run isfs dialog's serverInfo request in the %SYS namespace (#682)
- Fix "Cannot read property 'toLowerCase' of undefined" error on startup (#693)
- Report problem if isfs workspace definition points to non-existent server definition (#695)
- Give clearer messages if user has insufficient privilege on the server (#678)
- Allow opting out of 'Other Studio Action' server-side source control calls (#691)

## [1.0.12] 10-Jun-2021
- Allow extension to work in untrusted workspaces.
- Don't switch to File Explorer view when opening a file from ObjectScript Explorer (#651)
- Scroll to correct line after an Output panel link is clicked (#657)
- Handle compilation errors better (#673)
- Improve documentation.
- Upgrade vulnerable dependencies.

## [1.0.11] 12-May-2021
- Support client-side web app (CSP) workflow as long as web app path is in the `/csp/*` space (#147, #449)
- Add compile-only commands 'Compile Current File' and 'Compile Current File with Specified Flags...' (#595)
- Add 'Edit Other' command plus menu option below 'View Other' (#309)
- Report server-side errors from imports and isfs saves (#391)
- Use web app token when authenticating with Management Portal and Class Reference.
- Permit empty argument list in 'Debug this' (#642)
- Add `objectscript.compileOnSave` setting to turn off post-save compile (#594)
- Treat `system=1` parameter on non-%SYS `isfs` folder spec as signal to include %-items (#623)
- Add `objectscript.multilineMethodArgs` setting to use UDL parameter supported on servers with API version 4+ (#457)
- Add snippets for business processes.
- Prevent leading space in front of Class keyword from blocking import (#613)
- Import into the correct namespace when working with multi-root workspace (#535)
- Refactor 'Jump to Line' to use DocumentSymbolProvider.
- Improve 'View Other' when working with servers supporting API version 4+ (#363)
- Support Language Server enhancement that opens local copy of file when using 'Go to Definition' in client-side editing mode.
- Update connections when settings are changed (#608)
- Improve documentation.
- Upgrade vulnerable dependencies.

## [1.0.10] 26-Apr-2021
- Avoid prompting for already-saved password (#61)
- Constrain QuickOpen list contents when `isfs` folder path targets a specific package (#581)
- Show `isfs` folder label in breadcrumb even without proposed APIs enabled (#599)
- Improve information about compiler flags (#532)
- Add clickable links to compilation error text in Output pane (#386)
- Relabel Variables folders in debugger to be `Private` and `Public` instead of `Local` and `Global` (#482)
- Fix debugging breakpoint command message when class has multiple packages (#597)
- Support expansion of orefs in debugger Variables pane provided server-side API version implements the necessary support (#598)
- Improve README.
- Upgrade vulnerable dependencies.

## [1.0.9] 22-Mar-2021
- Allow system files (% classes) to be searched from non-%SYS namespace.
- Handle `objectscript.conn.server` referencing non-existent `intersystems.servers` entry (#586)
- Improve README.
- Upgrade vulnerable dependencies.

## [1.0.8] 15-Jan-2021
- Implement `isfs://server:namespace/` syntax as an alternative to the `ns=NAMESPACE` query parameter (#450)
- Use new isfs notation in entries created by 'Add Server Namespace to Workspace' (#554)
- Load server-side (isfs) folder-specific snippets (#552)
- Improve snippets:
    - Add a ///-comment tabstop at the start of all snippets used in class definitions.
    - Add descriptive default text to more tabstops.
    - Add third superclass to multi-superclass snippet.
    - Uniformly use Capitalized command names and UPPERCASE function names in ObjectScript.
    - Standardize body layout in definitions to reflect layout of result.
    - Tidy how duplicate tabstops are used.
- Support searching all Studio document types when using symbol search (Cmd/Ctrl + T).
- Upgrade vulnerable dependency.

## [1.0.7] 4-Jan-2021
- Fix issue affecting use with Docker on Windows (#516)
- Resolve problem debugging in a multi-root workspace using isfs (#387)
- Allow 'View Other' from custom Studio documents.
- Fix issue that prevented saving of custom Studio documents.
- Add code snippets for Request, Response and multi-superclass class definitions, Projection, XData, Try Catch, $$$ThrowOnError macro.
- Upgrade vulnerable dependency.

## [1.0.6] 13-Nov-2020
- Target current class when opening documentation from Server Actions quickpick, launched by click on ObjectScript panel in status bar (#490)
- Improve code snippets (#493)
- Update README to state need for manual download and install of beta VSIX in order to use proposed APIs (#478)
- Make server-side search of isfs folder (proposed API) work even when folder isn't first root in workspace (#495)
- Fix status bar panel issues that affected Docker targets (#498)
- Resolve failure to prompt for password (1.0.5 regression) (#503)
- Exclude Studio project documents (.prj) from isfs tree (#501)
- Fix variable tree cascade that occurred when value was edited during debugging (#505)
- Show clickable url launching graphical editor for BPL and DTL documents opened from isfs folder (#508)
    - To show .bpl and .dtl files, add `filter=*` to isfs folder's `uri` property in your `XXX.code-workspace` file.
    - Alternatively, use `View Other` from context menu of the corresponding class.
- Display supported image files correctly when opened from isfs web application folder (#394)
- Prevent import from overwriting class that is in [deployed mode](https://docs.intersystems.com/iris20181/csp/docbook/Doc.View.cls?KEY=GOBJ_classes#GOBJ_deploy_classes) (#382)
- Respect `pathPrefix` property of an `intersystems.servers` connection definition in more places:
    - debugger connections
    - urls on Server Actions menu

## [1.0.5] 5-Nov-2020
- Defer to Language Server 1.0.5+ for folding range information (#473)
- Add `objectscript.overwriteServerChanges` setting to permit unconditional import from local file (#464)
- Fix authentication problem introduced in 1.0.2 (#458)
- Handle Unicode characters in identifiers (#337)
- Avoid inappropriate transfer of user-level `objectscript.conn` settings into workspace-level settings (#460)
- Enhancements available only when proposed APIs are enabled:
    - Improve format of results from Quick Open server-side file name search (#467)
    - Add root folder label text to label of isfs file (#455)
    - Add '(read-only)' suffix to label of non-editable file opened from ObjectScript Explorer (#471)

## [1.0.4] 30-Oct-2020
- Wait for connection checks to complete during activation.
- Display debugging values correctly when they contain characters above ASCII 127.
- Fix broken server-side .vscode storage mechanism when isfs query string includes other parameters after `ns`.
- Make status bar panel more relevant when current workspace is not associated with a server.
- Support more ${...} substitution variables in server menu links. See PR [#444](https://github.com/intersystems-community/vscode-objectscript/pull/444) for details and [WebTerminal](https://openexchange.intersystems.com/package/WebTerminal) launch example.
- Supply process picker default for `processId` property of new attach-type debug configuration.
- Differentiate "Edit" and "View" options better on isfs dialog.

## [1.0.3] 24-Oct-2020
- Fix problem that prevented 1.0.2 from publishing to Marketplace.

## [1.0.2] 23-Oct-2020
- Fix problem with excessive license use.
- Install language server extension in the background.
- Use less status bar space.
- Add icons to first-level subfolders of ObjectScript Explorer.
- Add `objectscript.export.map` setting.

## [1.0.1] 20-Oct-2020
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
