---
layout: default
title: Configuration
permalink: /configuration/
nav_order: 5
---
# Configuration

The settings that define an InterSystems IRIS server and the connection to the server are crucial to the functioning of VS Code in developing in ObjectScript.

## Configuring a Server

First, configure one or more servers. Open the settings editor by selecting **File > Preferences > Settings** (**Code > Preferences > Settings** on Mac) from the menu. Select the **User** or **Workspace** settings level by selecting it at the top of the settings window. For example, the following screen shot shows Workspace selected:

![Workspace selected.](../assets/images/ClickWorkspace.png "workspace selected")

Find Extensions in the list in the left pane of the editor window, click to open, then select InterSystems Server Manager from the list to find the correct place in the settings UI. The following screen shot shows InterSystems Server Manager selected:

![Select server manager.](../assets/images/ServerManagerSelect.png "select server manager")

And this screen shot shows Server Manager area of the edit pane:

![Server manager settings.](../assets/images/ServerManagerSettings.png "server manager settings")

You need to edit the server configuration in the settings.json file, so your only option is to click *Edit in settings.json*. 

To configure a server, enter code something like this:

```js
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

- **test** - an arbitrary name to identify this server
- **webServer** - The collection of properties that define the web server.
- **scheme** - The protocol used for connections.
- **host** - the host for this server
- **port** - the WebServer port number for this server
- **username** - the username to use in logging in to this server.
- **password** - password for the specified username. Entering the password in this file is acceptable only in limited situations with very low need for security. 

If you do not add a password to the server definition, anyone using the server needs to supply the password. Or, you can store the password securely in the system Keychain. The InterSystems Server Manager adds the following commands for managing stored passwords to the Command Palette:

- **InterSystems Server Manager: Clear Password from Keychain** - remove password for selected server
- **InterSystems Server Manager: Store Password in Keychain** - select a server and enter a password
- **InterSystems Server Manager: Test Server Selection**
- **InterSystems Server Manager: Test Server Selection (flush cached credentials)**
- **InterSystems Server Manager: Test Server Selection with Details**

## Configuring a Server Connection

Select InterSystems ObjectScript from the settings editor extensions list. You need to edit the server configuration in the settings.json file, so your click *Edit in settings.json* under the heading **Objectscript: conn**. 

You should enter code something like this:

```js
"objectscript.conn": {
	"ns": "USER",
	"server": "tst",
    "active": true,
},
```
The components of this server definition are:

- **ns** - namespace to use on the server
- **server** - server name as specified in the server configuration
- **active** - specifies whether the connection is active.

## Configuring Export from Server

Select InterSystems ObjectScript from the settings editor extensions list. Find the section labeled **Objectscript: export**.  You can edit many of the export settings in the settings editor. For others you need to edit the settings.json file.

You export configuration looks something like this:

```js
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

- **folder** - Folder for source code.
- **addCategory** - Add a category folder to the export path.
- **atelier** - Export source code as Atelier does, with packages placed in subfolders.
- **generated** - Export generated source code files.
- **filter** - An SQL filter that can be used to match the names.
- **category** - Specifies a category of source code to export: CLS = classes; RTN = routines; CSP = csp files; OTH = other. The default is *, export everything.
- **noStorage** - Strip the storage XML on export. This is useful for multiple systems.
- **dontExportIfNoChanges** - Don't update the local file if the content is identical to what is on the server.
- **maxConcurrentConnections** - The maximum number of export connections. (0 = Unlimited)