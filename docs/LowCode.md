---
layout: default
title: Low-Code Editors
permalink: /low-code/
nav_order: 11
---

> **Note:** This documentation has been moved to the [InterSystems Documentation site](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_lowcode). This page will be removed at a later date.

# Low-Code Editors

VS Code contains support for low-code editors via its [Custom Editors API](https://code.visualstudio.com/api/extension-guides/custom-editors). As InterSystems redevelops its suite of low-code editors for Interoperability components, support for integration with this extension will be included. This page lists the currently supported low-code editors and describes how to use them in VS Code.

## Supported Editors

The following list contains all InterSystems low-code editors that support integration with VS Code, along with the earliest version of InterSystems IRIS that contains the support:

* Rule Editor (2023.1)

## Opening a Low-Code Editor

To open a low-code editor, first open the class that contains the Interoperability component that you want to edit, right-click on the editor tab and select the `Reopen Editor With...` option:

![Reopen Editor With](../assets/images/reopen-editor-with.png "reopen editor with")

You will then be prompted with a list of editors to choose from:

![Select Editor](../assets/images/low-code-select.png "select editor")

Once you select the editor, it will replace the text editor for the selected class. If the editor cannot be loaded, a modal dialog will be shown that contains the reason and the class will be automatically reopened in the default text editor. A low-code [editor tab](https://code.visualstudio.com/docs/getstarted/userinterface#_tabs) will behave the same as a text editor tab.

## How They Work

This section describes how the low-code editors are integrated in VS Code to create a hassle-free editing experience. Note that while low-code editors are supported for both client-side and server-side workflows, an active server connection is required even when working client-side.

* VS Code sends your credentials to the editor so you don't have to log in again.
* A save, undo, redo or revert action triggered by VS Code (via keyboard shortcuts, for example) will trigger the corresponding action in the editor.
* When the state of the class changes from clean to dirty (or vice versa) in the editor, the underlying text document will also be made dirty/clean.
* When the class is saved or compiled by the editor, VS Code will pull the changes from the server and update the text document.
* If the `objectscript.compileOnSave` setting is enabled and the class was saved by the editor, the class will also be compiled by the editor.

Note that the changes you make in the low-code editor are only synced to the underlying text document when you save them in the editor. Therefore, it is ***strongly*** recommended that you only open and edit the document in one editor (text or low-code) at once to avoid overwriting changes. The low-code editors provide support for server-side source control natively. The underlying text document is kept in sync after saves so changes can be stored in client-side source control.
