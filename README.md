[![Known Vulnerabilities](https://snyk.io/test/github/intersystems-community/vscode-objectscript/badge.svg)](https://snyk.io/test/github/intersystems-community/vscode-objectscript)
![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/intersystems-community.vscode-objectscript.svg)
[![](https://img.shields.io/visual-studio-marketplace/i/intersystems-community.vscode-objectscript.svg)](https://marketplace.visualstudio.com/items?itemName=intersystems-community.vscode-objectscript)

[![](https://img.shields.io/badge/InterSystems-IRIS-blue.svg)](https://www.intersystems.com/products/intersystems-iris/)
[![](https://img.shields.io/badge/InterSystems-Caché-blue.svg)](https://www.intersystems.com/products/cache/)
[![](https://img.shields.io/badge/InterSystems-Ensemble-blue.svg)](https://www.intersystems.com/products/ensemble/)

# InterSystems ObjectScript extension for VS Code

[InterSystems&reg;](http://www.intersystems.com) ObjectScript language support for Visual Studio Code, from the [InterSystems Developer Community](https://community.intersystems.com/).

- Documentation on [GitHub Pages](https://intersystems-community.github.io/vscode-objectscript/).

- Guidance on [reporting issues](https://community.intersystems.com/post/using-intersystems-objectscript-vs-code-how-report-issues). This guidance also appears in a later section of this document.

## Features

- InterSystems ObjectScript code highlighting support.

  ![example](https://raw.githubusercontent.com/intersystems-community/vscode-objectscript/master/images/screenshot.png)
- Debugging ObjectScript code.
- Intellisense support for commands, system functions, and class members.
- Export of existing server sources into a working folder:
  - open Command Palette (<kbd>F1</kbd> or <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>)
  - start typing 'ObjectScript'
  - choose `ObjectScript: Export Sources`
  - press <kbd>Enter</kbd>
- Save and compile a class:
  - press <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>F7</kbd>
  - or, select `ObjectScript: Import and Compile Current File` from Command Palette
- Direct access to edit or view server code in the VS Code Explorer via `isfs` and `isfs-readonly` FileSystemProviders (e.g. using a [multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces)). Server-side source control is respected.
- Server Explorer view (ObjectScript: Explorer) with ability to export items to your working folder.

  ![ServerExplorer](https://raw.githubusercontent.com/intersystems-community/vscode-objectscript/master/images/explorer.png)

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
	- Locate the beta immediately above the release you installed from Marketplace. For instance, if you installed `1.1.2`, look for `1.1.3-beta.1`. This will be functionally identical to the Marketplace version apart from being able to use proposed APIs.
	- Download the VSIX file (for example `vscode-objectscript-1.1.3-beta.1.vsix`) and install it. One way to install a VSIX is to drag it from your download folder and drop it onto the list of extensions in the Extensions view of VS Code.

2. From [Command Palette](https://code.visualstudio.com/docs/getstarted/tips-and-tricks#_command-palette) choose `Preferences: Configure Runtime Arguments`.
3. In the argv.json file that opens, add this line:
```json
"enable-proposed-api": ["intersystems-community.vscode-objectscript"]
```
4. Exit VS Code and relaunch it.
5. Verify that the ObjectScript channel of the Output panel reports this:
```
intersystems-community.vscode-objectscript version X.Y.Z-beta.1 activating with proposed APIs available.
```

After a subsequent update of the extension from Marketplace you will only have to download and install the new `vscode-objectscript-X.Y.Z-beta.1` VSIX. None of the other steps above are needed again.

## Configure a Connection

To be able to use many features you first need to configure the connection to your IRIS/Caché/Ensemble server(s) in your [VS Code settings](https://code.visualstudio.com/docs/getstarted/settings). If you are unfamiliar with how settings work and how they are edited, use that link.

We recommend you define server connections in the `intersystems.servers` object whose structure is defined by the [InterSystems Server Manager](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) helper extension.

Install that extension and consult its documentation about its UI and commands for easy setup of connections, plus assistance when editing the JSON definition directly.

For more tips about the `intersystems.servers` object, see the [Notes](#Notes) section below.

### Client-side Editing

A simple workspace -- a local working folder in which you edit InterSystems source files and manage them using client-side source control (e.g. Git) -- will use the `objectscript.conn` settings object to **import** locally-edited code into a namespace on a server, compile it there and run/debug it, and also for initial **export** of an existing codebase (optional). This settings object is usually defined in Workspace Settings, for example in the `.vscode/settings.json` file of your working folder.

A quick way to add `objectscript.conn` to a new working folder is:

1. Open the folder in VS Code.
2. Use the InterSystems icon on the activity bar to switch to **ObjectScript Explorer** view.
3. Click the 'Choose Server and Namespace' button.
4. Respond to the sequence of quickpicks. You can also define a new server at the start of this sequence by using the '+' button.

For more about `objectscript.conn` see the [Notes](#Notes) section below.

### Server-side Editing

To edit code directly in one or more namespaces on one or more servers (local or remote) we recommend creating a workspace definition file (for example _XYZ.code-workspace_) where you specify one or more root folders that directly access namespaces via the `isfs` or `isfs-readonly` URI schemes. The only difference between these two schemes is that any file opened from a folder using the `isfs-readonly` scheme will be set as read-only in VS Code and thus protected against being changed.

1. Start VS Code.
2. If your last-used folder opens, use 'Close Folder' on the 'File' menu ('Code' menu on macOS). Or if what opened was your last-used workspace, use 'Close Workspace'.
3. On VS Code's Explorer view (<kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>), click the 'Manage Servers' button which is contributed by the Server Manager extension.
4. Find your target server in the tree, or use the '+' button to add a new server.
5. Expand the server and its 'Namespaces' folder, then click on the 'pencil' icon for editing access to the namespace or the 'eye' icon for viewing access. If you want to work with web application files rather than classes and routines, hold down the <kbd>Alt</kbd>/<kbd>Option</kbd> key when clicking the button.
6. Use 'Save Workspace As...' to store your workspace definition in a file with a `.code-workspace` extension.

For more about `isfs` and `isfs-readonly` folder specifications see the [Notes](#Notes) section below.

## Reporting Issues

[InterSystems ObjectScript for VS Code](https://intersystems-community.github.io/vscode-objectscript/) consists of three collaborating VS Code extensions. This modular architecture also means there are three different GitHub repositories where issues can be created. Fortunately VS Code itself helps with the task. You will need a GitHub account. Here's how:

1. From the Help menu in VS Code choose 'Report Issue'. Alternatively, open the Command Palette and run `Help: Report Issue...`.

2. When the dialog appears, use the first dropdown to classify your issue:
    - Bug Report
    - Feature Request
    - Performance Issue

3. In the second dropdown pick 'An extension'

4. The third dropdown lets you pick one of your installed extensions. You can type a few characters to find the right entry. For example, `isls` quickly selects "InterSystems Language Server".

   Which one to choose? Here's a guide:
   - InterSystems Language Server
        - code coloring
        - Intellisense
   - InterSystems ObjectScript
        - export, import and compile
        - ObjectScript Explorer (browsing namespace contents)
        - direct server-side editing using `isfs://` folders in a workspace
        - integration with server-side source control etc
   -  InterSystems Server Manager
        - Server Browser on the InterSystems Tools view
        - password management in local keychain
        - definition and selection of entries in `intersystems.servers`

    If unsure, pick InterSystems ObjectScript.

5. Type a descriptive one-line summary of your issue. The dialog may offer a list of existing issues which could be duplicates. If you don't find one that covers yours, proceed.

6. Enter details. If your VS Code is authenticated to GitHub the dialog's button is captioned "Create on GitHub" and clicking it will open the issue, then load it in your browser so you can edit it. Otherwise it reads "Preview on GitHub" and launches a browser page where you must complete and submit your report.

   Tips for use on the GitHub page:

    - Paste images from your clipboard directly into the report field. For hard-to-describe issues an animated GIF or a short MP4 gets bonus points. The `Developer: Toggle Screencast Mode` in VS Code can help your recording make more sense.
    - Link to other issues by prefixing the target number with #
    - Remember that whatever you post here is visible to anyone on the Internet. Mask/remove confidential information. Be polite.

## Notes

- Connection-related output appears in the 'Output' view while switched to the 'ObjectScript' channel using the drop-down menu on the view titlebar.

- The `/api/atelier/` web application used by this extension usually requires the authenticated user to have Use permission on the %Development resource ([read more](https://community.intersystems.com/post/using-atelier-rest-api)). One way is to assign the %Developer role to the user.

- If you are getting `ERROR # 5540: SQLCODE: -99 Message: User xxx is not privileged for the operation` when you try to get or refresh lists of classes, routines or includes, then grant user xxx (or a SQL role they hold) Execute permission for the following SQL Procedure in the target namespace.

```SQL
GRANT EXECUTE ON %Library.RoutineMgr_StudioOpenDialog TO xxx
```

### More about `intersystems.servers`
This settings object is useful for both client-side and server-side development.
- An example server definition named 'local':

```json
  "intersystems.servers": {
    "local": {
      "webServer": {
        "scheme": "http",
        "host": "127.0.0.1",
        "port": 52773
      },
      "description": "My local IRIS",
      "username": "me"
    }
  }
```

- By defining connections in your User Settings they become available for use by any workspace you open in VS Code. Alternatively, define them in workspace-specific settings.

- Setting the `username` property is optional. If omitted it will be prompted for when connecting, then cached for the session.

- Setting a plaintext value for the `password` property is **not** recommended. Instead, run the `InterSystems Server Manager: Store Password in Keychain` command from Command Palette.

- If no password has been set or stored it will be prompted for when connecting, then cached for the session.

### More about `objectscript.conn`
This settings object is primarily relevant when doing client-side development.
- We recommend that `objectscript.conn` uses its `server` property to point to an entry in `intersystems.servers`. For example:

```json
  "objectscript.conn": {
    "active": true,
    "server": "local",
    "ns": "USER"
  }
```

- The mandatory `ns` property defines which server namespace you will work with.

- When the `server` property is set, any `username` or `password` properties of `objectscript.conn` are ignored. Instead these values come from the `intersystems.servers` entry.

### More about `isfs` and `isfs-readonly` workspace folders
Server-side development is best done using `isfs` folders. The read-only variant `isfs-readonly` is also useful when doing client-side development, since it enables server-side searching of your codebase.

To modify how your folder behaves, edit the JSON of your workspace definition (_XYZ.code-workspace_ file). Get there by using the 'Edit Settings' option from the context menu of Server Manager's 'Servers' view, or by running the 'Preferences: Open Workspace Settings (JSON)' command from the Command Palette. Edit your `uri` property.

- The `csp` query parameter indicates web application files are to be shown. The uri path optionally specifies which application. The namespace suffix on the server name (preferred syntax) or the `ns` query parameter (deprecated) must specify the same namespace the application is configured to use. In the following example the first folder is for the `/csp/user` web application in the USER namespace of the server named 'local' and the second gives read-only access to all web applications that reside in the %SYS namespace. The second folder also uses the optional `name` property:
```json
    {
      "uri": "isfs://local:user/csp/user?csp"
    },
    {
      "name": "local:%SYS web files (read-only)",
      "uri": "isfs-readonly://local/?ns=%SYS&csp"
    }
```
  
- To see only classes in the Xxx.Yyy package, format the uri like this:

```json
    {
      "uri": "isfs://local:user/Xxx/Yyy?type=cls"
    }
```

- Other query parameters that can be specified include:
  - `type=cls` to show only classes, or `type=rtn` to show only routines.
  - `flat=1` to flatten the hierarchy.
  - `generated=1` to show generated items.
  - `system=1` to show system (%) items. Without this parameter these are only shown for the %SYS namespace.
  - `filter=filterspec` to use a filter specification formatted in the same way as used in InterSystems Studio's File Open dialog (e.g. `filter=Ensem*.inc`).

## Support and Training

[CaretDev](https://caretdev.com/#products) provides commercial support services. [Request a quote](https://caretdev.com/contact-us/).

On-line course from CaretDev - [Developing with VS Code ObjectScript – Easy Start](https://caretdev.com/courses/).
