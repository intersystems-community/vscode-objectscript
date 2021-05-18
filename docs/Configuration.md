---
layout: default
title: Configuration
permalink: /configuration/
nav_order: 4
---
# Configuration 

VS Code settings enable you to customize various aspects of its function. The InterSystems extensions provide settings used to configure VS Code for ObjectScript development.

{: #code-workspaces}
## VS Code Workspaces 

To work with VS Code, you need to open a workspace. In the simplest setup, a VS Code workspace is just the root folder of your project. Workspace settings and task configurations are stored in the root folder in the `settings.json` file in a folder called `.vscode`. Debugging launch configurations are stored in `launch.json`, also in `.vscode`.

If you need to have more than one root folder in a VS Code workspace, use a feature called multi-root workspaces. See [Multi-root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) in the VS Code documentation.

A multi-root workspace is defined by a `*.code-workspace` file. The file can have any name followed by *.code-workspace*, for example `test.code-workspace`. The `*.code-workspace` file stores information about what folders are in the workspace, and may also store other settings that would otherwise be stored in the settings.json or launch.json files. Settings in a folder's `.vscode/settings.json` or `.vscode/launch.json` will override those in the `*.code-workspace` file, so be careful to use one or the other unless you truly need to leverage this flexibility. You can have a workspace file even if you are only working with a single root folder. Indeed. if you are [working server-side](../serverside/) you will always be using a workspace file.

To edit **InterSystems ObjectScript** extension settings in a `*.code-workspace` file in VS Code, open the workspace using **File > Open Workspace...**, select **File > Preferences > Settings** (**Code > Preferences > Settings** on Mac) and select the Workspace tab. Search for **objectscript: conn**, and click on *Edit in settings.json*. VS Code opens the `*.code-workspace` file for that workspace.

The **InterSystems ObjectScript** extension uses the multi-root workspaces feature to support ObjectScript development directly in namespaces on InterSystems servers.

## Settings

Many available settings are general to VS Code, and you can learn about them in the [Visual Studio Code Documentation](https://code.visualstudio.com/docs). The InterSystems Server Manager, InterSystems ObjectScript and InterSystems Language Server extensions supply additional settings you can use to define InterSystems IRIS servers and the behavior of connections to those servers.

There are several levels on which settings are stored and used:

- **User** - User settings are stored in a file location specific to you and apply globally to any instance of VS Code or any VS Code workspace that you open.
- **Workspace** - Workspace settings are stored in a file inside the workspace and apply to anyone who opens the workspace.
- **Folder** - If more than one folder is present in the workspace, you can select the folder where the settings file is stored by selecting from the Folder drop down list.

For example, the following screen shot shows the Workspace level selected:

![Workspace selected.](../assets/images/ClickWorkspace.png "workspace selected")

See the VS Code documentation section [User and Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings).

{: #config-server}
## Configuring a Server

First, configure one or more servers. You can use the plus sign (`+`) at the top of the InterSystems Tools view to add a server. For more information on this view, see the section [InterSystems Tools View](../extensionui#intersystems-tools-view).

![Add server.](../assets/images/add-server.png "add server")

Provide the following values when prompted:

- **Name of new server definition** - an arbitrary name to identify this server.
- **Description (optional)** - a brief description of the server.
- **Hostname or IP address of web server** - the host for this server.
- **Port of web server** - the WebServer port number for this server.
- **Username** - the username to use in logging in to this server.
- **Confirm connection type** - the protocol used for connections, possible values are **http** and **https**.

Once you have entered these values, the server definition is stored in your user-level `settings.json` file, and the server appears at the top of the **Recent** folder in the InterSystems Tools view.

If you want to store a password for this server definition, select **Store Password in Keychain** from the context menu for the server in the InterSystems Tools view.  If you do not store a password, users are prompted for a password each time they connect to the server. To remove a password from the keychain, Select **Clear Password from Keychain** from the server context menu. For more information, see [Server Context Menu](../extensionui#server-context-menu).

You can create a configuration for a server that is not currently running.

## Editing a Server Configuration

If you need to modify a server configuration select **File > Preferences > Settings** (**Code > Preferences > Settings** on Mac) from the menu. Select the **User** settings level. Find **Extensions** in the list in the left pane of the editor window, click to open, then select **InterSystems Server Manager** from the list to find the **InterSystems Server Manager** area of the edit pane, as illustrated in the following screen shot:

![Server manager settings.](../assets/images/ServerManagerSettings.png "server manager settings")

Click *Edit in settings.json*.

The InterSystems Tools view provides an alternate path to this `settings.json` file. Click the `...` button and select **Edit Settings**. 

![Edit settings.](../assets/images/edit-settings.png "edit settings")

The server configuration in *settings.json* looks similar to the following, with the values you entered when you configured the server:

```json
{
    "intersystems.servers": {
        "iris-1": {
            "webServer": {
                "scheme": "http",
                "host": "localhost",
                "port": 52773
            },
            "username": "_SYSTEM"
        }
    }
}
```
The components of the server definition are as follows:

- **iris-1** - An arbitrary name to identify this server
- **webServer** - The collection of properties that define the web server
- **scheme** - The protocol used for connections
- **host** - the host for this server
- **port** - the WebServer port number for this server
- **username** - the username to use in logging in to this server
- **password** - password for the specified username. Entering the password in this file is acceptable only in limited situations with very low need for security. 

If you do not store the password securely in the system Keychain or add it to the server definition, anyone using the server needs to supply the password. The InterSystems Server Manager provides the following commands for managing stored passwords in the Command Palette:

- **InterSystems Server Manager: Clear Password from Keychain** - remove the password for a selected server
- **InterSystems Server Manager: Store Password in Keychain** - select a server or create a new one and enter a password

## Configuring a Server Connection

Open the folder where you want client-side files to be located. Select the **ObjectScript Explorer** button on the Activity Bar. Select the **Choose Server and Namespace** button. This action opens a dialog that lets you select a server, or create a new one. Once you have selected a server and namespace, connection configuration is complete. VS Code adds the server and namespace to the status bar, as shown in the following screen shot.

![Connection information in the status bar.](../assets/images/action-for-server-start.png "connection information in the status bar")

You cannot create a connection to a server that is not running.

Click on the server and namespace in the status bar to open a list of actions you can take for this server:

![Select action for server.](../assets/images/action-for-server.png "select action for server")

## Editing a Server Connection

If you need to modify a server connection select **File > Preferences > Settings** (**Code > Preferences > Settings** on Mac) from the menu. Select the **Workspace** settings level. Search for **objectscript: conn**, and click on *Edit in settings.json*.

The connection configuration looks like this:

```json
"objectscript.conn": {
	"ns": "USER",
	"server": "iris-1",
	"active": true,
},
```

The components of this configuration are:

- **ns** - namespace to use on the server
- **server** - server name as specified in the server configuration
- **active** - specifies whether the connection is active.
