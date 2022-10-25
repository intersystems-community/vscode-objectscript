---
layout: default
title: Migrating from Studio
permalink: /studio/
nav_order: 10
---

# Migrating from Studio

The extensions that make up the [InterSystems ObjectScript Extension Pack](../installation/#install-the-intersystems-objectscript-extensions) contain many useful features that make migrating from InterSystems Studio easy. This page highlights a few of them.

## Server-side Editing

VS Code can be configured to edit code directly on a server, which is analagous to Studio's architecture. However, VS Code enhances this workflow with support for having multiple server-namepsaces open at the same time (using VS Code's [multi-root workspace feature](https://code.visualstudio.com/docs/editor/multi-root-workspaces)) and for granularly [filtering the files](../serverside/#filters-and-display-options) shown for each server-namespace. See the [`Server-side Editing` documentation page](../serverside/) for more information on how to configure this feature.

## Server-side Source Control

VS Code supports server-side source control without required any additional configuration. Server-side source control is supported for both server-side and client-side editing. If a source control class is [active](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ASC#ASC_Hooks_creating_and_activating_sc_class), its hooks will be fired automatically for document lifecycle events like creation, first edit, save and deletion. The server source contol menu can also be accessed in these locations:

- The source control icon in the top-right portion of the window when a document is open.
- An open document's context menu.
- A node of the [ObjectScript Explorer's](../extensionui/#objectscript-view) context menu.
- A node of the VS Code [file explorer's](https://code.visualstudio.com/docs/getstarted/userinterface#_explorer) context menu.

## Server-side Projects

VS Code supports using existing Studio projects, as well as the creation, modifcation and deletion of them. See the [`Working with Projects` documentation page](../projects/) for more information about this feature and how to use it.

## Accurate Syntax Coloring

The [InterSystems Language Server extension](https://marketplace.visualstudio.com/items?itemName=intersystems.language-server) leverages VS Code's [semantic tokens API](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide) to provide the same accurate syntax coloring for InterSystems ObjectScript and other embedded languages that Studio users are familiar with. For more information on how to customize the syntax colors for InterSystems tokens, see the [Language Server's README](https://github.com/intersystems/language-server#syntax-color-customization). [A command](../studio/#load-studio-syntax-colors-command) is provided for Windows users to migrate their existing color customizations from Studio.

## Import Server Definitions Command

The [InterSystems Server Manager extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) provides the `Import Servers from Windows Registry` command, which will import any Studio server defintions from your Windows registry into VS Code so you can continue using them without having to do the migration youself. To invoke the command, [open the command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and click the `InterSystems Server Manager: Import Servers from Windows Registry` menu option.

## Load Studio Snippets Command

The [InterSystems ObjectScript extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.vscode-objectscript) provides the `Load Studio Snippets` command, which will load any user defined snippets from Studio into VS Code. It works by reading the locations of Studio user defined snippets files from the Windows registry, converting the snippets contained in those files to VS Code's JSON format and lastly writes the snippets to a new global snippets file called `isc-studio.code-snippets`. This command will only convert snippets for ObjectScript, Class Definition Language (UDL) or HTML; all others will be ignored. To invoke the command, [open the command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and click the `ObjectScript: Load Studio Snippets` menu option.

After loading the snippets it is recommended that you consider opening the generated file and enhancing the snippets so that they take advantage of [features available in VS Code](https://code.visualstudio.com/docs/editor/userdefinedsnippets) that Studio does not support, like tabstops and variable substitution. To open the file, click on the `Open File` button in the success notification box, or click on the Settings gear in the bottom-left corner of the window, select the `Configure User Snippets` menu option, and then select the `isc-studio.code-snippets` file in the dropdown that appears.

## Load Studio Syntax Colors Command

The [InterSystems ObjectScript extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.vscode-objectscript) provides the `Load Studio Syntax Colors` command, which will load the editor background and syntax forgeound colors from Studio into VS Code. It works by reading the color configurations from the Windows registry and storing them in  VS Code's [User Settings](https://code.visualstudio.com/docs/getstarted/settings) as customizations of one of the InterSystems default themes provided by the Language Server extension. The command uses the background color loaded from Studio to determine which default theme it should modify, and will activate the modified theme automatically. This command will not load foreground colors for any syntax tokens that have a custom background color because per-token background colors are not supported in VS Code. This command requires that the [InterSystems Language Server extension](https://marketplace.visualstudio.com/items?itemName=intersystems.language-server) is installed and active. To invoke the command, [open the command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and click the `ObjectScript: Load Studio Syntax Colors` menu option.
