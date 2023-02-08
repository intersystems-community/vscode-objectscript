---
layout: default
title: Migrating from Studio
permalink: /studio/
nav_order: 10
---

# Migrating from Studio

The extensions that make up the [InterSystems ObjectScript Extension Pack](../installation/#install-the-intersystems-objectscript-extensions) contain many useful features that make migrating from InterSystems Studio easy. This page highlights a few of them.

## Server-side Editing

VS Code can be configured to edit code directly on a server, which is analogous to Studio's architecture. However, VS Code enhances this workflow with support for having multiple server-namespaces open at the same time (using VS Code's [multi-root workspace feature](https://code.visualstudio.com/docs/editor/multi-root-workspaces)) and for granularly [filtering the files](../serverside/#filters-and-display-options) shown for each server-namespace. See the [`Server-side Editing` documentation page](../serverside/) for more information on how to configure this feature.

## Server-side Source Control

VS Code supports server-side source control without requiring any additional configuration. Server-side source control is supported for both server-side and client-side editing. If a source control class is [active](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ASC#ASC_Hooks_creating_and_activating_sc_class), its hooks will be fired automatically for document lifecycle events like creation, first edit, save and deletion. The server source contol menu can also be accessed in these locations:

- The source control icon in the top-right portion of the window when a document is open.
- An open document's context menu.
- A node of the [ObjectScript Explorer's](../extensionui/#objectscript-view) context menu.
- A node of the VS Code [Explorer's](https://code.visualstudio.com/docs/getstarted/userinterface#_explorer) context menu.

## Server-side Projects

VS Code supports using existing Studio projects, as well as the creation, modification and deletion of them. See the [`Working with Projects` documentation page](../projects/) for more information about this feature and how to use it.

## Accurate Syntax Coloring

The [InterSystems Language Server extension](https://marketplace.visualstudio.com/items?itemName=intersystems.language-server) leverages VS Code's [semantic tokens API](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide) to provide the same accurate syntax coloring for InterSystems ObjectScript and other embedded languages that Studio users are familiar with. For more information on how to customize the syntax colors for InterSystems tokens, see the [Language Server's README](https://github.com/intersystems/language-server#syntax-color-customization). [A command](../studio/#load-studio-syntax-colors-command) is provided for Windows users to migrate their existing color customizations from Studio.

## Import Server Definitions Command

The [InterSystems Server Manager extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) provides the `Import Servers from Windows Registry` command, which will import any Studio server defintions from your Windows registry into VS Code so you can continue using them without having to do the migration youself. To invoke the command, [open the command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette), find the `InterSystems Server Manager: Import Servers from Windows Registry` menu option and run it.

## Load Studio Snippets Command

The [InterSystems ObjectScript extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.vscode-objectscript) provides the `Load Studio Snippets` command, which will load any user defined snippets from Studio into VS Code. It works by reading the locations of Studio user defined snippets files from the Windows registry, converting the snippets contained in those files to VS Code's JSON format and lastly writing the snippets to a new global snippets file called `isc-studio.code-snippets`. This command will only convert snippets for ObjectScript, Class Definition Language (UDL) or HTML; all others will be ignored. To invoke the command, [open the command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and run the `ObjectScript: Load Studio Snippets` option.

After loading the snippets it is recommended that you consider opening the generated file and enhancing the snippets so that they take advantage of [features available in VS Code](https://code.visualstudio.com/docs/editor/userdefinedsnippets) that Studio does not support, like tabstops and variable substitution. To open the file, click on the `Open File` button in the success notification box, or click on the Settings gear in the bottom-left corner of the window, select the `Configure User Snippets` menu option, and then select the `isc-studio.code-snippets` file in the dropdown that appears.

## Load Studio Syntax Colors Command

The [InterSystems ObjectScript extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.vscode-objectscript) provides the `Load Studio Syntax Colors` command, which will load the editor background and syntax foreground colors from Studio into VS Code. It works by reading the color configurations from the Windows registry and storing them in VS Code's [User Settings](https://code.visualstudio.com/docs/getstarted/settings) as customizations of one of the InterSystems default themes provided by the Language Server extension. The command uses the background color loaded from Studio to determine which default theme it should modify, and will activate the modified theme automatically. This command will not load foreground colors for any syntax tokens that have a custom background color because per-token background colors are not supported in VS Code. This command requires that the [InterSystems Language Server extension](https://marketplace.visualstudio.com/items?itemName=intersystems.language-server) is installed and active. To invoke the command, [open the command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and click the `ObjectScript: Load Studio Syntax Colors` option.

## New File Commands

The [InterSystems ObjectScript extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.vscode-objectscript) provides commands for creating new Interoperability classes. Commands are provided for Business Operation, Business Process, Business Rule, Business Service and Data Transformation classes. These commands are modeled after the wizards in Studio's [`File` &rarr; `New...` &rarr; `Production` menu](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GSTD_Commands#GSTD_Commands_File). The commands are shown in the `New File...` menu, which can be opened from the `File` menu (`File` &rarr; `New File...`) or the `Get Started` welcome page.

## Keyboard Shortcuts

In general, VS Code keyboard shortcuts are infinitely customizable <a href="https://code.visualstudio.com/docs/getstarted/keybindings">as described in the docs</a>. However, the IDE comes configured with a number of shortcuts that match Studio. <a href="https://code.visualstudio.com/docs/getstarted/keybindings#_keyboard-shortcuts-reference">Download a cheat sheet here</a>.  

This section provides a mapping table for Studio users to more quickly adapt your shortcut muscle memory from Studio to VS Code with the ObjectScript extension.

<style>
  td, th {
    vertical-align: "top";
  }
</style>
### General 

<table>
    <colgroup>
       <col span="1" style="width: 15%;">
       <col span="1" style="width: 15%;">
       <col span="1" style="width: 30%;">
       <col span="1" style="width: 40%;">
    </colgroup>
  <thead>
    <tr>
      <th>Studio</th>
      <th>VS Code</th>
      <th>Action</th>
      <th>VS Code Notes</th>
    </tr>
  </thead>
  <tbody>
 <tr>
  <td>F8</td>
  <td>F11</td>
  <td>Toggles Full Screen Display of Studio menus and editor window.</td>
  <td></td>
 </tr>
 <tr>
  <td>Ctrl+N</td>
  <td>Ctrl+N</td>
  <td>New Document</td>
  <td></td>
 </tr>
 <tr>
  <td>Ctrl+O</td>
  <td>Ctrl+O</td>
  <td>Open Document</td>
  <td></td>
 </tr>
 <tr>
  <td>Ctrl+Shift+O</td>
  <td>Ctrl+Shift+O</td>
  <td>Open Project</td>
  <td>Opens a folder on-disk. If you're not using client-side source control, open a Studio project from Objectscript pane.</td>
 </tr>
 <tr>
  <td>Ctrl+P</td>
  <td>Ctrl+P</td>
  <td>Print</td>
  <td></td>
 </tr>
 <tr>
  <td>Ctrl+S</td>
  <td>Ctrl+S</td>
  <td>Save</td>
  <td></td>
 </tr>
 <tr>
  <td>Ctrl+Shift+I</td>
  <td></td>
  <td>Export</td>
  <td>For client-side editing, use the <code>Export Code from Server</code> command from the command palette or export from the <a href="../extensionui/#objectscript-view">ObjectScript Explorer</a>.</td>
 </tr>
 <tr>
  <td>Ctrl+I</td>
  <td></td>
  <td>Import Local</td>
  <td>For client-side editing, files are imported on save by default. You can also use the <code>Import and Compile</code> command in the file explorer content menu. For server-side editing, right-click on an <code>isfs</code> workspace folder and select the <code>Import Local Files...</code> command.</td>
 </tr>
  </tbody>
</table>

### Display

<table>
    <colgroup>
       <col span="1" style="width: 15%;">
       <col span="1" style="width: 15%;">
       <col span="1" style="width: 30%;">
       <col span="1" style="width: 40%;">
    </colgroup>
    <thead>
    <tr>
      <th>Studio</th>
      <th>VS Code</th>
      <th>Action</th>
      <th>VS Code Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ctrl++</td>
      <td>Ctrl+K Ctrl+J, Ctrl+K Ctrl+0</td>
      <td>Expand, Collapse All</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Left Select plus icon</td>
      <td>Ctrl+K Ctrl+], Ctrl+K Ctrl+[</td>
      <td>Expand, Collapse All Block Sections</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Shift+V</td>
      <td>Ctrl+Shift+V</td>
      <td>View Others. Opens documents related to the current document, such as MAC or INT routines.</td>
      <td></td>
    </tr>
    <tr>
      <td>&#8997;2</td>
      <td>Ctrl+Shift+U</td>
      <td>Toggle Output window display</td>
      <td></td>
    </tr>
    <tr>
      <td>&#8997;5</td>
      <td></td>
      <td>Toggles Code Snippets window
      display</td>
      <td>Code Snippets exist in VS Code but there's no UI.</td>
    </tr>
    <tr>
      <td>&#8997;6</td>
      <td>Ctrl+Shift+F</td>
      <td>Toggles Find in Files window
      display</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+&#8997;+, Ctrl+&#8997;-</td>
      <td>Ctrl++, Ctrl+-</td>
      <td>Increase, Decrease Font</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+&#8997;Space</td>
      <td>Ctrl+Shift+P<br>(start typing render)</td>
      <td>Toggles display of Whitespace Symbols, spaces, newlines, and tabs</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+B</td>
      <td>always on</td>
      <td>Toggle Bracket Matching</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Tab</td>
      <td>Ctrl+Shift+]</td>
      <td>Next Window</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Shift+Tab</td>
      <td>Ctrl+Shift+[</td>
      <td>Previous Window</td>
      <td></td>
    </tr>
  </tbody>
</table>

### Navigation

<table>
  <colgroup>
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 30%;">
      <col span="1" style="width: 40%;">
  </colgroup>
  <thead>
    <tr>
      <th>Studio</th>
      <th>VS Code</th>
      <th>Action</th>
      <th>VS Code Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Home, End</td>
      <td>Home, End</td>
      <td>Go To Beginning, End of Line</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Home, Ctrl+End</td>
      <td>Ctrl+Home, Ctrl+End</td>
      <td>Go To Beginning, End of Document</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+-, Ctrl+Shift+-</td>
      <td>Alt &#8678;| Alt &#8680;</td>
      <td>Go Back, Forward</td>
      <td></td>
    </tr>
    <tr>
      <td>PgUp, PgDn</td>
      <td>PgUp, PgDn</td>
      <td>Page Up, Down</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+PgUp, Ctrl+PgDn</td>
      <td>&#8997;PgUp, &#8997;PgDn</td>
      <td>Go to top, bottom of visible page</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+&#8595;| Ctrl+&#8593;</td>
      <td>Ctrl+&#8595;| Ctrl+&#8593;</td>
      <td>Scroll Down, Up</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+G</td>
      <td></td>
      <td>Goto</td>
      <td>You can use <code>Ctrl-T</code> to go to a class member. More information can be found in the <a href="https://code.visualstudio.com/docs/editor/editingevolved#_open-symbol-by-name">VS Code docs</a>.</td>
    </tr>
    <tr>
      <td>Ctrl+F3, Ctrl+Shift+F3</td>
      <td>F8, Shift+F8</td>
      <td>Go To Next, Previous Error</td>
      <td></td>
    </tr>
    <tr>
      <td>&#8997;F3, &#8997;Shift+F3</td>
      <td>F8, Shift+F8</td>
      <td>Go to Next, Previous Warning</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+]</td>
      <td>Ctrl-Shift-\</td>
      <td>Go To Bracket</td>
      <td></td>
    </tr>
   </tbody>
</table>

### Editing

<table>
  <colgroup>
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 30%;">
      <col span="1" style="width: 40%;">
  </colgroup>
  <thead>
    <tr>
      <th>Studio</th>
      <th>VS Code</th>
      <th>Action</th>
      <th>VS Code Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ctrl+Delete</td>
      <td></td>
      <td>Delete Next Word or to End of Word</td>
      <td>Try an extension such as <a href="https://marketplace.visualstudio.com/items?itemName=lfs.vscode-emacs-friendly" target="new">Emacs Friendly Keymap</a></td>
    </tr>
    <tr>
      <td>Ctrl+Backspace or Ctrl+Shift+Delete</td>
      <td></td>
      <td>Delete Previous Word or to Start of Word</td>
      <td>Try an extension such as <a href="https://marketplace.visualstudio.com/items?itemName=lfs.vscode-emacs-friendly" target="new">Emacs Friendly Keymap</a></td>
    </tr>
    <tr>
      <td>Ctrl+Shift+L</td>
      <td>Ctrl+Shift+K</td>
      <td>Delete Line</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+C or Ctrl+Insert</td>
      <td>Ctrl+C</td>
      <td>Copy</td>
      <td></td>
    </tr>
    <tr>
      <td>Shift+Delete or Ctrl+X</td>
      <td>Ctrl+X</td>
      <td>Cut</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+L</td>
      <td>Ctrl+X</td>
      <td>Cut Line</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+V or Shift+Insert</td>
      <td>Ctrl+V</td>
      <td>Paste</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+A</td>
      <td>Ctrl+A</td>
      <td>Select All</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z</td>
      <td>Ctrl+Z, Ctrl+Shift+Z</td>
      <td>Undo, Redo</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Space</td>
      <td>Ctrl+Space</td>
      <td>Show Studio Assist Popup/Trigger Code Completion</td>
      <td>In VS Code, code completion will pop up as you type so using this keybinding is often not necessary.</td>
    </tr>
    <tr>
      <td>Ctrl+~</td>
      <td></td>
      <td>Toggle Tab Expansion</td>
      <td>Use indent menu in bottom bar.</td>
    </tr>
    <tr>
      <td>Ctrl+U, Ctrl+Shift+U</td>
      <td></td>
      <td>Uppercase, Lowercase Selection</td>
      <td>Try an extension such as <a href="https://marketplace.visualstudio.com/items?itemName=wmaurer.change-case" target="new">change-case</a></td>
    </tr>
    <tr>
      <td>Ctrl+&#8997;U</td>
      <td></td>
      <td>Titlecase (Initial Caps) Selection</td>
      <td>Try an extension such as <a href="https://marketplace.visualstudio.com/items?itemName=wmaurer.change-case" target="new">change-case</a></td>
    </tr>
    <tr>
      <td>Ctrl+(</td>
      <td>(</td>
      <td>Insert Open and Close Parentheses. (Does not work on German and Swiss keyboards.*)</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+{</td>
      <td>{</td>
      <td>Insert Open and Close Braces.</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+=</td>
      <td>Ctrl+Shift+P (type format...)</td>
      <td>Indentation Cleanup. Cleans up indentation on a selected block of whole lines of text.</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+/, Ctrl+Shift+/</td>
      <td>Ctrl+/</td>
      <td>Comment, Uncomment Line or block of text</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+&#8997;/, Ctrl+Shift+&#8997;/</td>
      <td>Ctrl+/</td>
      <td>Comment Markers Added to, Removed from Block of Text</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+E</td>
      <td></td>
      <td>In an ObjectScript document, commands in a selection are replaced with their full names.</td>
      <td>With the InterSystems Language Server installed, you can <a href="../settings/#language-server">configure its formatter to expand command names</a> and then <a href="https://code.visualstudio.com/docs/editor/codebasics#_formatting">format some or all of your document</a>.</td>
    </tr>
    <tr>
      <td>Ctrl+Shift+E</td>
      <td></td>
      <td>Compress Commands</td>
      <td>With the InterSystems Language Server installed, you can <a href="../settings/#language-server">configure its formatter to contract command names</a> and then <a href="https://code.visualstudio.com/docs/editor/codebasics#_formatting">format some or all of your document</a>.</td>
    </tr>
  </tbody>
</table>

### Find and Replace

<table>
  <colgroup>
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 30%;">
      <col span="1" style="width: 40%;">
  </colgroup>
  <thead>
    <tr>
      <th>Studio</th>
      <th>VS Code</th>
      <th>Action</th>
      <th>VS Code Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ctrl+F, Ctrl+H</td>
      <td>Ctrl+F, Ctrl+H</td>
      <td>Find, Replace</td>
      <td></td>
    </tr>
    <tr>
      <td>F3, Shift+F3</td>
      <td>F3, Shift+F3</td>
      <td>Find Next, Previous</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Shift+F</td>
      <td>Ctrl+Shift+F, Ctrl+Shift+H</td>
      <td>Find, Replace in Files</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+, (comma)</td>
      <td>Ctrl+P</td>
      <td>Search for class</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Shift+G, Ctrl+&#8997;G</td>
      <td>&#8997;&#8680;| &#8997;&#8678;</td>
      <td><a
      href="https://docs.intersystems.com/iris20201/csp/docbook/DocBook.UI.Page.cls?KEY=GSTD_Commands#GSTD_Commands_Edit_Search"
      target="_new">Go To, Go Back</a></td>
      <td></td>
    </tr>
 </tbody>
</table>

### Bookmarks

<table>
  <colgroup>
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 30%;">
      <col span="1" style="width: 40%;">
  </colgroup>
  <thead>
    <tr>
      <th>Studio</th>
      <th>VS Code</th>
      <th>Action</th>
      <th>VS Code Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
    <td>Ctrl+F2</td>
    <td></td>
    <td>Toggle Bookmark on Current Line</td>
    <td><a href="https://marketplace.visualstudio.com/search?term=bookmark&amp;target=VSCode&amp;category=All%20categories&amp;sortBy=Relevance" target="_parent">Try a 3rd party extension</a></td>
    </tr>
    <tr>
      <td>F2, Shift+F2</td>
      <td></td>
      <td>Go to Next, Previous Bookmark</td>
      <td><a href="https://marketplace.visualstudio.com/search?term=bookmark&amp;target=VSCode&amp;category=All%20categories&amp;sortBy=Relevance" target="_parent">Try a 3rd party extension</a></td>
    </tr>
    <tr>
    <td>Ctrl+Shift+F2</td>
    <td></td>
    <td>Clear All Bookmarks</td>
      <td><a href="https://marketplace.visualstudio.com/search?term=bookmark&amp;target=VSCode&amp;category=All%20categories&amp;sortBy=Relevance" target="_parent">Try a 3rd party extension</a></td>
    </tr>  
  </tbody>
</table>

### Build and Compile

<table>
  <colgroup>
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 30%;">
      <col span="1" style="width: 40%;">
  </colgroup>
  <thead>
    <tr>
      <th>Studio</th>
      <th>VS Code</th>
      <th>Action</th>
      <th>VS Code Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>F7</td>
      <td>Ctrl+Shift+F7</td>
      <td>Rebuilds All Documents in Project</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+F7</td>
      <td>Ctrl+F7</td>
      <td>Compile Active Document</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Shift+F7</td>
      <td></td>
      <td>Compile with Options</td>
      <td>Execute the <code>Import and Compile Current File with Specified Flags...</code> from the command palette.</td>
    </tr>
    <tr>
      <td>F5</td>
      <td></td>
      <td>View as Web Page</td>
      <td></td>
    </tr>
  </tbody>
</table>

### Debugging

<table>
  <colgroup>
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 15%;">
      <col span="1" style="width: 30%;">
      <col span="1" style="width: 40%;">
  </colgroup>
  <thead>
    <tr>
      <th>Studio</th>
      <th>VS Code</th>
      <th>Action</th>
      <th>VS Code Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Ctrl+Shift+A</td>
      <td></td>
      <td>Debug Attach</td>
      <td>See <a href="../rundebug/#debug-configurations">the debugging documentation page</a> for how to debug a running process.</td>
    </tr>
    <tr>
      <td>F9</td>
      <td>F9</td>
      <td>Debug Toggle Breakpoint on Current Line</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+F5, Shift+F5</td>
      <td>F5, Shift+F5</td>
      <td>Debug Start, Stop</td>
      <td></td>
    </tr>
    <tr>
      <td>Ctrl+Shift+F5</td>
      <td>Ctrl+Shift+F5</td>
      <td>Debug Restart</td>
      <td></td>
    </tr>
    <tr>
      <td>F11, Shift+F11</td>
      <td>F11, Shift+F11</td>
      <td>Debug Step Into, Out</td>
      <td></td>
    </tr>
    <tr>
      <td>F10</td>
      <td>F10</td>
      <td>Debug Step Over</td>
      <td></td>
    </tr>
  </tbody>
</table>
