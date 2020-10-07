---
layout: default
title: Configuration
permalink: /configuration/
nav_order: 5
---
# Configuration

The settings that define an InterSystems IRIS server and the connection to the server are crucial to the functioning of VS Code in developing in ObjectScript.

Open the VS Code Settings Editor by selecting **File > Preferences > Settings** (**Code > Preferences > Settings** on macOS) from the menu, or by pressing <kbd>Ctrl/Cmd</kbd>+<kbd>,</kbd> (comma).

> Pro tip: If you know the name of the setting you want to change, or a phrase that occurs in its descrition, start typing this into the 'Search settings' field, for example `intersystems` or `objectscript` or `udl`.

## Configuring a Server

First, configure one or more servers. Open the settings editor by selecting **File > Preferences > Settings** (**Code > Preferences > Settings** on macOS) from the menu, or by pressing <kbd>Ctrl/Cmd</kbd>+<kbd>,</kbd> (comma).

Select the **User** or **Workspace** settings level by selecting it at the top of the settings window. **User** level is normally selected by default, and where to put your server definitions so they can be used by any of your workspaces. You can learn more about the difference between these levels in the [Settings](../settings) section of this documentation.

The following screen shot shows **Workspace** selected:

![Workspace selected.](../assets/images/ClickWorkspace.png "workspace selected")

Find **Extensions** in the list in the left pane of the editor window, click to open, then select **InterSystems Server Manager** from the list to find the correct place in the settings UI.

If you don't see this entry, check that you have [installed](../installation) that extension and that it has not been disabled.

The following screen shot shows InterSystems Server Manager selected:

![Select server manager.](../assets/images/ServerManagerSelect.png "select server manager")

And this screen shot shows the Server Manager area of the edit pane:

![Server manager settings.](../assets/images/ServerManagerSettings.png "server manager settings")

The **InterSystems: Servers** setting is a structured object that is too complex to be edited in the settings UI, so your only option is to click *Edit in settings.json*.

If you are defining this setting for the first time, a default settings object will be offered for you to amend. A completion list may also appear. Press <kbd>Esc</kbd> to dismiss this.

To configure a server, enter something like this:

```json
"intersystems.servers": {	
	"test": {
		"webServer": {
			"scheme": "http",
			"host": "localhost",
			"port": 52774,
		},
	  "username": "_SYSTEM",
	},
},
```

The components of this server definition are:

- **test** - your choice of name to identify this InterSystems server in your settings. The name can only contain lowercase 'a' to 'z', digits 0 to 9, and limited punctuation (`-._~`).
- **webServer** - a collection of properties that define its associated web server, as follows:
    - **scheme** - protocol used for connections (http or https).
    - **host** - hostname or IP address of the web server server.
    - **port** - port number of this web server. This is the same port as you connect to when using the InterSystems Management Portal from your browser. If you already use InterSystems Studio do not confuse the web server port number with the port number Studio connects to (sometimes called the superserver).
    - **username** - username to use when logging in to this server. This is optional. If omitted the user will be prompted for it at connection time, then cached for the session.
    - **password** - password for the specified username. This is optional, and the example above omits it. Storing the password in a settings file should only be done in limited situations where there is very low need for security or where default credentials are being used (e.g. `_SYSTEM`/`SYS`). 

If you do not add a password to the server definition, the user will need to enter the password when connecting. It will then then be cached for the session. Alternatively you can store the password securely in keychain of your local workstation. The InterSystems Server Manager extension adds the following commands to the Command Palette for managing stored passwords:

- **InterSystems Server Manager: Store Password in Keychain** - select a server and enter a password.
- **InterSystems Server Manager: Clear Password from Keychain** - remove password for selected server.

## Configuring a Server Connection

Select **InterSystems ObjectScript** from the settings editor's **Extensions** list. You need to edit the connection configuration in the settings.json file, so click *Edit in settings.json* under the heading **Objectscript: conn**. 

You should enter code something like this:

```json
"objectscript.conn": {
    "server": "test",
	"ns": "USER",
    "active": true,
},
```
The components of this connection definition are:

- **server** - server name as specified in the `intersystems.servers` configuration described in the previous section of these instructions.
- **ns** - namespace to use on the server.
- **active** - specifies whether the connection is active.

## Configuring Export from Server

Default settings for export are suitable for many situations, but if you need to adjust them here's how.

Select **InterSystems ObjectScript** from the settings editor **Extensions** list. Find the section labeled **Objectscript: export**.  You can change many of the export settings directly in the settings editor. For others you need to edit the settings.json file.

When viewed in JSON format your export configuration looks something like this:

```json
"objectscript.export": {	
    "folder": "",
    "addCategory": true,
    "atelier": true,
    "generated": false,
    "filter": "",
    "category": "*",
    "noStorage": false,
    "dontExportIfNoChanges": false,
    "maxConcurrentConnections": 0
},
```
The components of this export definition are: 

- **folder** - Folder for source code within workspace.
- **addCategory** - Add a category folder to the beginning of the export path.
- **atelier** - Export source code as Atelier did it, with packages as subfolders.
- **generated** - Export generated source code files, such as INTs generated from classes.
- **filter** - SQL filter to limit what to export.
- **category** - Category of source code to export: `CLS` = classes; `RTN` = routines; `CSP` = csp files; `OTH` = other. The default is `*` which exports everything.
- **noStorage** - Strip the storage definition on export. Can be useful when working across multiple systems.
- **dontExportIfNoChanges** - Do not rewrite the local file if the content is identical to what came from the server.
- **maxConcurrentConnections** - The maximum number of concurrent export connections. (0 = unlimited)
