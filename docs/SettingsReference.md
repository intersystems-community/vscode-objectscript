---
layout: default
title: Settings Reference
permalink: /settings/
nav_order: 7
---

# Settings Reference

The extensions in the InterSystems ObjectScript Extension Pack provide many settings that allow you to configure their behavior. Below you will find a table containing all settings for each extension in the pack, as well as a short description, the type of value they accept, the default value and any other notes that may be useful to you. Please see [this VS Code documentation page](https://code.visualstudio.com/docs/getstarted/settings) for more information about settings and how to change them.

{: #language-server}
## InterSystems Language Server

| Setting | Description | Type | Default | Notes |
| ------- | ----------- | ---- | ------- | ----- |
| `"intersystems.language-server.diagnostics.classes"` | Controls whether error diagnostics are provided when a class that is being referred to doesn't exist in the database. | `boolean` | `true` | |
| `"intersystems.language-server.diagnostics.deprecation"` | Controls whether strikethrough warning diagnostics are provided when a class or class member that is being referred to is deprecated. | `boolean` | `true` | |
| `"intersystems.language-server.diagnostics.parameters"` | Controls whether warning diagnostics are provided when a class Parameter has an invalid type or the assigned value of the Parameter doesn't match the declared type. | `boolean` | `true` | |
| `"intersystems.language-server.diagnostics.routines"` | Controls whether error diagnostics are provided when a routine or include file that is being referred to doesn't exist in the database. | `boolean` | `false` | |
| `"intersystems.language-server.diagnostics.zutil"` | Controls whether diagnostics are provided when a deprecated or superseded `$ZUTIL` function is being called. | `boolean` | `true` | |
| `"intersystems.language-server.formatting.commands.case"` | Controls the case that ObjectScript commands will be changed to during a document formatting request. | `"upper"`, `"lower"` or `"word"` | `"word"` | |
| `"intersystems.language-server.formatting.commands.length"` | Controls the length that ObjectScript commands will be changed to during a document formatting request. | `"short"` or `"long"` | `"long"` | |
| `"intersystems.language-server.formatting.expandClassNames"` | Controls whether short class names will be expanded to include a package during a document formatting request. | `boolean` | `false` | |
| `"intersystems.language-server.formatting.system.case"` | Controls the case that ObjectScript system functions and variables will be changed to during a document formatting request. | `"upper"`, `"lower"` or `"word"` | `"upper"` | |
| `"intersystems.language-server.formatting.system.length"` | Controls the length that ObjectScript system functions and variables will be changed to during a document formatting request. | `"short"` or `"long"` | `"long"` | |
| `"intersystems.language-server.hover.commands"` | Controls whether hover information is provided for ObjectScript commands. | `boolean` | `true` | |
| `"intersystems.language-server.hover.preprocessor"` | Controls whether hover information is provided for ObjectScript preprocessor directives. | `boolean` | `true` | |
| `"intersystems.language-server.hover.system"` | Controls whether hover information is provided for ObjectScript system functions and variables. | `boolean` | `true` | |
| `"intersystems.language-server.refactor.exceptionVariable"` | The name of the exception variable inserted in a 'Wrap in Try/Catch' refactor. | `string` | `"ex"` | |
| `"intersystems.language-server.signaturehelp.documentation"` | Controls whether documentation for a method is shown when a SignatureHelp is active. | `boolean` | `true` | This setting does not affect documentation for macro SignatureHelp views, which is always shown. |
| `"intersystems.language-server.suggestTheme"` | Controls whether the extension will suggest that one of the InterSystems default themes be used if neither one is active upon extension activation. | `boolean` | `true` | |
| `"intersystems.language-server.trace.server"` | Traces the communication between VS Code and the language server. | `"off"`, `"messages"` or `"verbose"` | `"off"` | Any trace information will be logged to the `InterSystems Language Server` Output channel. |

{: #vscode-objectscript}
## InterSystems ObjectScript

| Setting | Description | Type | Default | Notes |
| ------- | ----------- | ---- | ------- | ----- |
| `"objectscript.autoPreviewXML"` | Automatically preview XML export files in UDL format. | `boolean` | `false` | |
| `"objectscript.autoShowTerminal"` | Automatically show terminal when connected to docker-compose. | `boolean` | `false` | |
| `"objectscript.compileFlags"` | Compilation flags. | `string` | `"cuk"` | Common compilation flags are ***b*** (compile dependent classes), ***k*** (keep generated source code) and ***u*** (skip related up-to-date documents). For descriptions of all available flags and qualifiers, click [here](https://docs.intersystems.com/irislatest/csp/docbook/Doc.View.cls?KEY=RCOS_vsystem#RCOS_vsystem_flags_qualifiers). |
| `"objectscript.compileOnSave"` | Automatically compile an InterSystems file when saved in the editor. | `boolean` | `true` | |
| `"objectscript.conn"` | Configures the active server connection. | `object` | `undefined` | See the [Configuration page](../configuration/#config-server-conn) for more details on configuring server connections. |
| `"objectscript.conn.ns"` | InterSystems server's namespace to use. | `string` | `undefined` | |
| `"objectscript.conn.active"` | Should the connection be active on startup. | `boolean` | `false` | |
| `"objectscript.conn.username"` | InterSystems server's user name. | `string` | `undefined` | |
| `"objectscript.conn.password"` | InterSystems server's password. | `string` | `undefined` | It's not recommended to specify your password in a config file except when you are using the default password |
| `"objectscript.conn.server"` | InterSystems server's name in Server Manager settings from which to get connection info. | `string` | `undefined` | Specify only `ns` and `active` when using this setting. See the [Server Manager README](https://github.com/intersystems-community/intersystems-servermanager) for more details. |
| `"objectscript.conn.docker-compose"` | Configures the active server port using information from a file which must be named `docker-compose.yml` in the project's root directory. | `object` | `undefined` | |
| `"objectscript.conn.docker-compose.service"` | InterSystems service's name in `docker-compose.yml`. | `string` | `undefined` | |
| `"objectscript.conn.docker-compose.internalPort"` | InterSystems service's internal port in `docker-compose.yml`. | `object` | `undefined` | This should almost always be 52773 unless your IRIS server is configured in a non-standard way |
| `"objectscript.debug.copyToClipboard"` | Show inline `Copy Invocation` CodeLens action for ClassMethods and Routine Labels. | `boolean` | `true` | |
| `"objectscript.debug.debugThisMethod"` | Show inline `Debug` CodeLens action for ClassMethods and Routine Labels. | `boolean` | `true` | |
| `"objectscript.explorer.alwaysShowServerCopy"` | Always show the server copy of a document in the ObjectScript Explorer. | `boolean` | `false` | |
| `"objectscript.export"` | Configures the files that the `Export Code from Server` command will export from the server to the local workspace folder. | `object` | `undefined` | |
| `"objectscript.export.addCategory"` | Add a category folder to the beginning of the export path. | `boolean` or `object` | `false` | |
| `"objectscript.export.atelier"` | Export source code as Atelier did it, with packages as subfolders. | `boolean` | `true` | This setting only affects classes, routines, include files and DFI files. |
| `"objectscript.export.category"` | Category of source code to export: `CLS` = classes; `RTN` = routines; `CSP` = csp files; `OTH` = other. Default is `*` = all. | `string` or `object` | `"*"` | |
| `"objectscript.export.dontExportIfNoChanges"` | Do not rewrite the local file if the content is identical to what came from the server. | `boolean` | `false` | |
| `"objectscript.export.exactFilter"` | SQL filter to limit what to export. | `string` | `""` | The filter is applied to document names using the [LIKE predicate](https://irisdocs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=RSQL_like) (i.e. `Name LIKE 'exactFilter'`). If provided, `objectscript.export.filter` is ignored. |
| `"objectscript.export.filter"` | SQL filter to limit what to export. | `string` | `""` | The filter is applied to document names using the [LIKE predicate](https://irisdocs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=RSQL_like) (i.e. `Name LIKE '%filter%'`). |
| `"objectscript.export.folder"` | Folder for exported source code within workspace. | `string` | `"src"` | This setting is relative to the workspace folder root. |
| `"objectscript.export.generated"` | Export generated source code files, such as INTs generated from classes. | `boolean` | `false` | |
| `"objectscript.export.map"` | Map file names before export, with regexp pattern as a key and replacement as a value. | `object` | `{}` | For example, `{  \"%(.*)\": \"_$1\" }` to make % classes or routines use underscore prefix instead. |
| `"objectscript.export.mapped"` | Export source code files mapped from a non-default database. | `boolean` | `true` | |
| `"objectscript.export.maxConcurrentConnections"` | Maximum number of concurrent export connections. | `number` | `0` | 0 = unlimited |
| `"objectscript.export.noStorage"` | Strip the storage definition on export. | `boolean` | `false` | Can be useful when working across multiple systems. |
| `"objectscript.format.commandCase"` | Case for commands. | `"upper"`, `"lower"` or `"word"` | `"word"` | Has no effect if the `InterSystems Language Server` extension is installed and enabled. |
| `"objectscript.format.functionCase"` | Case for system functions and system variables. | `"upper"`, `"lower"` or `"word"` | `"word"` | Has no effect if the `InterSystems Language Server` extension is installed and enabled. |
| `"objectscript.ignoreInstallServerManager"` | Do not offer to install the [intersystems-community.servermanager](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) extension. | `boolean` | `false` | |
| `"objectscript.importOnSave"` | Automatically save a client-side InterSystems file on the server when saved in the editor. | `boolean` | `true` | |
| `"objectscript.multilineMethodArgs"` | List method arguments on multiple lines, if the server supports it. | `boolean` | `false` | Only supported on IRIS 2019.1.2, 2020.1.1+, 2021.1.0+ and subsequent versions! On all other versions, this setting will have no effect. |
| `"objectscript.openClassContracted"` | Automatically collapse all class member folding ranges when a class is opened for the first time. | `boolean` | `false` | |
| `"objectscript.overwriteServerChanges"` | Overwrite a changed server version without confirmation when importing the local file. | `boolean` | `false` | |
| `"objectscript.projects.webAppFileExtensions"` | When browsing a virtual workspace folder that has a project query parameter, all files with these extensions will be automatically treated as web application files. Extensions added here will be appended to the default list and should **NOT** include a dot. | `string[]` | `[]` | Default extensions: `["csp","csr","ts","js","css","scss","sass","less","html","json","md","markdown","png","svg","jpeg","jpg","ico","xml","txt"]` |
| `"objectscript.serverSourceControl .disableOtherActionTriggers"` | Prevent server-side source control 'other action' triggers from firing. | `boolean` | `false` | |
| `"objectscript.showExplorer"` | Show the ObjectScript Explorer view. | `boolean` | `true` | |
| `"objectscript.showGeneratedFileDecorations"` | Controls whether a badge is shown in the file explorer and open editors view for generated files. | `boolean` | `true` | |
| `"objectscript.studioActionDebugOutput"` | Log in JSON format the action that VS Code should perform as requested by the server. | `boolean` | `false` | Actions will be logged to the `ObjectScript` Output channel. |
| `"objectscript.suppressCompileErrorMessages"` | Suppress popup messages about errors during compile, but still focus on Output view. | `boolean` | `false` | |
| `"objectscript.suppressCompileMessages"` | Suppress popup messages about successful compile. | `boolean` | `true` | |

{: #intersystems-servermanager}
## InterSystems Server Manager

| Setting | Description | Type | Default | Notes |
| ------- | ----------- | ---- | ------- | ----- |
| `"intersystems.servers"` | InterSystems servers that other extensions connect to. Each property of this object names a server and holds nested properties specifying how to connect to it. | `object` | `undefined` | See the [Configuration page](../configuration/#config-server) for more details on configuring servers. |
