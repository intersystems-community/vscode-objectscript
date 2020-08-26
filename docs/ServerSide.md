---
layout: default
title: Server-side Editing
permalink: /serverside/
nav_order: 7
---
# Server-side Editing

You can configure the InterSystems ObjectScript extension to edit code directly on the server, using the [multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) VS Code feature. This type of configuration is useful in cases where source code is stored in a Version Control System (VCS) as XML, and you are using source control in Studio using Studio extensions, as provided by `%Studio.Extension.Base`. 

First configure the connection to InterSystems as described in [Configuration](../Configuration).

Use **File > New File** to create a new file. Add content similar to the following example. Note that `my-project` in the `isfs://` uri, should be the same as the name of any folder where there are settings for the connection.

```js
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
```js
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
      "uri": "isfs://myapp?ns=USER",
      "name": "user",
    },
    {
      "uri": "isfs://myapp?ns=%SYS",
      "name": "system",
    },
    {
      "uri": "isfs://user@directserver:port?ns=%SYS",
      "name": "system",
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

## CSP support

To get access to edit CSP files on a server, you can configure uri in format `isfs://myapp{csp_application}?csp`
For example, the following URI gives you access to the content of `/csp/user` CSP application, where flag `csp` is mandatory.

```
"uri": "isfs://myapp/csp/user?csp"
```

Any changes in this virtual folder are saved on the server.

## Filters

There are some more filtering options.

- `isfs://myapp?type=cls`, shows only classes
- `isfs://myapp?type=rtn`, shows only routines, mac, int and inc files
- `isfs://myapp?generated=1`, shows generated files as well as not generated
- `isfs://myapp?filter=%Z*.cls,%z*.cls,%Z*.mac`, comma-delimited list of search options, ignores `type`
- `isfs://myapp?flat=1`, a flat list of files does not split packages as folders.

The options `flat` and `generated` can be combined with each other, and with `type` or `filter`. When `filter` is specified `type` is ignored.