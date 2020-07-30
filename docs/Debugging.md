---
layout: default
title: Debugging
permalink: /debugging/
nav_order: 5
---
# Debugging

Example of `.vscode/launch.json` file:

```json
{
// Use IntelliSense to learn about possible attributes.
// Hover to view descriptions of existing attributes.
// For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
  "version": "0.2.0",
  "configurations": [
    {
      "type": "objectscript",
      "request": "launch",
      "name": "ObjectScript Debug Class",
      "program": "##class(User.Test).Test()",
    },
    {
      "type": "objectscript",
      "request": "launch",
      "name": "ObjectScript Debug Routine",
      "program": "^test",
    },
    {
      "type": "objectscript",
      "request": "attach",
      "name": "ObjectScript Attach",
      "processId": "${command:PickProcess}",
      "system": true
    }
  ]
}
```

See how it works for routines: 
![](https://community.intersystems.com/sites/default/files/inline/images/images/debug_routine.gif)

For classes: 
![](https://community.intersystems.com/sites/default/files/inline/images/images/debug_class.gif)

And when attached to a process:
![](https://community.intersystems.com/sites/default/files/inline/images/images/debug_attach.gif)