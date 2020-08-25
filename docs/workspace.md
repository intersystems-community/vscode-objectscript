---
layout: default
title: VS Code Workspaces
permalink: /workspace/
nav_order: 3
---
# VS Code Workspaces

To work with VS Code, you need to open a workspace. A VS Code workspace is usually just the root folder of your project. Workspace settings as well as debugging and task configurations are stored in the root folder in a folder called .vscode.

If you need to have more than one root folder in a VS Code workspace, use a feature called Multi-root workspaces. See [Multi-root Workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) in the VS Code documentation.

A multi root workspace has a \*.code-workspace file in the root folder. The file can have any name followed by *.code-workspace*, for example `test.code-workspace`. The .code-workspace file stores information about what folders are in the workspace. Other settings that would otherwise be stored in the settings.json or launch.json file can also be stored in the .code-workspace file. You can optionally have a workspace file even if you are not using multi root.

To edit a *.code-workspace* file in VS Code using the InterSystems ObjectScript extension, select **File > Preferences > Settings** (**Code > Preferences > Settings** on Mac) and select the Workspace option. When you click **Edit in settings.json**, VS Code opens the *.code-workspace* file for that workspace.

The InterSystems ObjectScript extension uses the Multi-root workspaces feature to support ObjectScript development on the InterSystems server. See [Server-side Editing](./ServerSide).