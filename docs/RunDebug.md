---
layout: default
title: Running and Debugging
permalink: /rundebug/
nav_order: 5
---
# Running and Debugging

The InterSystems ObjectScript Extension provides support for ObjectScript debugging. It takes advantage of the debugging capabilities built into VS Code, so you may find these VS Code documentation resources useful:

- [Debugging Intro Video](https://code.visualstudio.com/docs/introvideos/debugging)
- [Debugging User Guide](https://code.visualstudio.com/docs/editor/debugging)

Also, InterSystems Learning Services has produced [a short video](https://learning.intersystems.com/course/view.php?id=1795&ssoPass=1) that walks through the steps in this documentation page that you may find useful.

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

When starting **objectscript launch** debug session, make sure that the file containing the **program** that you are debugging is open in your editor and is the active tab. VS Code will start a debug session with the server of the file in the active editor (the tab that the user is focused on).

Debugging commands and items on the **Run** menu function much as they do for other languages supported by VS Code. For information on VS Code debugging, see the documentation resources listed at the start of this section. 