---
layout: default
title: Server-side Editing
permalink: /serverside/
nav_order: 5
---
# VS Code Workspaces

To work with VS Code, you need to open a workspace. A VS Code workspace is usually just the root folder of your project. Workspace settings as well as debugging and task configurations are stored in the root folder in a folder called .vscode.

If you need to have more than one root folder in a VS Code workspace, use a feature called multi-root workspaces. See [Multi-root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) in the VS Code documentation.

A multi root workspace contains a \*.code-workspace file. The file can have any name followed by *.code-workspace*, for example `test.code-workspace`. The .code-workspace file stores information about what folders are in the workspace. Other settings that would otherwise be stored in the settings.json or launch.json file can be stored in the .code-workspace file. You can optionally have a workspace file even if you are not using the multi-root feature.

To edit a *.code-workspace* file in VS Code using the **InterSystems ObjectScript** extension, select **File > Preferences > Settings** (**Code > Preferences > Settings** on Mac) and select the Workspace option. When you click **Edit in settings.json**, VS Code opens the *.code-workspace* file for that workspace.

The **InterSystems ObjectScript** extension uses the multi-root workspaces feature to support ObjectScript development on the InterSystems server.

# Server-side Source Control

You can configure the InterSystems ObjectScript extension to edit code directly on the server, using the [multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) VS Code feature. This type of configuration is useful in cases where source code is stored in a Source Code Management (SCM) product interfaced to the server. For example you might already be using the Source Control menu in InterSystems Studio or Portal, implemented by a source control class that extends `%Studio.SourceControl.Base`. 

First configure the `intersystems.servers` entry for your server, as described in [Configuration](../configuration).

Next create a workspace for editing code direct on the server:

1. Open VS Code. If a folder or workspace is already open, close it, for example by pressing <kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd>, releasing that keypair, then pressing <kbd>F</kbd>.

2. Open the Explorer view (<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>) if it is not already visible.

3. When the button labeled "Choose Server and Namespace" appears, click it.

4. Pick a server from your `intersystems.servers` settings object.

5. Enter credentials if prompted.

6. Pick a namespace from the list retrieved from the target server.

7. Pick an access mode (Editable or Read-only).

8. If you want to reopen this workspace in future, save it as a `.code-workspace` file.

> Pro tip: The .code-workspace file you just created is a JSON file which can be edited directly. The Command Palette command `Preferences: Open Workspace Settings (JSON)` gets you there quickly. A simple example looks like this:
```json
{
	"folders": [
		{
			"name": "test:USER",
			"uri": "isfs://test/?ns=USER"
		}
	],
	"settings": {}
}
```
> The `name` property sets how the root folder is labeled and can be edited to suit your needs.

To add more root folders to your workspace, giving you access to code in a different namespace, or on a different server, use the context menu on your existing root folder to invoke the `Add Server Namespace to Workspace...` command. This command is also available on the Command Palette.

An example of a two-folder workspace in which the second folder gives read-only access to the %SYS namespace:
```json
{
	"folders": [
		{
			"name": "test:USER",
			"uri": "isfs://test/?ns=USER"
		},
		{
			"name": "test:%SYS (read-only)",
			"uri": "isfs-readonly://test/?ns=%SYS"
		}
	],
	"settings": {}
}
```

Workspaces can also consist of a mixture of server-side folders and local folders. Use the context menu's `Add Folder to Workspace...` option to add a local folder.

Root folders can be re-sequenced using drag/drop in the Explorer view, or by editing the order their definition objects appear within the `folders` array in the JSON.

## Web Application (CSP) Files

To edit web application files (also known as CSP files) on a server, configure the uri as `isfs://myserver{csp_application}?ns=XXX&csp`

For example, the following uri gives you access to the server-side files of the `/csp/user` application. The `csp`  query parameter is mandatory and the `ns` parameter must specify the correct namespace for the web application.

```
"uri": "isfs://myserver/csp/user?ns=USER&csp"
```

Changes you make to files opened from this root folder of your VS Code workspace will be saved onto the server.

## Filters and Display Options

The query string of the `uri` property accepts several parameters that control filtering and display of the server-side entities.

- `isfs://myserver?ns=USER&type=cls`, shows only classes
- `isfs://myserver?ns=USER&type=rtn`, shows only routines, mac, int and inc files
- `isfs://myserver?ns=USER&generated=1`, shows generated files as well as not generated
- `isfs://myserver?ns=USER&filter=%Z*.cls,%z*.cls,%Z*.mac`, comma-delimited list of search options, ignores `type`
- `isfs://myserver?ns=USER&flat=1`, a flat list of files does not split packages as folders.

The options `flat` and `generated` can be combined with each other, and with `type` or `filter`. If `filter` is specified, `type` is ignored.

## Advanced Workspace Configurations

This section gives examples of some more complex workspace definitions for server-side editing.

Use **File > New File** to create a new file. Add content similar to the following example. Note that `my-project` in the `isfs://` uri, should be the same as the `name` property (i.e. the root display name) of any local folder where specialized settings for the connection are being stored in a `.vscode/settings.json` file.

```json
{
  "folders": [
    {
      "name": "my-project",
      "path": ".",
    },
    {
      "uri": "isfs://my-project",
      "name": "server"
    }
  ],
  "settings": {
    "objectscript.serverSideEditing": true
  }
}
```

Save the file, giving it an arbitrary name with the extension `.code-workspace`. VS Code shows you a button with an offer to open this workspace. Click the button.

When VS Code starts next, you see two folders in the root with the names described in the .code-workspace file. Expand the `server` folder to see code on the configured server and namespace, routines and classes in one place. You can now edit this code. If you have SourceControl class, it should be configured the way, to export files in the same location which used in VS Code workspace.

Example with connection to different namespaces on the same server.
```json
{
  "folders": [
    {
      "name": "myapp",
      "path": ".",
    },
    {
      "uri": "isfs://myapp",
      "name": "server",
    },
    {
      "uri": "isfs://myapp?ns=USER",
      "name": "user",
    },
    {
      "uri": "isfs://myapp?ns=%SYS",
      "name": "system",
    },
    {
      "uri": "isfs://user@directserver:port?ns=%SYS",
      "name": "system",
    }
  ],
  "settings": {
    "files.exclude": {},
    "objectscript.conn": {
      "active": true,
      "username": "_system",
      "password": "SYS",
      "ns": "MYAPP",
      "port": 52773,
    },
    "objectscript.serverSideEditing": true
  }
}
```
