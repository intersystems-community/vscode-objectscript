---
layout: default
title: Running and Debugging
permalink: /rundebug/
nav_order: 5
---

{: .warning }
This documentation has been moved to the [InterSystems Documentation site](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_debug). This page will be removed at a later date.

# Running and Debugging

The InterSystems ObjectScript Extension provides support for ObjectScript debugging. It takes advantage of the debugging capabilities built into VS Code, so you may find these VS Code documentation resources useful:

- [Debugging Intro Video](https://code.visualstudio.com/docs/introvideos/debugging)
- [Debugging User Guide](https://code.visualstudio.com/docs/editor/debugging)

Also, InterSystems Learning Services has produced [a short video](https://learning.intersystems.com/course/view.php?id=1795&ssoPass=1) which walks through the steps in this documentation page that you may find useful.

## Debug Configurations

In order to run or debug an ObjectScript class or routine or attach to a running process, you must create a debug configuration. Some other languages default to running the currently active file, but to run ObjectScript, you must specify the routine or ClassMethod to use or the running process to attach to.

Click the run button in the Activity Bar:

![Run button.](../assets/images/run.png "run button")

If no debug configurations are available, you are prompted to create one:

![Create debug configuration.](../assets/images/CreateLaunchConfig.png "create debug configuration")

Clicking the link opens a dialog containing a list of debug environments. Select **ObjectScript Debug**. 

![Select debug environment.](../assets/images/debug-environment.png "select debug environment")

Once you have chosen a debug environment, VS Code creates and opens a `launch.json` file containing the following default content:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "objectscript",
            "request": "launch",
            "name": "XDebug"
        }
    ]
}
```

These attributes are mandatory for any debug configuration:

- **type** - Identifies the type of debugger to use. In this case, `objectscript`, supplied by the InterSystems ObjectScript extension.
- **request** - Identifies the type of action for this launch configuration. Possible values are `launch` and `attach`.
- **name** - An arbitrary name to identify the configuration. This name appears in the Start Debugging drop down list.

In addition, for an **objectscript launch** configuration, you need to supply the attribute **program**, which specifies the routine or ClassMethod to run when launching the debugger, as shown in the following example:

```json
"launch": {
	"version": "0.2.0",
	"configurations": [
      
		{
			"type": "objectscript",
			"request": "launch",
			"name": "ObjectScript Debug HelloWorld",
			"program": "##class(Test.MyClass).HelloWorld()",
		},
		{
			"type": "objectscript",
			"request": "launch",
			"name": "ObjectScript Debug GoodbyeWorld",
			"program": "##class(Test.MyOtherClass).GoodbyeWorld()",
		},
	]
}
```

For an **objectscript attach** configuration, you may supply the following attributes:

- **processId** - Specifies the ID of process to attach to as a `string` or `number`. Defaults to `"${command:PickProcess}"`, which provides a dropdown list of process ID's to attach to at runtime.
- **system** - Specifies whether to allow attaching to system process. Defaults to `false`.

The following example shows multiple valid **objectscript attach** configurations:

```json
"launch": {
	"version": "0.2.0",
	"configurations": [
		{
			"type": "objectscript",
			"request": "attach",
			"name": "Attach 1",
			"processId": 5678
		},
		{
			"type": "objectscript",
			"request": "attach",
			"name": "Attach 2",
			"system": true
		},
	]
}
```

## Starting a Debugging Session

You can select a debug configuration from the list VS Code provides in the Run and Debug field at the top of the debug side bar:

![Select debug configuration.](../assets/images/select-config.png "select debug configuration")

Clicking on the green arrow runs the currently selected debug configuration.

When starting **objectscript launch** debug session, make sure that the file containing the **program** that you are debugging is open in your editor and is the active tab. VS Code will start a debug session with the server of the file in the active editor (the tab that the user is focused on). This also applies to **objectscript attach** debug sessions.

This extension uses WebSockets to communicate with the InterSystems server during debugging. If you are experiencing issues when trying to start a debugging session, check that the InterSystems server's web server allows WebSocket connections.

Debugging commands and items on the **Run** menu function much as they do for other languages supported by VS Code. For information on VS Code debugging, see the documentation resources listed at the start of this section. 

{: #rest}
## Debugging a REST Service

The InterSystems ObjectScript Extension provides a [Webview](https://code.visualstudio.com/api/extension-guides/webview)-based graphical user interface that allows you to send a REST request and automatically start debugging the process on the server that handles it. With the InterSystems file that you want to debug open in the active text editor, you can show the GUI using the `Debug REST Service...` command. The command can be accessed in the command palette, editor context menu or editor tab context menu. Follow the directions in the GUI to build your REST request and click the `Start Debugging` button to send the request and connect the debugger. Be sure you have a breakpoint set somewhere in the code that handles the request.

## Troubleshooting Debugger Issues

If you are experiencing issues using the debugger, please follow these steps before opening an issue on GitHub. Note that the trace global may contain confidential information, so you should review the contents and mask/remove anything that you want to keep private.

1. Open a terminal on your server and `zn` to the namespace containing the class or routine you are debugging.
2. Run the command `Kill ^IRIS.Temp.Atelier("debug")`, then `Set ^IRIS.Temp.Atelier("debug") = 1` to turn on the Atelier API debug logging feature. If you are on Caché or Ensemble, the global is `^CacheTemp.ISC.Atelier("debug")`.
3. In VS Code, start a debugging session using the configuration that produces the error.
4. Once the error appears, copy the contents of the `^IRIS.Temp.Atelier("debug")` global and add it to your GitHub issue.
5. After you capture the log, run the command `Kill ^IRIS.Temp.Atelier("debug")`, then `Set ^IRIS.Temp.Atelier("debug") = 0` to turn logging back off again.

{: #terminal}
## Using the WebSocket Terminal

The InterSystems ObjectScript Extension provides support for a WebSocket-based command-line interface for executing ObjectScript commands on a connected server. The server can be on the same system as VS Code, or a remote system. This feature is only supported when connecting to InterSystems IRIS version 2023.2 or later. 

The WebSocket terminal supports the following features:

- VS Code's [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) feature so your command history and output will be captured by VS Code and can be accessed by its UI.
- Multi-line editing. An additional editable line will be added when the user presses `Enter` and there are unclosed `{` or `(` in the command input.
- Syntax coloring for command input. (Toggleable using the `objectscript.webSocketTerminal.syntaxColoring` setting)
- Syntax checking for entered command input with detailed error messages reported along with the standard `<SYNTAX>` error.
- Many features of the [standard terminal](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GTER_intro), including:
  - The Read command
  - Interrupts (`Ctrl-C`)
  - Namespace switches
  - [Custom terminal prompts](https://irisdocs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?LIBRARY=%25SYS&CLASSNAME=%25SYSTEM.Process#TerminalPrompt) (except code 7)
  - Shells like SQL (`Do $SYSTEM.SQL.Shell()`) and Python (`Do $SYSTEM.Python.Shell()`) 

The WebSocket terminal does not support [command-line debugging](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GCOS_debug) since the InterSystems ObjectScript Extension contains an interactive debugger. Users are also discouraged from using [routine editing commands](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=RCOS_ZCOMMANDS) since VS Code with the InterSystems ObjectScript Extension Pack provides an excellent ObjectScript editing experience.

Note that the terminal process is started using the JOB command, so if you have a [`^%ZSTART` routine](https://docs.intersystems.com/iris20223/csp/docbook/Doc.View.cls?KEY=GSTU_customize_startstop) enabled the `JOB` subroutine will be called at the start of the process, not `LOGIN` like the standard terminal. Also, the [`ZWELCOME` routine](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GTER_intro#GTER_zwelcome) will not be run before the first command prompt is shown.

The WebSocket terminal can be opened from [the command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) using the `ObjectScript: Launch WebSocket Terminal` command. The WebSocket terminal connection will be established using the current server connection. A WebSocket terminal connection can also be opened from the [Terminal Profiles menu](https://code.visualstudio.com/docs/terminal/basics#_terminal-shells).

## Troubleshooting WebSocket Terminal Issues

If you are experiencing issues using the WebSocket terminal, please follow these steps before opening an issue on GitHub. Note that the trace global may contain confidential information, so you should review the contents and mask/remove anything that you want to keep private.

1. Open a standard terminal on your server and `zn` to the namespace containing the class or routine you are debugging.
2. Run the command `Kill ^IRIS.Temp.Atelier("terminal")`, then `Set ^IRIS.Temp.Atelier("terminal") = 1` to turn on the Atelier API terminal logging feature.
3. In VS Code, launch the WebSocket terminal and run the commands that produce the error.
4. Once the error appears, copy the contents of the `^IRIS.Temp.Atelier("terminal")` global and add it to your GitHub issue.
5. After you capture the log, run the command `Kill ^IRIS.Temp.Atelier("terminal")`, then `Set ^IRIS.Temp.Atelier("terminal") = 0` to turn logging back off again.
