---
layout: default
title: Running and Debugging
permalink: /rundebug/
nav_order: 4
---
# Running and Debugging

The InterSystems ObjectScript Extension provides support for ObjectScript debugging. It takes advantage of the debugging capabilities built into VS Code, so you may find these VS Code documentation resources useful:

- [Node.js debugging in VS Code](https://code.visualstudio.com/docs/editor/debugging)
- [Debugging](https://code.visualstudio.com/docs/editor/debugging)

## Launch Configurations

In order to run or debug an ObjectScript class or routine, you must create a launch configuration. Some other languages default to running the currently active file, but to run ObjectScript, you must specify the routine or ClassMethod to use.

Click the run button in the Activity Bar:

![Run button.](../assets/images/run.png "run button")

If no launch configurations are available, you are prompted to create one:

![Create launch configuration.](../assets/images/CreateLaunchConfig.png "create launch configuration")

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

These attributes are mandatory for any launch configuration:

- **type** - Identifies the type of debugger to use. In this case, `objectscript`, supplied by the InterSystems ObjectScript extension.
- **request** - Identifies the type of action for this launch configuration. Possible values are `launch` and `attach`.
- **name** - An arbitrary name to identify the configuration. This name appears in the Start Debugging drop down list.

In addition, for an **objectscript** configuration, you need to supply the attribute **program**, which specifies the routine or ClassMethod to run when launching the debugger, as shown in the following example:

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

## Launching a ClassMethod or Routine

You can select a launch configuration from the list VS Code provides in the Run and Debug field at the top of the debug side bar:

![Select launch configuration.](../assets/images/select-config.png "select launch configuration")

Clicking on the green arrow runs the currently selected launch configuration.

Debugging commands and items on the **Run** menu function much as they do for other languages supported by VS Code. For information on VS Code debugging, see the documentation resources listed at the start of this section. 