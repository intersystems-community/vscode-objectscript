---
layout: default
title: Configuration
permalink: /configuration/
nav_order: 4
---

# Configuration

VS Code settings enable you to customize various aspects of its behavior. The InterSystems extensions provide settings used to configure VS Code for ObjectScript development.

{: #code-configuration-basic}

## Basic Configuration

VS Code has a concept of a [workspace](https://code.visualstudio.com/docs/editor/workspaces), which is a set of directories you want to use when you're working on a particular project. In the simplest setup when you are working within a single directory, a VS Code workspace is just the root folder of your project. In this case you keep workspace-specific settings in two files inside a `.vscode` directory located at the root of your project. Those two files are `settings.json`, which contains most configuration settings, and `launch.json`, which contains debugging configurations.

Here is the simplest `settings.json` file content for an ObjectScript project:

{: #code-workspace-simple}

```json
{
    "objectscript.conn": {
        "ns": "USER",
        "active": true, 
        "host": "localhost", 
        "port": 52773, 
        "username": "_SYSTEM" 
    }
}
```

However, a better strategy is to let the [InterSystems Server Manager](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) handle the server connection information as described [later](#config-server). That extension also allows you to store your password securely, so please use it. Then in `settings.json` you only need to specify the server name, which you set up in Server Manager:

```json
{
    "objectscript.conn": {
        "server": "iris",
        "ns": "USER",
        "active": true
    }
}
```

If you need ObjectScript compilation flags other than the default ones, add an `"objectscript.compileFlags"` property to `settings.json` (more compileFlags information is [available here](/vscode-objectscript/settings#vscode-objectscript)):

{: #code-workspace-compileFlags}

```json
{
    "objectscript.conn": {
        "server": "iris",
        "ns": "USER",
        "active": true, 
    },
    "objectscript.compileFlags": "cuk/compileembedded=1"
}
```

Here is the simplest `launch.json` file content, with which you can debug the method `Test` in the class `Example.Service`, passing 2 parameters as input (see ["Running and Debugging"](/vscode-objectscript/rundebug/) for more information):

{: #code-workspace-simple-debug}

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "objectscript",
            "request": "launch",
            "name": "Example.Service.Test", 
            "program": "##class(Example.Service).Test(\"answer\",42)"
        }
    ]
}
```

If you want to debug a running process, `launch.json` should have a section like this, which will present a dropdown menu of running processes:

{: #code-workspace-simple-debug-process}

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "objectscript",
            "request": "attach",
            "name": "Example-attach-to-process", 
            "processId": "${command:PickProcess}"
        }
    ]
}
```

Note that `"configurations"` is an array, so you can define multiple configurations and choose the one to use from a dropdown menu in the Debug pane.

{: #code-workspaces}

## VS Code Workspaces

If your project requires more than a single root folder, you need to use a feature called multi-root workspaces. See [Multi-root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) in the VS Code documentation.

In this case settings are stored in a file with a `*.code-workspace` suffix. The filename's extension must be *.code-workspace*, for example `test.code-workspace`. This workspace file can be located anywhere. It defines what root folders the workspace consists of, and may also store other settings that would otherwise be stored in `settings.json` or `launch.json`. Settings in a root folder's `.vscode/settings.json` or `.vscode/launch.json` will override those in the workspace file, so be careful to use one or the other unless you truly need to leverage this flexibility.

You can have a workspace file even if you are only working with a single root folder. Indeed, if you are [working server-side](../serverside/) you will always be using a workspace file.

To edit **InterSystems ObjectScript** extension settings in a `*.code-workspace` file in VS Code, open the workspace using **File > Open Workspace from File...**, select **File > Preferences > Settings** (**Code > Preferences > Settings** on Mac) and select the Workspace tab. Search for **objectscript: conn**, and click on *Edit in settings.json*. VS Code opens the `*.code-workspace` file for that workspace.

The **InterSystems ObjectScript** extension uses the multi-root workspaces feature to support ObjectScript development directly in namespaces on InterSystems servers.

## Settings

Many available settings are general to VS Code, and you can learn about them in the [Visual Studio Code Documentation](https://code.visualstudio.com/docs). The InterSystems Server Manager, InterSystems ObjectScript, and InterSystems Language Server extensions supply additional settings you can use to define InterSystems IRIS servers and connections to those servers.

There are several levels on which settings are stored and used:

- **User** - User settings are stored in a file location specific to you and apply globally to any instance of VS Code or any VS Code workspace that you open.
- **Workspace** - Workspace settings are stored in a file inside the workspace and apply to anyone who opens the workspace.
- **Folder** - If more than one folder is present in the workspace, you can select the folder where the settings file is stored by selecting from the Folder drop down list.

For example, the following screen shot shows the Workspace level selected:

![Workspace selected.](../assets/images/ClickWorkspace.png "workspace selected")

See the VS Code documentation section [User and Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings).

See the [Settings Reference page](../settings/) for a list of all settings contributed by the extensions in the pack.

{: #config-server}
## Configuring a Server

First, configure one or more servers. You can use the plus sign (`+`) at the top of the InterSystems Tools view to add a server. For more information on this view, see the section [InterSystems Tools View](../extensionui#intersystems-tools-view).

![Add server.](../assets/images/add-server.png "add server")

Provide the following values when prompted:

- **Name of new server definition** - An arbitrary name to identify this server.
- **Description (optional)** - A brief description of the server.
- **Hostname or IP address of web server** - The host of the InterSystems server, or a standalone web server that publishes the web services of your target InterSystems server via the InterSystems Web Gateway.
- **Port of web server** - The WebServer port number for this server's private web server, or the port number of the standalone web server.
- **Username** - The username to use when logging in to this server.
- **Confirm connection type** - The protocol used for connections. Possible values are **http** and **https**.

Once you have entered these values the server definition is stored in your user-level `settings.json` file, and the server appears at the top of the **Recent** folder in the InterSystems Tools view.

If you want to store a password for this server definition, select **Store Password in Keychain** from the context menu for the server in the InterSystems Tools view.  If you do not store a password, users are prompted for a password each time they connect to the server. To remove a password from the keychain, Select **Clear Password from Keychain** from the server context menu. For more information, see [Server Context Menu](../extensionui#server-context-menu).

You can create a configuration for a server that is not currently running.

If you are connecting via a standalone web server which publishes services for more than one InterSystems server you will need to edit the server configuration in your `settings.json` file to add a `pathPrefix` property. See the next section.

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

- **iris-1** - An arbitrary name to identify this server.
- **webServer** - The collection of properties that define the web server through which you will connect. This can either be the InterSystems server's private web server or a standalone web server configured as an InterSystems Web Gateway.
  - **scheme** - The protocol used for connections (http or https).
  - **host** - The host of the web server.
  - **port** - The port number for this web server.
  - **pathPrefix** - Only required when connecting through a standalone web server that publishes the target server's web services under a subfolder.
- **username** - The username to use in logging in to this server.
- **password** - Password for the specified username. Entering the password as plaintext in this file is acceptable only in limited situations with very low need for security. 

If you do not store the password securely in your workstation keychain or add it to the server definition, anyone using the server needs to supply the password. The InterSystems Server Manager provides the following commands for managing stored passwords in the Command Palette:

- **InterSystems Server Manager: Clear Password from Keychain** - Remove the password for a selected server.
- **InterSystems Server Manager: Store Password in Keychain** - Select a server or create a new one, then enter a password.

{: #config-server-conn}
## Configuring a Server Connection

Open the folder where you want client-side files to be located. Select the **ObjectScript Explorer** button on the Activity Bar. Select the **Choose Server and Namespace** button. This action opens a dialog that lets you select a server or create a new one. Once you have selected a server and namespace, connection configuration is complete. VS Code adds the server and namespace to the status bar, as shown in the following screen shot.

![Connection information in the status bar.](../assets/images/action-for-server-start.png "connection information in the status bar")

You cannot create a connection to a server that is not running.

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

- **ns** - Namespace to use on the server
- **server** - Server name as specified in the server configuration
- **active** - Specifies whether the connection is active.

{: #server-actions-menu}
## Add Custom Entries to the Server Actions Menu

Click on the server and namespace in the status bar to open a list of actions you can take for this server:

![Select action for server.](../assets/images/action-for-server.png "select action for server")

You can add custom entries to this list using the `objectscript.conn.links` configuration object, which contains key-value pairs where the key is the label displayed in the menu and the value is the uri to open. The following variables are available for substitution in the uri:

- **${host}** - The hostname of the connected server. For example, `localhost`
- **${port}** - The port of the connected server. For example, `52773`
- **${serverUrl}** - The full connection string for the server. For example, `http://localhost:52773/pathPrefix`
- **${ns}** - The namespace that we are connected to, URL encoded. For example, `%25SYS` or `USER`
- **${namespace}** - The raw `ns` parameter of the connection. For example, `sys` or `user`
- **${classname}** - The name of the currently opened class, or the empty string if the currently opened document is not a class.
- **${classnameEncoded}** - URL encoded version of **\${classname}**.

An example links configuration looks like this:

```json
"objectscript.conn": {
    "links": {
        "Portal Explorer": "${serverUrl}/csp/sys/exp/%25CSP.UI.Portal.ClassList.zen?$NAMESPACE=${ns}",
        "SOAP Wizard": "${serverUrl}/isc/studio/templates/%25ZEN.Template.AddInWizard.SOAPWizard.cls?$NAMESPACE=${ns}"
    },
}
```

And the resulting Server Actions Menu looks like this:

![Server actions with custom links.](../assets/images/server-actions-with-links.png "server actions menu with custom links")
