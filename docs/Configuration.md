---
layout: default
title: Configuration
permalink: /configuration/
nav_order: 3
---
# Configuration

VS Code settings enable you to customize various aspects of its function. The InterSystems-provided extensions enable you to define InterSystems IRIS servers and the connections to those servers.

## Settings

Many available settings are general to VS Code, and you can learn about them in the [Visual Studio Code Documentation](https://code.visualstudio.com/docs). The InterSystems Server Manager and InterSystems ObjectScript extensions supply specific settings used to configure VS Code for ObjectScript development.
There are several levels on which settings are stored and used:

- **User** - User settings are stored in a file location specific to you and apply globally to any instance of VS Code or any VS Code workspace that you open.
- **Workspace** - Workspace settings are stored in a file inside the workspace and apply to anyone who opens the workspace.
- **Folder** - If more than one folder is present in the workspace, you can select the folder where the settings file is stored by selecting from the Folder drop down list.

For example, the following screen shot shows Workspace selected:

![Workspace selected.](../assets/images/ClickWorkspace.png "workspace selected")

See the VS Code documentation section [User and Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings).

## Configuring a Server

First, configure one or more servers. Select **View > Command Palette > InterSystems Server Manager: Store Password in Keychain**. This command lets you define a new server, as well as storing a password. Click the plus sign in the upper right corner of the dialog, as shown:

![Define New Server.](../assets/images/new-server.png "define new server")

Provide the following values when prompted:

- **Name of new server definition** - an arbitrary name to identify this server
- **Hostname or IP address of web server** - the host for this server
- **Port of web server** - the WebServer port number for this server
- **Username** - the username to use in logging in to this server.
- **Confirm connection type** - the protocol used for connections, possible values are **http** and **https**.

Once you have entered these values, the server definition is stored in your user settings. At that point another prompt appears, asking for a password to store in the system Keychain. Enter the password for the username supplied earlier to complete the process.

## Editing a Server Configuration

If you need to modify a server configuration select **File > Preferences > Settings** (**Code > Preferences > Settings** on Mac) from the menu. Select the **User** settings level. Find **Extensions** in the list in the left pane of the editor window, click to open, then select **InterSystems Server Manager** from the list to find the **InterSystems Server Manager** area of the edit pane, as illustrated in the following screen shot:

![Server manager settings.](../assets/images/ServerManagerSettings.png "server manager settings")

Click *Edit in settings.json*.

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

Open the folder where you want client-side files to be located. Select the **ObjectScript Explorer** button which has been added to the Activity Bar. Select the **Choose Server and Namespace** button. This action opens a dialog that lets you select a server, or create a new one. Once you have selected a server and namespace, connection configuration is complete.

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