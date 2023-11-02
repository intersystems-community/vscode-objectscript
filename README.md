[![Known Vulnerabilities](https://snyk.io/test/github/intersystems-community/vscode-objectscript/badge.svg)](https://snyk.io/test/github/intersystems-community/vscode-objectscript)
![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/intersystems-community.vscode-objectscript.svg)
[![](https://img.shields.io/visual-studio-marketplace/i/intersystems-community.vscode-objectscript.svg)](https://marketplace.visualstudio.com/items?itemName=intersystems-community.vscode-objectscript)

[![](https://img.shields.io/badge/InterSystems-IRIS-blue.svg)](https://www.intersystems.com/products/intersystems-iris/)
[![](https://img.shields.io/badge/InterSystems-Caché-blue.svg)](https://www.intersystems.com/products/cache/)
[![](https://img.shields.io/badge/InterSystems-Ensemble-blue.svg)](https://www.intersystems.com/products/ensemble/)

# InterSystems ObjectScript extension for VS Code

> **Note:** The best way to install and use this extension is by installing the [InterSystems ObjectScript Extension Pack](https://marketplace.visualstudio.com/items?itemName=intersystems-community.objectscript-pack) and following the [documentation here](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO).

[InterSystems&reg;](http://www.intersystems.com) ObjectScript language support for Visual Studio Code, from the [InterSystems Developer Community](https://community.intersystems.com/).

- Documentation on the [InterSystems Documentation site](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO).

- Guidance on [reporting issues](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_reporting).

## Features

- InterSystems ObjectScript code highlighting support.
- Debugging ObjectScript code.
- Intellisense support for commands, system functions, and class members.
- Export of existing server sources into a working folder:
  - open Command Palette (<kbd>F1</kbd> or <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>)
  - start typing 'ObjectScript'
  - choose `ObjectScript: Export Code from Server`
  - press <kbd>Enter</kbd>
- Save and compile a class:
  - press <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>F7</kbd>
  - or, select `ObjectScript: Import and Compile Current File` from Command Palette
- Direct access to edit or view server code in the VS Code Explorer via `isfs` and `isfs-readonly` FileSystemProviders (e.g. using a [multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces)). Server-side source control is respected.
- Server Explorer view (ObjectScript: Explorer) with ability to export items to your working folder.
- Integration with with [InterSystems Server Manager](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) for secure storage of connection passwords.

## Installation

Install [Visual Studio Code](https://code.visualstudio.com/) first.

Then to get a set of extensions that collaborate to bring you a great ObjectScript development experience, install the [InterSystems ObjectScript Extension Pack](https://marketplace.visualstudio.com/items?itemName=intersystems-community.objectscript-pack).

When you install an extension pack VS Code installs any of its members that you don't already have. Then if you ever need to switch off all of those extensions (for example, in a VS Code workspace on a non-ObjectScript project) simply disable the extension pack at the desired level. Member extensions can still be managed individually.

Open VS Code. Go to Extensions view (<kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>), use the search string **@id:intersystems-community.objectscript-pack** and install it.

## Enable Proposed APIs

This extension is able to to take advantage of some VS Code APIs that have not yet been finalized.

The additional features (and the APIs used) are:
- Server-side [searching across files](https://code.visualstudio.com/docs/editor/codebasics#_search-across-files) being accessed using isfs (_TextSearchProvider_)
- [Quick Open](https://code.visualstudio.com/docs/getstarted/tips-and-tricks#_quick-open) of isfs files (_FileSearchProvider_).

To unlock these features (optional):

1. Download and install a beta version from GitHub. This is necessary because Marketplace does not allow publication of extensions that use proposed APIs.
	- Go to https://github.com/intersystems-community/vscode-objectscript/releases
	- Locate the beta immediately above the release you installed from Marketplace. For instance, if you installed `2.10.5`, look for `2.10.6-beta.1`. This will be functionally identical to the Marketplace version apart from being able to use proposed APIs.
	- Download the VSIX file (for example `vscode-objectscript-2.10.6-beta.1.vsix`) and install it. One way to install a VSIX is to drag it from your download folder and drop it onto the list of extensions in the Extensions view of VS Code.

2. From [Command Palette](https://code.visualstudio.com/docs/getstarted/tips-and-tricks#_command-palette) choose `Preferences: Configure Runtime Arguments`.
3. In the argv.json file that opens, add this line (required for both Stable and Insiders versions of VS Code):
```json
"enable-proposed-api": ["intersystems-community.vscode-objectscript"]
```
4. Exit VS Code and relaunch it.
5. Verify that the ObjectScript channel of the Output panel reports this:
```
intersystems-community.vscode-objectscript version X.Y.Z-beta.1 activating with proposed APIs available.
```

After a subsequent update of the extension from Marketplace you will only have to download and install the new `vscode-objectscript-X.Y.Z-beta.1` VSIX. None of the other steps above are needed again.

## Notes

- Connection-related output appears in the 'Output' view while switched to the 'ObjectScript' channel using the drop-down menu on the view titlebar.

- The `/api/atelier/` web application used by this extension usually requires the authenticated user to have Use permission on the %Development resource ([read more](https://community.intersystems.com/post/using-atelier-rest-api)). One way is to assign the %Developer role to the user.

- If you are getting `ERROR # 5540: SQLCODE: -99 Message: User xxx is not privileged for the operation` when you try to get or refresh lists of classes, routines or includes, then grant user xxx (or a SQL role they hold) Execute permission for the following SQL Procedure in the target namespace.

```SQL
GRANT EXECUTE ON %Library.RoutineMgr_StudioOpenDialog TO xxx
```
