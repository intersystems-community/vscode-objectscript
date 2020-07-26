---
layout: default
title: Server-side editing
permalink: /server-side-editing/
nav_order: 6
---
# Server-side editing

It is possible to configure `VSCode-ObjectScript` to edit code directly on the server, which is useful in cases where source code is stored in SCM as XML and managed using Studio Source Control hooks.

You can configure this mode of operation using the [multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) feature from VSCode.

First, you should configure the connection to InterSystems as described [here](https://github.com/daimor/vscode-objectscript/wiki/Connect-to-InterSystems-IRIS).

Add a file with extension `.code-workspace`, with content similar to this.

```JSON
{
    "folders": [
        {
            "uri": "isfs://my-local-place",
        }
    ],
    "settings": {
        "objectscript.conn": {
            "active": true,
            "host": "127.0.0.1",
            "port": 57332,
            "username": "_SYSTEM",
            "ns": "USER",
            "https": false
        },
        "objectscript.serverSideEditing": true
    }
}
```

When you save this file, VSCode shows you a button with an offer to open this as a workspace. Do it.

With the next start of VSCode, you see two folders in the root with the names described in the `.code-workspace` file. The `server` folder, if expanded, shows any code on configured server and namespace, routines and classes in one place. You can now edit this code. If you have SourceControl class, it should be configured to export files in the same location which is used in the VSCode workspace.

Example with connection to different namespaces on the same server:

```JSON
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

To get access to edit CSP files on a server, you can configure uri in the format `isfs://myapp{csp_application}?csp`
For example: 

```
"uri": "isfs://myapp/csp/user?csp"
```

This gives you access to the content of the `/csp/user` CSP application, where the flag `csp` is mandatory. Any changes in this virtual folder are saved on the server.

## Filters

There are some more filtering options.

- `isfs://myapp?type=cls`, shows only classes
- `isfs://myapp?type=rtn`, shows only routines, mac, int and inc files
- `isfs://myapp?generated=1`, shows generated files as well as not generated
- `isfs://myapp?filter=%Z*.cls,%z*.cls,%Z*.mac`, is a comma-delimited list of search options, ignores `type`
- `isfs://myapp?flat=1`, is a flat list of files that does not split packages as folders.
- `isfs://myapp?ns=<namespace>&flat=1&generated=1&filter=%sqlcq.<namespace>*.cls, %sqlcq.<namespace>*.int`, view cached query class code and modify the .int code. Replace `<namespace>` as appropriate.

`flat` and `generated` can be combined with each other, and with `type` or `filter`. When `filter` is specified `type` is ignored.
