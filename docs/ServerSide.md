---
layout: default
title: Server-side Editing
permalink: /serverside/
nav_order: 6
---

# Configuration for Server-side Editing 

You can configure the InterSystems ObjectScript extension to edit code directly on the server, using the [multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) VS Code feature. This type of configuration is useful in cases where source code is stored in a Source Code Management (SCM) product interfaced to the server. For example you might already be using the Source Control menu in InterSystems Studio or Portal, implemented by a source control class that extends `%Studio.SourceControl.Base`.

First configure the `intersystems.servers` entry for your server, as described in [Configuration](../configuration).

Next create a workspace for editing code directly on the server:

1. Open VS Code. You must perform the following steps starting with no folder or workspace open, so if a folder or workspace is already open, close it.
1. Open the Explorer view if it is not already visible.
1. Click the button labeled **Choose Server and Namespace** in the Explorer view, as shown in the following screen shot:

    ![Explorer view.](../assets/images/ss-explorer-view.png "explorer view")
1. Pick a server from the list, or click the **+** sign to create a new server configuration:

   ![Choose a server.](../assets/images/ss-choose-server.png "choose a server")
1. Enter credentials if prompted.
1. Pick a namespace from the list retrieved from the target server:

   ![Choose a namespace.](../assets/images/ss-choose-namespace.png "choose a namespace")
1. Pick an access mode from the list:

   ![Choose an access type.](../assets/images/ss-access-type.png "choose an access type")
1. If you want to reopen this workspace in the future, use the command **File > Save Workspace As...** to save it as a `.code-workspace` file.

Note that the ObjectScript button is not visible in the Activity Bar, because the files listed in the Explorer view are all on the server, so it is not needed for this configuration.

The `.code-workspace` file is a JSON file which you can edit directly, as described in the section  [VS Code Workspaces](../configuration/#code-workspaces). A simple example looks like this:
```json
{
	"folders": [
		{
			"name": "iris184:USER",
			"uri": "isfs://iris184:user"
		}
	],
	"settings": {}
}
```
- The `name` property provides a name for this server-side folder.
- The `uri` property indicates the location of resources on the server. The supplied value has three components:
   - The first component can be either `isfs` or `isfs-readonly`. These values specify that this folder is on an InterSystems IRIS server. `isfs-readonly` specifies read-only access.
   - The value following `/` specifies the name of the server.
   - The value following `:` specifies the namespace (lowercase).

The string `isfs` which appears in the **uri** for folders configured for server-side editing is an abbreviation created by InterSystems which stands for **InterSystems File Service**. It implements the VS Code [FileSystemProvider API](https://code.visualstudio.com/api/references/vscode-api#FileSystemProvider), which let's you make any remote location look like a local one. It was designed for common things like FTP servers, but it works well for making artefacts in an InterSystems IRIS database namespace look like local files.

To add more root folders to your workspace, giving you access to code in a different namespace, or on a different server, use the context menu on your existing root folder to invoke the `Add Server Namespace to Workspace...` command. This command is also available on the Command Palette.

An example of a two-folder workspace in which the second folder gives read-only access to the %SYS namespace:
```json
{
	"folders": [
		{
			"name": "iris184:USER",
			"uri": "isfs://iris184:user"
		},
		{
			"name": "iris184:%SYS (read-only)",
			"uri": "isfs-readonly://iris184:%sys"
		}
	],
	"settings": {}
}
```

Workspaces can also consist of a mixture of server-side folders and local folders. Use the context menu's `Add Folder to Workspace...` option to add a local folder.

Root folders can be re-sequenced using drag/drop in the Explorer view, or by editing the order their definition objects appear within the `folders` array in the JSON.

## Web Application (CSP) Files

To edit web application files (also known as CSP files) on a server, configure the uri as `isfs://myserver:xxx{csp_application}?csp`

For example, the following uri gives you access to the server-side files of the `/csp/user` application. The `csp`  query parameter is mandatory and the suffix on the server name must specify the correct namespace for the web application.

```
"uri": "isfs://myserver:user/csp/user?csp"
```

Changes you make to files opened from this root folder of your VS Code workspace will be saved onto the server.

## Filters and Display Options

The query string of the `uri` property accepts several parameters that control filtering and display of the server-side entities. The examples below access the USER namespace on the server whose definition is named 'myserver'.

- `isfs://myserver:user?type=cls`, shows only classes
- `isfs://myserver:user?type=rtn`, shows only routines, mac, int and inc files
- `isfs://myserver:user?generated=1`, shows generated files as well as not generated
- `isfs://myserver:user?filter=%Z*.cls,%z*.cls,%Z*.mac`, comma-delimited list of search options, ignores `type`
- `isfs://myserver:user?flat=1`, a flat list of files does not split packages as folders.

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
      "uri": "isfs://myapp:user",
      "name": "user",
    },
    {
      "uri": "isfs://myapp:%sys",
      "name": "system",
    },
    {
      "uri": "isfs://user@hostname:port?ns=%SYS",
      "name": "system (alternative syntax)",
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
